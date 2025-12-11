import Anthropic from "@anthropic-ai/sdk";
import type {
    ContentBlock,
    MessageParam,
    TextBlock,
    ToolResultBlockParam,
    ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { ANTHROPIC_SYSTEM_PROMPT } from "./system-prompt";
import type {
    Provider,
    ToolCall,
    ThinkingBlock,
    TokenUsage,
    StreamCallbacks,
    Message,
    ToolResultInput,
    StreamOptions,
} from "./types";

export type {
    Provider,
    ToolSchema,
    ToolCall,
    ThinkingBlock,
    TokenUsage,
    StreamResult,
    StreamCallbacks,
    Message,
    ToolResultInput,
    ThinkingConfig,
    StreamOptions,
} from "./types";

export function createProvider(options?: { model?: string }): Provider {
    const client = new Anthropic({
        timeout: 10 * 60 * 1000,
    });
    const defaultModel = options?.model || "claude-sonnet-4-20250514";

    return {
        defaultModel,
        systemPrompt: ANTHROPIC_SYSTEM_PROMPT,

        async stream(
            messages: Message[],
            callbacks: StreamCallbacks,
            options?: StreamOptions
        ): Promise<void> {
            let fullText = "";
            const toolCalls: ToolCall[] = [];
            const thinkingBlocks: ThinkingBlock[] = [];
            let currentToolId = "";
            let currentToolName = "";
            let currentToolInput = "";
            let currentBlockType: "text" | "tool_use" | "thinking" | "redacted_thinking" | null =
                null;
            let currentThinkingText = "";
            let currentThinkingSignature = "";
            let currentRedactedData = "";
            let stopReason: string | null = null;
            let usage: TokenUsage | undefined;

            let modelToUse = options?.model || defaultModel;
            // Strip -thinking suffix for the actual API call - the thinking config is passed separately
            if (modelToUse.endsWith("-thinking")) {
                modelToUse = modelToUse.slice(0, -9);
            }
            const systemPrompt = options?.systemOverride || ANTHROPIC_SYSTEM_PROMPT;

            try {
                const apiMessages: MessageParam[] = messages.map((m) => {
                    if (typeof m.content === "string") {
                        return { role: m.role, content: m.content };
                    }
                    return { role: m.role, content: m.content as MessageParam["content"] };
                });

                const DEFAULT_MAX_TOKENS = 8192;
                const thinkingBudget = options?.thinking?.budget_tokens ?? 0;
                const maxTokens = Math.max(DEFAULT_MAX_TOKENS, thinkingBudget + 2048);

                const requestParams: Anthropic.MessageStreamParams = {
                    model: modelToUse,
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages: apiMessages,
                    tools: options?.tools?.map((t) => ({
                        name: t.name,
                        description: t.description,
                        input_schema: t.input_schema as Anthropic.Tool["input_schema"],
                    })),
                };

                if (options?.thinking) {
                    (requestParams as unknown as Record<string, unknown>).thinking =
                        options.thinking;
                }

                const stream = await client.messages.stream(requestParams, {
                    signal: options?.signal,
                });

                for await (const event of stream) {
                    if (options?.signal?.aborted) {
                        stream.controller.abort();
                        callbacks.onComplete({
                            text: fullText,
                            toolCalls,
                            thinkingBlocks,
                            stopReason: "cancelled",
                            usage,
                        });
                        return;
                    }
                    if (event.type === "content_block_start") {
                        const blockType = event.content_block.type;
                        if (blockType === "tool_use") {
                            currentBlockType = "tool_use";
                            currentToolId = event.content_block.id;
                            currentToolName = event.content_block.name;
                            currentToolInput = "";
                        } else if (blockType === "thinking") {
                            currentBlockType = "thinking";
                            currentThinkingText = "";
                            currentThinkingSignature = "";
                        } else if (blockType === "redacted_thinking") {
                            currentBlockType = "redacted_thinking";
                            currentRedactedData =
                                (event.content_block as { data?: string }).data || "";
                        } else if (blockType === "text") {
                            currentBlockType = "text";
                        }
                    } else if (event.type === "content_block_delta") {
                        const delta = event.delta as {
                            type: string;
                            text?: string;
                            partial_json?: string;
                            thinking?: string;
                            signature?: string;
                        };
                        if (delta.type === "text_delta" && delta.text) {
                            fullText += delta.text;
                            callbacks.onChunk(delta.text);
                        } else if (delta.type === "input_json_delta" && delta.partial_json) {
                            currentToolInput += delta.partial_json;
                        } else if (delta.type === "thinking_delta" && delta.thinking) {
                            currentThinkingText += delta.thinking;
                            callbacks.onThinking?.(delta.thinking);
                        } else if (delta.type === "signature_delta" && delta.signature) {
                            currentThinkingSignature += delta.signature;
                        }
                    } else if (event.type === "content_block_stop") {
                        if (currentBlockType === "tool_use" && currentToolId && currentToolName) {
                            let parsedInput: unknown;
                            try {
                                parsedInput = JSON.parse(currentToolInput || "{}");
                            } catch {
                                parsedInput = {};
                            }
                            const toolCall: ToolCall = {
                                id: currentToolId,
                                name: currentToolName,
                                input: parsedInput,
                            };
                            toolCalls.push(toolCall);
                            callbacks.onToolCall?.(toolCall);
                            currentToolId = "";
                            currentToolName = "";
                            currentToolInput = "";
                        } else if (currentBlockType === "thinking") {
                            thinkingBlocks.push({
                                type: "thinking",
                                thinking: currentThinkingText,
                                signature: currentThinkingSignature,
                            });
                            currentThinkingText = "";
                            currentThinkingSignature = "";
                        } else if (currentBlockType === "redacted_thinking") {
                            thinkingBlocks.push({
                                type: "redacted_thinking",
                                signature: "",
                                data: currentRedactedData,
                            });
                            currentRedactedData = "";
                        }
                        currentBlockType = null;
                    } else if (event.type === "message_delta") {
                        if (event.delta.stop_reason) {
                            stopReason = event.delta.stop_reason;
                        }
                        const eventUsage = (
                            event as unknown as {
                                usage?: {
                                    output_tokens?: number;
                                    input_tokens?: number;
                                    cache_read_input_tokens?: number;
                                    cache_creation_input_tokens?: number;
                                };
                            }
                        ).usage;
                        if (eventUsage) {
                            usage = {
                                inputTokens: eventUsage.input_tokens ?? 0,
                                outputTokens: eventUsage.output_tokens ?? 0,
                                cacheReadTokens: eventUsage.cache_read_input_tokens,
                                cacheWriteTokens: eventUsage.cache_creation_input_tokens,
                            };
                        }
                    } else if (event.type === "message_start") {
                        const msg = (
                            event as unknown as {
                                message?: {
                                    usage?: {
                                        input_tokens?: number;
                                        output_tokens?: number;
                                        cache_read_input_tokens?: number;
                                        cache_creation_input_tokens?: number;
                                    };
                                };
                            }
                        ).message;
                        if (msg?.usage) {
                            usage = {
                                inputTokens: msg.usage.input_tokens ?? 0,
                                outputTokens: msg.usage.output_tokens ?? 0,
                                cacheReadTokens: msg.usage.cache_read_input_tokens,
                                cacheWriteTokens: msg.usage.cache_creation_input_tokens,
                            };
                        }
                    }
                }

                if (currentToolId && currentToolName) {
                    throw new Error("Stream ended with incomplete tool call - possible timeout");
                }

                callbacks.onComplete({
                    text: fullText,
                    toolCalls,
                    thinkingBlocks,
                    stopReason,
                    usage,
                });
            } catch (err) {
                callbacks.onError(err instanceof Error ? err : new Error(String(err)));
            }
        },

        buildToolResultMessage(results: ToolResultInput[]): Message {
            const content: ToolResultBlockParam[] = results.map((r) => ({
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
            thinkingBlocks?: ThinkingBlock[]
        ): Message {
            const content: ContentBlock[] = [];
            if (thinkingBlocks) {
                for (const tb of thinkingBlocks) {
                    if (tb.type === "thinking") {
                        content.push({
                            type: "thinking",
                            thinking: tb.thinking || "",
                            signature: tb.signature,
                        } as unknown as ContentBlock);
                    } else if (tb.type === "redacted_thinking") {
                        content.push({
                            type: "redacted_thinking",
                            data: tb.data || "",
                        } as unknown as ContentBlock);
                    }
                }
            }
            if (text) {
                content.push({ type: "text", text } as TextBlock);
            }
            for (const tc of toolCalls) {
                content.push({
                    type: "tool_use",
                    id: tc.id,
                    name: tc.name,
                    input: tc.input,
                } as ToolUseBlock);
            }
            return { role: "assistant", content };
        },
    };
}
