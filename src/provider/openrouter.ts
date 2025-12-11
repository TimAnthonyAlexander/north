import type {
    Provider,
    Message,
    StreamCallbacks,
    StreamOptions,
    ToolCall,
    ToolResultInput,
    ToolSchema,
    ThinkingBlock,
    TokenUsage,
} from "./types";
import { OPENAI_SYSTEM_PROMPT } from "./system-prompt";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/responses";
const OPENROUTER_REFERER = "https://north-cli.dev";
const OPENROUTER_TITLE = "North";

interface OpenRouterInputItem {
    type?: string;
    role?: "user" | "assistant" | "system";
    content?: string | OpenRouterContentBlock[];
    call_id?: string;
    name?: string;
    arguments?: string;
    output?: string;
}

interface OpenRouterContentBlock {
    type: string;
    text?: string;
}

export interface OpenRouterTool {
    type: "function";
    name: string;
    description?: string;
    parameters: unknown;
}

interface OpenRouterOutputItem {
    type: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    role?: string;
    status?: string;
    content?: OpenRouterContentBlock[];
}

interface OpenRouterStreamEvent {
    type: string;
    sequence_number?: number;
    item_id?: string;
    output_index?: number;
    content_index?: number;
    delta?: string;
    text?: string;
    name?: string;
    arguments?: string;
    item?: OpenRouterOutputItem;
    response?: {
        id: string;
        status: string;
        output?: OpenRouterOutputItem[];
        usage?: {
            input_tokens: number;
            output_tokens: number;
            total_tokens: number;
            input_tokens_details?: {
                cached_tokens?: number;
            };
            output_tokens_details?: {
                reasoning_tokens?: number;
            };
        };
    };
    error?: {
        message: string;
        type: string;
        code: string;
    };
}

function normalizeForOpenRouterTools(schema: unknown): unknown {
    if (!schema || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map(normalizeForOpenRouterTools);

    const s = schema as Record<string, unknown>;

    if (s.type === "object" || "properties" in s) {
        const props = (s.properties ?? {}) as Record<string, unknown>;
        const normalizedProps: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
            normalizedProps[k] = normalizeForOpenRouterTools(v);
        }
        return {
            ...s,
            type: "object",
            properties: normalizedProps,
            additionalProperties: false,
        };
    }

    if (s.type === "array" && s.items) {
        return { ...s, items: normalizeForOpenRouterTools(s.items) };
    }

    return s;
}

export function convertToolsToOpenRouter(tools: ToolSchema[]): OpenRouterTool[] {
    return tools.map((t) => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: normalizeForOpenRouterTools(t.input_schema),
    }));
}

function convertMessagesToOpenRouter(messages: Message[]): OpenRouterInputItem[] {
    const items: OpenRouterInputItem[] = [];

    for (const msg of messages) {
        if (typeof msg.content === "string") {
            items.push({ role: msg.role, content: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if ("type" in block) {
                    if (block.type === "text" && "text" in block) {
                        items.push({ role: msg.role, content: block.text as string });
                    } else if (block.type === "tool_use" && "id" in block && "name" in block) {
                        items.push({
                            type: "function_call",
                            call_id: block.id as string,
                            name: block.name as string,
                            arguments:
                                typeof block.input === "string"
                                    ? block.input
                                    : JSON.stringify(block.input),
                        });
                    } else if (block.type === "tool_result" && "tool_use_id" in block) {
                        const content =
                            typeof block.content === "string"
                                ? block.content
                                : JSON.stringify(block.content);
                        items.push({
                            type: "function_call_output",
                            call_id: block.tool_use_id as string,
                            output: content,
                        });
                    }
                }
            }
        }
    }

    return items;
}

interface ToolCallInProgress {
    id: string;
    name: string;
    arguments: string;
}

async function parseSSEStream(
    response: Response,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
): Promise<{
    text: string;
    toolCalls: ToolCall[];
    thinkingBlocks: ThinkingBlock[];
    stopReason: string | null;
    usage?: TokenUsage;
}> {
    let fullText = "";
    const toolCalls: ToolCall[] = [];
    const thinkingBlocks: ThinkingBlock[] = [];
    let stopReason: string | null = null;
    let usage: TokenUsage | undefined;

    const toolCallsInProgress = new Map<string, ToolCallInProgress>();

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            if (signal?.aborted) {
                reader.cancel();
                return {
                    text: fullText,
                    toolCalls,
                    thinkingBlocks,
                    stopReason: "cancelled",
                    usage,
                };
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim() || line.startsWith(":")) continue;

                if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim();

                    try {
                        const event: OpenRouterStreamEvent = JSON.parse(data);

                        switch (event.type) {
                            case "response.output_text.delta":
                                if (event.delta) {
                                    fullText += event.delta;
                                    callbacks.onChunk(event.delta);
                                }
                                break;

                            case "response.output_item.added":
                                if (event.item?.type === "function_call" && event.item.id) {
                                    toolCallsInProgress.set(event.item.id, {
                                        id: event.item.id,
                                        name: event.item.name || "",
                                        arguments: event.item.arguments || "",
                                    });
                                }
                                break;

                            case "response.function_call_arguments.delta":
                                if (event.item_id && event.delta) {
                                    const existing = toolCallsInProgress.get(event.item_id);
                                    if (existing) {
                                        existing.arguments += event.delta;
                                    } else {
                                        toolCallsInProgress.set(event.item_id, {
                                            id: event.item_id,
                                            name: "",
                                            arguments: event.delta,
                                        });
                                    }
                                }
                                break;

                            case "response.function_call_arguments.done":
                                if (event.item_id) {
                                    const existing = toolCallsInProgress.get(event.item_id);
                                    if (existing) {
                                        if (event.name) existing.name = event.name;
                                        if (event.arguments) existing.arguments = event.arguments;

                                        let parsedInput: unknown = {};
                                        try {
                                            parsedInput = JSON.parse(existing.arguments || "{}");
                                        } catch {
                                            // JSON parsing failed
                                        }

                                        const toolCall: ToolCall = {
                                            id: existing.id,
                                            name: existing.name,
                                            input: parsedInput,
                                        };

                                        if (!toolCalls.some((tc) => tc.id === toolCall.id)) {
                                            toolCalls.push(toolCall);
                                            callbacks.onToolCall?.(toolCall);
                                        }
                                    }
                                }
                                break;

                            case "response.completed":
                                if (event.response?.output) {
                                    for (const item of event.response.output) {
                                        if (item.type === "function_call" && item.id) {
                                            if (!toolCalls.some((tc) => tc.id === item.id)) {
                                                let parsedInput: unknown = {};
                                                try {
                                                    parsedInput = JSON.parse(
                                                        item.arguments || "{}"
                                                    );
                                                } catch {
                                                    // JSON parsing failed
                                                }
                                                const toolCall: ToolCall = {
                                                    id: item.id,
                                                    name: item.name || "",
                                                    input: parsedInput,
                                                };
                                                toolCalls.push(toolCall);
                                                callbacks.onToolCall?.(toolCall);
                                            }
                                        } else if (item.type === "message" && item.content) {
                                            for (const contentBlock of item.content) {
                                                if (
                                                    contentBlock.type === "output_text" &&
                                                    contentBlock.text &&
                                                    !fullText
                                                ) {
                                                    fullText = contentBlock.text;
                                                }
                                            }
                                        }
                                    }
                                }
                                if (event.response?.usage) {
                                    const cachedTokens =
                                        event.response.usage.input_tokens_details?.cached_tokens;
                                    usage = {
                                        inputTokens: event.response.usage.input_tokens,
                                        outputTokens: event.response.usage.output_tokens,
                                        cachedInputTokens: cachedTokens,
                                    };
                                }

                                stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";
                                break;

                            case "response.failed": {
                                const errorMsg =
                                    event.error?.message ||
                                    event.response?.status ||
                                    "Response failed";
                                throw new Error(errorMsg);
                            }

                            case "response.incomplete":
                                stopReason = "end_turn";
                                break;

                            case "error":
                                throw new Error(event.error?.message || "Unknown error");

                            default:
                                break;
                        }
                    } catch (err) {
                        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
                        return { text: fullText, toolCalls, thinkingBlocks, stopReason, usage };
                    }
                }
            }
        }
    } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        return { text: fullText, toolCalls, thinkingBlocks, stopReason, usage };
    }

    if (stopReason === null) {
        stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";
    }

    return { text: fullText, toolCalls, thinkingBlocks, stopReason, usage };
}

export function createOpenRouterProvider(options?: { model?: string }): Provider {
    const defaultModel = options?.model || "openai/gpt-5.1";

    return {
        defaultModel,
        systemPrompt: OPENAI_SYSTEM_PROMPT,

        async stream(
            messages: Message[],
            callbacks: StreamCallbacks,
            options?: StreamOptions
        ): Promise<void> {
            let modelToUse = options?.model || defaultModel;
            // Strip -thinking suffix if present (not currently used for OpenRouter)
            if (modelToUse.endsWith("-thinking")) {
                modelToUse = modelToUse.slice(0, -9);
            }
            const systemPrompt = options?.systemOverride || OPENAI_SYSTEM_PROMPT;

            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                callbacks.onError(new Error("OPENROUTER_API_KEY environment variable is not set"));
                return;
            }

            const inputItems = convertMessagesToOpenRouter(messages);
            const tools = options?.tools ? convertToolsToOpenRouter(options.tools) : undefined;

            const requestBody: Record<string, unknown> = {
                model: modelToUse,
                instructions: systemPrompt,
                input: inputItems,
                stream: true,
                tool_choice: tools && tools.length > 0 ? "auto" : undefined,
                tools: tools && tools.length > 0 ? tools : undefined,
                parallel_tool_calls: true,
            };

            try {
                const timeoutMs = 10 * 60 * 1000;
                const timeoutSignal = AbortSignal.timeout(timeoutMs);
                const combinedSignal = options?.signal
                    ? AbortSignal.any([options.signal, timeoutSignal])
                    : timeoutSignal;

                const response = await fetch(OPENROUTER_API_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                        "HTTP-Referer": OPENROUTER_REFERER,
                        "X-Title": OPENROUTER_TITLE,
                    },
                    body: JSON.stringify(requestBody),
                    signal: combinedSignal,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = `OpenRouter API error: ${response.status}`;
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.error?.message || errorMessage;
                    } catch {
                        errorMessage = errorText || errorMessage;
                    }
                    callbacks.onError(new Error(errorMessage));
                    return;
                }

                const result = await parseSSEStream(response, callbacks, options?.signal);
                callbacks.onComplete(result);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    callbacks.onComplete({
                        text: "",
                        toolCalls: [],
                        thinkingBlocks: [],
                        stopReason: "cancelled",
                        usage: undefined,
                    });
                    return;
                }
                callbacks.onError(err instanceof Error ? err : new Error(String(err)));
            }
        },

        buildToolResultMessage(results: ToolResultInput[]): Message {
            const content = results.map((r) => ({
                type: "tool_result" as const,
                tool_use_id: r.toolCallId,
                content: r.result,
                is_error: r.isError,
            }));
            return { role: "user", content };
        },

        buildAssistantMessage(
            text: string,
            toolCalls: ToolCall[],
            _thinkingBlocks?: ThinkingBlock[]
        ): Message {
            const content: Array<{
                type: string;
                text?: string;
                id?: string;
                name?: string;
                input?: unknown;
            }> = [];
            if (text) {
                content.push({ type: "text", text });
            }
            for (const tc of toolCalls) {
                content.push({
                    type: "tool_use",
                    id: tc.id,
                    name: tc.name,
                    input: tc.input,
                });
            }
            return { role: "assistant", content: content as Message["content"] };
        },
    };
}
