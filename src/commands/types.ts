export interface Span {
    start: number;
    end: number;
}

export interface ParsedArgs {
    positional: string[];
    flags: Record<string, string | boolean>;
}

export interface ParsedCommand {
    name: string;
    args: ParsedArgs;
    span: Span;
    nameSpan: Span;
    argsSpan?: Span;
}

export interface ParseResult {
    invocations: ParsedCommand[];
    remainingText: string;
}

export interface StructuredSummary {
    goal: string;
    decisions: string[];
    constraints: string[];
    openTasks: string[];
    importantFiles: string[];
}

export type Mode = "ask" | "agent";

export interface PickerOption {
    id: string;
    label: string;
    hint?: string;
}

export interface ConversationInfo {
    id: string;
    repoRoot: string;
    lastActiveAt: number;
    previewText: string;
}

export interface CommandContext {
    repoRoot: string;
    setModel: (modelId: string) => void;
    getModel: () => string;
    resetChat: () => void;
    setRollingSummary: (summary: StructuredSummary | null) => void;
    getRollingSummary: () => StructuredSummary | null;
    generateSummary: () => Promise<StructuredSummary | null>;
    trimTranscript: (keepLast: number) => void;
    requestExit: () => void;
    showPicker: (
        commandName: string,
        prompt: string,
        options: PickerOption[]
    ) => Promise<string | null>;
    getTranscript: () => unknown[];
    listCommands: () => CommandDefinition[];
    triggerLearning: () => void;
    getConversationId: () => string;
    listRecentConversations: (limit?: number) => ConversationInfo[];
    switchConversation: (id: string) => Promise<{ ok: boolean; error?: string }>;
    setThinking: (enabled: boolean) => void;
    isThinkingEnabled: () => boolean;
}

export interface CommandResult {
    ok: boolean;
    message?: string;
    error?: string;
}

export interface CommandDefinition {
    name: string;
    description: string;
    usage: string;
    execute: (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>;
}

export type CommandReviewStatus = "pending" | "selected" | "cancelled";

export interface CommandReviewEntry {
    id: string;
    role: "command_review";
    ts: number;
    commandName: string;
    prompt: string;
    options: PickerOption[];
    reviewStatus: CommandReviewStatus;
    selectedId?: string;
}

export interface CommandExecutedEntry {
    id: string;
    role: "command_executed";
    ts: number;
    commandName: string;
    summary: string;
}
