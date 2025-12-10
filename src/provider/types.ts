import type { ToolInputSchema } from "../tools/types";

export interface ToolSchema {
    name: string;
    description: string;
    input_schema: ToolInputSchema;
}

export interface ToolCall {
    id: string;
    name: string;
    input: unknown;
}

export interface ThinkingBlock {
    type: "thinking" | "redacted_thinking";
    thinking?: string;
    signature: string;
    data?: string;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cachedInputTokens?: number;
}

export interface StreamResult {
    text: string;
    toolCalls: ToolCall[];
    thinkingBlocks: ThinkingBlock[];
    stopReason: string | null;
    usage?: TokenUsage;
}

export interface StreamCallbacks {
    onChunk: (chunk: string) => void;
    onToolCall?: (toolCall: ToolCall) => void;
    onThinking?: (chunk: string) => void;
    onComplete: (result: StreamResult) => void;
    onError: (error: Error) => void;
}

export interface TextContentBlock {
    type: "text";
    text: string;
}

export interface ToolUseContentBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: unknown;
}

export interface ToolResultContentBlock {
    type: "tool_result";
    tool_use_id: string;
    content?: string | unknown;
    is_error?: boolean;
}

export interface ThinkingContentBlock {
    type: "thinking";
    thinking: string;
    signature: string;
}

export interface RedactedThinkingContentBlock {
    type: "redacted_thinking";
    data: string;
}

export type MessageContentBlock =
    | TextContentBlock
    | ToolUseContentBlock
    | ToolResultContentBlock
    | ThinkingContentBlock
    | RedactedThinkingContentBlock;

export interface Message {
    role: "user" | "assistant";
    content: string | MessageContentBlock[];
}

export interface ToolResultInput {
    toolCallId: string;
    result: string;
    isError?: boolean;
}

export interface ThinkingConfig {
    type: "enabled";
    budget_tokens: number;
}

export interface StreamOptions {
    tools?: ToolSchema[];
    model?: string;
    systemOverride?: string;
    signal?: AbortSignal;
    thinking?: ThinkingConfig;
}

export interface Provider {
    defaultModel: string;
    systemPrompt: string;
    stream(messages: Message[], callbacks: StreamCallbacks, options?: StreamOptions): Promise<void>;
    buildToolResultMessage(results: ToolResultInput[]): Message;
    buildAssistantMessage(
        text: string,
        toolCalls: ToolCall[],
        thinkingBlocks?: ThinkingBlock[]
    ): Message;
}
