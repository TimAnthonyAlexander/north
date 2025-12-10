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
    aroundMatch?: string;
    windowLines?: number;
    includeHeadTail?: boolean;
}

export interface ReadFileOutput {
    path: string;
    content: string;
    startLine: number;
    endLine: number;
    truncated: boolean;
    totalLines?: number;
    matchLine?: number;
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

export interface ExpandOutputInput {
    outputId: string;
    range?: {
        start: number;
        end: number;
    };
}

export interface ExpandOutputOutput {
    outputId: string;
    content: string;
    toolName: string;
    rangeApplied: boolean;
}

export interface FindCodeBlockInput {
    path: string;
    query: string;
    kind?: "function" | "class" | "method" | "block" | "any";
}

export interface CodeBlockMatch {
    startLine: number;
    endLine: number;
    snippet: string;
    kind: string;
    name?: string;
}

export interface FindCodeBlockOutput {
    path: string;
    found: boolean;
    matches: CodeBlockMatch[];
    totalMatches: number;
}

export interface EditAfterAnchorInput {
    path: string;
    anchor: string;
    content: string;
    occurrence?: number;
}

export interface EditBeforeAnchorInput {
    path: string;
    anchor: string;
    content: string;
    occurrence?: number;
}

export interface EditReplaceBlockInput {
    path: string;
    blockStart: string;
    blockEnd: string;
    content: string;
    inclusive?: boolean;
}

export interface AnchorCandidate {
    line: number;
    preview: string;
}

export interface ReadAroundInput {
    path: string;
    anchor: string;
    before?: number;
    after?: number;
    occurrence?: number;
}

export interface ReadAroundOutput {
    path: string;
    totalLines: number;
    matchCount: number;
    occurrenceUsed: number;
    matchLine: number;
    startLine: number;
    endLine: number;
    content: string;
}

export interface FindBlocksInput {
    path: string;
    kind?: "html_section" | "css_rule" | "js_ts_symbol" | "all";
}

export interface BlockEntry {
    id: string;
    label: string;
    startLine: number;
    endLine: number;
}

export interface FindBlocksOutput {
    path: string;
    totalLines: number;
    blocks: BlockEntry[];
}

export interface EditByAnchorInput {
    path: string;
    mode: "insert_before" | "insert_after" | "replace_line" | "replace_between";
    anchor: string;
    anchorEnd?: string;
    content: string;
    occurrence?: number;
    inclusive?: boolean;
}
