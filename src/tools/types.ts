import type { Logger } from "../logging/index";

export type ApprovalPolicy = "none" | "write" | "shell";

export interface ToolContext {
    repoRoot: string;
    logger: Logger;
}

export interface ToolInputSchema {
    type: "object";
    properties: Record<
        string,
        {
            type: string | string[];
            description: string;
            items?: {
                type: string;
                properties?: Record<string, { type: string; description: string }>;
            };
            properties?: Record<string, unknown>;
        }
    >;
    required?: string[];
}

export interface ToolResult<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    approvalPolicy?: ApprovalPolicy;
    execute(args: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

export interface ListRootOutput {
    entries: Array<{ name: string; type: "file" | "dir" }>;
}

export interface FindFilesInput {
    pattern: string;
    limit?: number;
}

export interface FindFilesOutput {
    files: string[];
    truncated: boolean;
}

export interface SearchTextInput {
    query: string;
    path?: string;
    file?: string;
    lineRange?: { start: number; end: number };
    regex?: boolean;
    limit?: number;
}

export interface SearchMatch {
    path: string;
    line: number;
    column: number;
    preview: string;
}

export interface SearchTextOutput {
    matches: SearchMatch[];
    truncated: boolean;
}

export interface ReadFileInput {
    path: string;
    range?: { start: number; end: number };
    includeContext?: "imports" | "full";
}

export interface ReadFileOutput {
    path: string;
    content: string;
    startLine: number;
    endLine: number;
    truncated: boolean;
}

export interface ReadReadmeOutput {
    path: string;
    content: string;
    truncated: boolean;
}

export interface LanguageEntry {
    language: string;
    bytes: number;
    percent: number;
}

export interface DetectLanguagesOutput {
    languages: LanguageEntry[];
}

export interface HotfilesInput {
    limit?: number;
}

export interface HotfileEntry {
    path: string;
    score: number;
    reason: string;
}

export interface HotfilesOutput {
    files: HotfileEntry[];
    method: "git" | "fallback";
}

export interface EditOperation {
    type: "replace" | "create";
    path: string;
    content: string;
    originalContent?: string;
}

export interface FileDiff {
    path: string;
    diff: string;
    linesAdded: number;
    linesRemoved: number;
}

export interface EditPrepareResult {
    diffsByFile: FileDiff[];
    applyPayload: EditOperation[];
    stats: {
        filesChanged: number;
        totalLinesAdded: number;
        totalLinesRemoved: number;
    };
}

export interface EditReplaceExactInput {
    path: string;
    old: string;
    new: string;
    expectedOccurrences?: number;
}

export interface EditInsertAtLineInput {
    path: string;
    line: number;
    content: string;
}

export interface EditCreateFileInput {
    path: string;
    content: string;
    overwrite?: boolean;
}

export interface EditBatchInput {
    edits: Array<{
        toolName: string;
        args: unknown;
    }>;
}

export interface ShellRunInput {
    command: string;
    cwd?: string | null;
    timeoutMs?: number;
}

export interface ShellRunOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    denied?: boolean;
}

export interface GetLineCountInput {
    path: string;
}

export interface GetLineCountOutput {
    path: string;
    lineCount: number;
    sizeBytes: number;
    willTruncate: boolean;
}

export interface FileSymbol {
    name: string;
    type: "function" | "class" | "interface" | "type" | "const" | "enum" | "method";
    line: number;
    signature: string;
    parentSymbol?: string;
}

export interface GetFileSymbolsInput {
    path: string;
}

export interface GetFileSymbolsOutput {
    path: string;
    language: string | null;
    symbols: FileSymbol[];
}

export interface OutlineSection {
    type: "imports" | "exports" | "symbol" | "other";
    name: string;
    startLine: number;
    endLine: number;
    children?: OutlineSection[];
}

export interface GetFileOutlineInput {
    path: string;
}

export interface GetFileOutlineOutput {
    path: string;
    language: string | null;
    sections: OutlineSection[];
}
