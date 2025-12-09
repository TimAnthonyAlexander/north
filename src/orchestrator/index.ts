import {
    createProviderForModel,
    type Provider,
    type Message,
    type ToolCall,
    type ToolSchema,
} from "../provider/index";
import { createToolRegistryWithAllTools, filterToolsForMode } from "../tools/index";
import type { Logger } from "../logging/index";
import type { FileDiff, EditPrepareResult, ShellRunInput, EditOperation } from "../tools/types";
import { applyEditsAtomically } from "../utils/editing";
import { isCommandAllowed, allowCommand } from "../storage/allowlist";
import {
    isEditsAutoAcceptEnabled,
    enableEditsAutoAccept,
    isShellAutoApproveEnabled,
    enableShellAutoApprove,
} from "../storage/autoaccept";
import { saveProfile } from "../storage/profile";
import { getShellService } from "../shell/index";
import {
    createCommandRegistryWithAllCommands,
    parseCommandInvocations,
    type CommandRegistry,
    type CommandContext,
    type StructuredSummary,
    type PickerOption,
    type CommandReviewStatus,
    type Mode,
} from "../commands/index";
import { DEFAULT_MODEL, getModelContextLimit } from "../commands/models";
import { getSavedModel } from "../storage/config";
import { estimatePromptTokens } from "../utils/tokens";
import { isRetryableError, calculateBackoff, sleep, DEFAULT_RETRY_CONFIG } from "../utils/retry";
import { runLearningSession } from "../profile/learn";
import * as path from "node:path";

export type ShellReviewStatus = "pending" | "ran" | "always" | "auto" | "denied";
export type WriteReviewStatus = "pending" | "accepted" | "always" | "rejected";
export type ReviewStatus = WriteReviewStatus | ShellReviewStatus;
export type { CommandReviewStatus };

export type LearningPromptStatus = "pending" | "accepted" | "declined";

export interface TranscriptEntry {
    id: string;
    role:
        | "user"
        | "assistant"
        | "tool"
        | "diff_review"
        | "shell_review"
        | "command_review"
        | "command_executed"
        | "learning_prompt"
        | "learning_progress";
    content: string;
    ts: number;
    isStreaming?: boolean;
    toolResult?: { ok: boolean; data?: unknown; error?: string };
    diffContent?: FileDiff[];
    filesCount?: number;
    toolName?: string;
    reviewStatus?: ReviewStatus | CommandReviewStatus;
    applyPayload?: EditOperation[];
    shellCommand?: string;
    shellCwd?: string | null;
    shellTimeoutMs?: number | null;
    commandName?: string;
    commandPrompt?: string;
    commandOptions?: PickerOption[];
    commandSelectedId?: string;
    toolCallId?: string;
    shellResult?: { ok: boolean; data?: unknown; error?: string };
    learningPromptStatus?: LearningPromptStatus;
    learningPercent?: number;
    learningTopic?: string;
}

export interface OrchestratorState {
    transcript: TranscriptEntry[];
    isProcessing: boolean;
    pendingReviewId: string | null;
    currentModel: string;
    contextUsedTokens: number;
    contextLimitTokens: number;
    contextUsage: number;
    learningPromptId: string | null;
    learningInProgress: boolean;
    learningPercent: number;
    learningTopic: string;
}

export interface OrchestratorCallbacks {
    onStateChange: (state: OrchestratorState) => void;
    onRequestStart?: (requestId: string, model: string) => void;
    onRequestComplete?: (requestId: string, durationMs: number, error?: Error) => void;
    onToolCallStart?: (toolName: string, args: unknown) => void;
    onToolCallComplete?: (toolName: string, durationMs: number, ok: boolean) => void;
    onWriteReviewShown?: (filesCount: number, toolName: string) => void;
    onWriteReviewDecision?: (decision: "accept" | "reject", filesCount: number) => void;
    onWriteApplyStart?: () => void;
    onWriteApplyComplete?: (durationMs: number, ok: boolean) => void;
    onShellReviewShown?: (command: string, cwd?: string | null, timeoutMs?: number | null) => void;
    onShellReviewDecision?: (decision: "run" | "always" | "auto" | "deny", command: string) => void;
    onShellRunStart?: (command: string, cwd?: string | null, timeoutMs?: number | null) => void;
    onShellRunComplete?: (
        command: string,
        exitCode: number,
        durationMs: number,
        stdoutBytes: number,
        stderrBytes: number
    ) => void;
    onExit?: () => void;
}

export interface OrchestratorContext {
    repoRoot: string;
    logger: Logger;
    cursorRulesText: string | null;
    projectProfileText: string | null;
}

export type ShellDecision = "run" | "always" | "auto" | "deny";
export type CommandDecision = string | null;
export type WriteDecision = "accept" | "always" | "reject";

export type LearningDecision = "accept" | "decline";

export interface Orchestrator {
    sendMessage(content: string, mode: Mode): Promise<void>;
    resolveWriteReview(reviewId: string, decision: WriteDecision): void;
    resolveShellReview(reviewId: string, decision: ShellDecision): void;
    resolveCommandReview(reviewId: string, decision: CommandDecision): void;
    resolveLearningPrompt(reviewId: string, decision: LearningDecision): void;
    startLearningSession(): Promise<void>;
    getModel(): string;
    getCommandRegistry(): CommandRegistry;
    cancel(): void;
    stop(): void;
    isProcessing(): boolean;
}

interface PendingWriteReview {
    id: string;
    resolve: (decision: WriteDecision) => void;
    filesCount: number;
    applyPayload: unknown;
}

interface PendingShellReview {
    id: string;
    resolve: (decision: ShellDecision) => void;
    command: string;
    cwd?: string;
}

interface PendingCommandReview {
    id: string;
    resolve: (decision: CommandDecision) => void;
}

interface PendingLearningPrompt {
    id: string;
    resolve: (decision: LearningDecision) => void;
}

const STREAM_THROTTLE_MS = 32;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatToolNameForDisplay(toolName: string, args: unknown): string {
    const basename = (filePath: string) => path.basename(filePath);

    switch (toolName) {
        case "list_root":
            return "Listing project files";
        case "find_files": {
            const { pattern } = args as { pattern?: string };
            return pattern ? `Finding ${pattern}` : "Finding files";
        }
        case "read_file": {
            const { path: filePath } = args as { path?: string };
            return filePath ? `Reading ${basename(filePath)}` : "Reading file";
        }
        case "edit_replace_exact":
        case "edit_insert_at_line": {
            const { path: filePath } = args as { path?: string };
            return filePath ? `Editing ${basename(filePath)}` : "Editing file";
        }
        case "edit_create_file": {
            const { path: filePath } = args as { path?: string };
            return filePath ? `Creating ${basename(filePath)}` : "Creating file";
        }
        case "edit_apply_batch": {
            const { edits } = args as { edits?: Array<{ toolName: string; args: unknown }> };
            const count = edits?.length || 0;
            if (count === 1 && edits?.[0]) {
                return formatToolNameForDisplay(edits[0].toolName, edits[0].args);
            }
            return count > 1 ? `Editing ${count} files` : "Editing files";
        }
        default:
            return toolName;
    }
}

function formatSummaryForContext(summary: StructuredSummary): string {
    const lines: string[] = ["## Conversation Summary (authoritative, replace older context)"];

    if (summary.goal) {
        lines.push(`**Goal:** ${summary.goal}`);
    }
    if (summary.decisions.length > 0) {
        lines.push("**Decisions:**");
        summary.decisions.forEach((d) => lines.push(`- ${d}`));
    }
    if (summary.constraints.length > 0) {
        lines.push("**Constraints:**");
        summary.constraints.forEach((c) => lines.push(`- ${c}`));
    }
    if (summary.openTasks.length > 0) {
        lines.push("**Open Tasks:**");
        summary.openTasks.forEach((t) => lines.push(`- ${t}`));
    }
    if (summary.importantFiles.length > 0) {
        lines.push("**Important Files:**");
        summary.importantFiles.forEach((f) => lines.push(`- ${f}`));
    }

    return lines.join("\n");
}

export function createOrchestratorWithTools(
    callbacks: OrchestratorCallbacks,
    context: OrchestratorContext
): Orchestrator {
    const initialModel = getSavedModel() || DEFAULT_MODEL;
    let provider: Provider = createProviderForModel(initialModel);
    const toolRegistry = createToolRegistryWithAllTools();
    const commandRegistry = createCommandRegistryWithAllCommands();

    let transcript: TranscriptEntry[] = [];
    let isProcessing = false;
    let pendingReviewId: string | null = null;
    let pendingWriteReview: PendingWriteReview | null = null;
    let pendingShellReview: PendingShellReview | null = null;
    let pendingCommandReview: PendingCommandReview | null = null;
    let pendingLearningPrompt: PendingLearningPrompt | null = null;
    let stopped = false;
    let currentModel: string = initialModel;
    let rollingSummary: StructuredSummary | null = null;

    let learningPromptId: string | null = null;
    let learningInProgress = false;
    let learningPercent = 0;
    let learningTopic = "";

    let contextUsedTokens = 0;
    let contextLimitTokens = getModelContextLimit(currentModel);
    let contextUsage = 0;

    let streamBuffer = "";
    let streamTimer: ReturnType<typeof setTimeout> | null = null;
    let currentAssistantId: string | null = null;
    let currentAbortController: AbortController | null = null;
    let shellAbortController: AbortController | null = null;
    let cancelled = false;

    function emitState() {
        callbacks.onStateChange({
            transcript: [...transcript],
            isProcessing,
            pendingReviewId,
            currentModel,
            contextUsedTokens,
            contextLimitTokens,
            contextUsage,
            learningPromptId,
            learningInProgress,
            learningPercent,
            learningTopic,
        });
    }

    function findEntry(id: string): TranscriptEntry | undefined {
        return transcript.find((e) => e.id === id);
    }

    function updateEntry(id: string, updates: Partial<TranscriptEntry>) {
        const idx = transcript.findIndex((e) => e.id === id);
        if (idx !== -1) {
            transcript[idx] = { ...transcript[idx], ...updates };
        }
    }

    function flushStreamBuffer() {
        if (currentAssistantId && streamBuffer) {
            const entry = findEntry(currentAssistantId);
            if (entry) {
                updateEntry(currentAssistantId, { content: entry.content + streamBuffer });
                streamBuffer = "";
                emitState();
            }
        }
        if (streamTimer) {
            clearTimeout(streamTimer);
            streamTimer = null;
        }
    }

    function scheduleStreamFlush() {
        if (!streamTimer) {
            streamTimer = setTimeout(() => {
                streamTimer = null;
                flushStreamBuffer();
            }, STREAM_THROTTLE_MS);
        }
    }

    const writeToolCallIds = new Set<string>();
    const shellToolCallIds = new Set<string>();

    function buildMessagesForClaude(): Message[] {
        const messages: Message[] = [];
        let pendingToolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> =
            [];

        if (context.cursorRulesText) {
            messages.push({
                role: "user",
                content: context.cursorRulesText,
            });
            messages.push({
                role: "assistant",
                content:
                    "I understand these project rules and will follow them throughout our conversation.",
            });
        }

        if (context.projectProfileText) {
            messages.push({
                role: "user",
                content: context.projectProfileText,
            });
            messages.push({
                role: "assistant",
                content:
                    "I understand this project profile and will use it as context for our conversation.",
            });
        }

        if (rollingSummary) {
            messages.push({
                role: "user",
                content: formatSummaryForContext(rollingSummary),
            });
            messages.push({
                role: "assistant",
                content:
                    "I understand. I'll use this summary as context for our ongoing conversation.",
            });
        }

        for (const entry of transcript) {
            if (
                entry.role === "command_review" ||
                entry.role === "command_executed" ||
                entry.role === "learning_prompt" ||
                entry.role === "learning_progress"
            ) {
                continue;
            }
            if (entry.role === "user") {
                if (pendingToolResults.length > 0) {
                    messages.push(provider.buildToolResultMessage(pendingToolResults));
                    pendingToolResults = [];
                }
                messages.push({ role: "user", content: entry.content });
            } else if (entry.role === "assistant") {
                if (pendingToolResults.length > 0) {
                    messages.push(provider.buildToolResultMessage(pendingToolResults));
                    pendingToolResults = [];
                }
                const toolCalls = extractToolCallsForEntry(entry.id);
                if (entry.content || toolCalls.length > 0) {
                    messages.push(provider.buildAssistantMessage(entry.content, toolCalls));
                }
            } else if (entry.role === "tool" && entry.toolResult) {
                const toolCallId = entry.toolCallId;
                if (
                    toolCallId &&
                    !writeToolCallIds.has(toolCallId) &&
                    !shellToolCallIds.has(toolCallId)
                ) {
                    pendingToolResults.push({
                        toolCallId,
                        result: JSON.stringify(entry.toolResult),
                        isError: !entry.toolResult.ok,
                    });
                }
            } else if (entry.role === "diff_review" && entry.reviewStatus !== "pending") {
                const toolCallId = entry.toolCallId;
                if (toolCallId) {
                    const applied =
                        entry.reviewStatus === "accepted" || entry.reviewStatus === "always";
                    const resultData: Record<string, unknown> = { ok: true, applied };
                    if (applied && entry.filesCount) {
                        resultData.stats = { filesChanged: entry.filesCount };
                    }
                    if (entry.reviewStatus === "rejected") {
                        resultData.reason = "User rejected the changes";
                    }
                    pendingToolResults.push({
                        toolCallId,
                        result: JSON.stringify(resultData),
                    });
                }
            } else if (entry.role === "shell_review" && entry.reviewStatus !== "pending") {
                const toolCallId = entry.toolCallId;
                const shellResult = entry.shellResult;
                if (toolCallId && shellResult) {
                    pendingToolResults.push({
                        toolCallId,
                        result: JSON.stringify(shellResult),
                        isError: !shellResult.ok,
                    });
                }
            }
        }

        if (pendingToolResults.length > 0) {
            messages.push(provider.buildToolResultMessage(pendingToolResults));
        }

        return messages;
    }

    const toolCallsMap = new Map<string, ToolCall[]>();

    function extractToolCallsForEntry(assistantId: string): ToolCall[] {
        return toolCallsMap.get(assistantId) || [];
    }

    async function executeShellCommand(
        command: string,
        cwd?: string | null,
        timeoutMs?: number | null
    ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
        const cwdOrUndefined = cwd || undefined;
        const timeoutOrUndefined = timeoutMs ?? undefined;
        callbacks.onShellRunStart?.(command, cwdOrUndefined, timeoutOrUndefined);
        const startTime = Date.now();

        shellAbortController = new AbortController();
        const signal = shellAbortController.signal;

        try {
            const shellService = getShellService(context.repoRoot, context.logger);
            const result = await shellService.run(command, {
                cwd: cwdOrUndefined,
                timeoutMs: timeoutOrUndefined,
                signal,
            });
            const durationMs = Date.now() - startTime;

            callbacks.onShellRunComplete?.(
                command,
                result.exitCode,
                durationMs,
                result.stdout.length,
                result.stderr.length
            );

            return {
                ok: true,
                data: {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("cancelled")) {
                return { ok: false, error: "Command cancelled by user" };
            }
            return { ok: false, error: message };
        } finally {
            shellAbortController = null;
        }
    }

    async function handleShellTool(
        toolCall: ToolCall,
        toolEntryId: string
    ): Promise<{ needsReview: boolean; entry: TranscriptEntry }> {
        const args = toolCall.input as ShellRunInput;
        const command = args.command?.trim() || "";
        const cwd = args.cwd;
        const timeoutMs = args.timeoutMs;

        shellToolCallIds.add(toolCall.id);

        if (isShellAutoApproveEnabled(context.repoRoot)) {
            updateEntry(toolEntryId, {
                content: `shell_run (auto-approved)`,
            });
            emitState();

            const result = await executeShellCommand(command, cwd, timeoutMs);

            const reviewEntry: TranscriptEntry = {
                id: generateId(),
                role: "shell_review",
                content: "",
                ts: Date.now(),
                toolName: "shell_run",
                shellCommand: command,
                shellCwd: cwd,
                shellTimeoutMs: timeoutMs,
                reviewStatus: "auto",
                toolCallId: toolCall.id,
                shellResult: result,
            };
            transcript.push(reviewEntry);

            updateEntry(toolEntryId, { toolResult: { ok: true, data: { autoApproved: true } } });
            emitState();

            return { needsReview: false, entry: reviewEntry };
        }

        if (isCommandAllowed(context.repoRoot, command)) {
            updateEntry(toolEntryId, {
                content: `shell_run (allowed)`,
            });
            emitState();

            const result = await executeShellCommand(command, cwd, timeoutMs);

            const reviewEntry: TranscriptEntry = {
                id: generateId(),
                role: "shell_review",
                content: "",
                ts: Date.now(),
                toolName: "shell_run",
                shellCommand: command,
                shellCwd: cwd,
                shellTimeoutMs: timeoutMs,
                reviewStatus: "always",
                toolCallId: toolCall.id,
                shellResult: result,
            };
            transcript.push(reviewEntry);

            updateEntry(toolEntryId, { toolResult: { ok: true, data: { autoApproved: true } } });
            emitState();

            return { needsReview: false, entry: reviewEntry };
        }

        callbacks.onShellReviewShown?.(command, cwd, timeoutMs);

        const reviewId = generateId();
        const reviewEntry: TranscriptEntry = {
            id: reviewId,
            role: "shell_review",
            content: "",
            ts: Date.now(),
            toolName: "shell_run",
            shellCommand: command,
            shellCwd: cwd,
            shellTimeoutMs: timeoutMs,
            reviewStatus: "pending",
            toolCallId: toolCall.id,
        };
        transcript.push(reviewEntry);

        updateEntry(toolEntryId, {
            content: `shell_run (awaiting approval)`,
            toolResult: { ok: true, data: { awaitingApproval: true } },
        });

        return { needsReview: true, entry: reviewEntry };
    }

    async function executeToolCall(
        toolCall: ToolCall,
        _assistantId: string,
        _mode: Mode
    ): Promise<{
        needsReview: boolean;
        entry: TranscriptEntry;
        reviewType?: "write" | "shell";
    }> {
        const toolName = toolCall.name;
        const args = toolCall.input;
        const policy = toolRegistry.getApprovalPolicy(toolName);

        callbacks.onToolCallStart?.(toolName, args);
        const startTime = Date.now();

        const toolEntryId = generateId();
        const toolEntry: TranscriptEntry = {
            id: toolEntryId,
            role: "tool",
            content: formatToolNameForDisplay(toolName, args),
            ts: Date.now(),
            toolName,
            toolResult: undefined,
            toolCallId: toolCall.id,
        };
        transcript.push(toolEntry);
        emitState();

        if (policy === "shell") {
            const { needsReview, entry } = await handleShellTool(toolCall, toolEntryId);
            const durationMs = Date.now() - startTime;
            callbacks.onToolCallComplete?.(toolName, durationMs, true);
            return { needsReview, entry, reviewType: "shell" };
        }

        const result = await toolRegistry.execute(toolName, args, {
            repoRoot: context.repoRoot,
            logger: context.logger,
        });

        const durationMs = Date.now() - startTime;
        callbacks.onToolCallComplete?.(toolName, durationMs, result.ok);

        if (policy === "write" && result.ok && result.data) {
            writeToolCallIds.add(toolCall.id);
            const prepareResult = result.data as EditPrepareResult;
            const reviewId = generateId();

            if (isEditsAutoAcceptEnabled(context.repoRoot)) {
                callbacks.onWriteApplyStart?.();
                const applyStart = Date.now();
                const applyResult = applyEditsAtomically(
                    context.repoRoot,
                    prepareResult.applyPayload
                );
                const applyDuration = Date.now() - applyStart;
                callbacks.onWriteApplyComplete?.(applyDuration, applyResult.ok);

                const reviewEntry: TranscriptEntry = {
                    id: reviewId,
                    role: "diff_review",
                    content: "",
                    ts: Date.now(),
                    toolName,
                    diffContent: prepareResult.diffsByFile,
                    filesCount: prepareResult.stats.filesChanged,
                    reviewStatus: "always",
                    applyPayload: prepareResult.applyPayload,
                    toolCallId: toolCall.id,
                };
                transcript.push(reviewEntry);

                const stats = computeDiffStats(prepareResult.diffsByFile);
                updateEntry(toolEntryId, {
                    content: `${formatToolNameForDisplay(toolName, args)} (+${stats.added}/-${stats.removed})`,
                    toolResult: { ok: true, data: { autoApplied: true } },
                });
                emitState();

                return { needsReview: false, entry: reviewEntry, reviewType: "write" };
            }

            const reviewEntry: TranscriptEntry = {
                id: reviewId,
                role: "diff_review",
                content: "",
                ts: Date.now(),
                toolName,
                diffContent: prepareResult.diffsByFile,
                filesCount: prepareResult.stats.filesChanged,
                reviewStatus: "pending",
                applyPayload: prepareResult.applyPayload,
                toolCallId: toolCall.id,
            };
            transcript.push(reviewEntry);

            updateEntry(toolEntryId, {
                content: `${toolName} (prepared)`,
                toolResult: { ok: true, data: { prepared: true } },
            });

            callbacks.onWriteReviewShown?.(prepareResult.stats.filesChanged, toolName);

            return { needsReview: true, entry: reviewEntry, reviewType: "write" };
        }

        updateEntry(toolEntryId, { toolResult: result });
        emitState();

        return { needsReview: false, entry: toolEntry };
    }

    async function waitForWriteReviewDecision(
        reviewEntry: TranscriptEntry
    ): Promise<WriteDecision> {
        pendingReviewId = reviewEntry.id;
        emitState();

        return new Promise((resolve) => {
            pendingWriteReview = {
                id: reviewEntry.id,
                resolve,
                filesCount: reviewEntry.filesCount || 0,
                applyPayload: reviewEntry.applyPayload,
            };
        });
    }

    async function waitForShellReviewDecision(
        reviewEntry: TranscriptEntry
    ): Promise<ShellDecision> {
        pendingReviewId = reviewEntry.id;
        emitState();

        return new Promise((resolve) => {
            pendingShellReview = {
                id: reviewEntry.id,
                resolve,
                command: reviewEntry.shellCommand || "",
                cwd: reviewEntry.shellCwd || undefined,
            };
        });
    }

    async function waitForCommandReviewDecision(
        reviewEntry: TranscriptEntry
    ): Promise<CommandDecision> {
        pendingReviewId = reviewEntry.id;
        emitState();

        return new Promise((resolve) => {
            pendingCommandReview = {
                id: reviewEntry.id,
                resolve,
            };
        });
    }

    function computeDiffStats(diffs: FileDiff[]): { added: number; removed: number } {
        let added = 0;
        let removed = 0;
        for (const d of diffs) {
            added += d.linesAdded;
            removed += d.linesRemoved;
        }
        return { added, removed };
    }

    function findToolEntryForReview(reviewEntry: TranscriptEntry): TranscriptEntry | undefined {
        const reviewIndex = transcript.findIndex((e) => e.id === reviewEntry.id);
        if (reviewIndex <= 0) return undefined;
        for (let i = reviewIndex - 1; i >= 0; i--) {
            const entry = transcript[i];
            if (entry.role === "tool" && entry.toolCallId === reviewEntry.toolCallId) {
                return entry;
            }
        }
        return undefined;
    }

    async function applyWriteDecision(
        reviewEntry: TranscriptEntry,
        decision: WriteDecision
    ): Promise<void> {
        const filesCount = reviewEntry.filesCount || 0;
        const callbackDecision = decision === "always" ? "accept" : decision;
        callbacks.onWriteReviewDecision?.(callbackDecision, filesCount);

        if ((decision === "accept" || decision === "always") && reviewEntry.applyPayload) {
            if (decision === "always") {
                enableEditsAutoAccept(context.repoRoot);
            }

            callbacks.onWriteApplyStart?.();
            const startTime = Date.now();

            const applyResult = applyEditsAtomically(context.repoRoot, reviewEntry.applyPayload);

            const durationMs = Date.now() - startTime;
            callbacks.onWriteApplyComplete?.(durationMs, applyResult.ok);

            updateEntry(reviewEntry.id, {
                reviewStatus: decision === "always" ? "always" : "accepted",
            });

            const toolEntry = findToolEntryForReview(reviewEntry);
            if (toolEntry && reviewEntry.diffContent) {
                const stats = computeDiffStats(reviewEntry.diffContent);
                const currentContent = toolEntry.content.replace(/ \(prepared\)$/, "");
                updateEntry(toolEntry.id, {
                    content: `${currentContent} (+${stats.added}/-${stats.removed})`,
                });
            }
        } else {
            updateEntry(reviewEntry.id, { reviewStatus: "rejected" });
        }

        pendingReviewId = null;
        pendingWriteReview = null;
        emitState();
    }

    async function applyShellDecision(
        reviewEntry: TranscriptEntry,
        decision: ShellDecision
    ): Promise<void> {
        const command = reviewEntry.shellCommand || "";
        const cwd = reviewEntry.shellCwd;
        const timeoutMs = reviewEntry.shellTimeoutMs;

        callbacks.onShellReviewDecision?.(decision, command);

        if (decision === "deny") {
            const result = {
                ok: true,
                data: {
                    stdout: "",
                    stderr: "",
                    exitCode: -1,
                    durationMs: 0,
                    denied: true,
                },
            };
            reviewEntry.shellResult = result;
            updateEntry(reviewEntry.id, { reviewStatus: "denied" });
        } else {
            if (decision === "always") {
                allowCommand(context.repoRoot, command);
            } else if (decision === "auto") {
                enableShellAutoApprove(context.repoRoot);
            }

            const result = await executeShellCommand(command, cwd, timeoutMs);
            reviewEntry.shellResult = result;

            updateEntry(reviewEntry.id, {
                reviewStatus:
                    decision === "always" ? "always" : decision === "auto" ? "auto" : "ran",
            });
        }

        pendingReviewId = null;
        pendingShellReview = null;
        emitState();
    }

    function createCommandContext(): CommandContext {
        return {
            repoRoot: context.repoRoot,
            setModel(modelId: string) {
                currentModel = modelId;
                provider = createProviderForModel(modelId);
                contextLimitTokens = getModelContextLimit(modelId);
                if (contextUsedTokens > 0) {
                    contextUsage = contextUsedTokens / contextLimitTokens;
                }
                emitState();
            },
            getModel() {
                return currentModel;
            },
            resetChat() {
                transcript = [];
                rollingSummary = null;
                pendingReviewId = null;
                pendingWriteReview = null;
                pendingShellReview = null;
                pendingCommandReview = null;
                writeToolCallIds.clear();
                shellToolCallIds.clear();
                toolCallsMap.clear();
                emitState();
            },
            setRollingSummary(summary: StructuredSummary | null) {
                rollingSummary = summary;
            },
            getRollingSummary() {
                return rollingSummary;
            },
            async generateSummary(): Promise<StructuredSummary | null> {
                const transcriptText = transcript
                    .filter((e) => e.role === "user" || e.role === "assistant")
                    .map((e) => `${e.role}: ${e.content}`)
                    .join("\n\n");

                const summaryPrompt = `Analyze this conversation and produce a JSON summary with these exact fields:
{
  "goal": "The current primary goal or task being worked on",
  "decisions": ["List of key decisions made"],
  "constraints": ["List of constraints or requirements mentioned"],
  "openTasks": ["List of tasks still pending"],
  "importantFiles": ["List of files mentioned or modified"]
}

Conversation:
${transcriptText}

Respond with ONLY the JSON, no other text.`;

                const SUMMARY_SYSTEM =
                    "You are a conversation summarizer. Respond with valid JSON only. Do not request any tools.";

                return new Promise((resolve) => {
                    let summaryText = "";

                    provider.stream(
                        [{ role: "user", content: summaryPrompt }],
                        {
                            onChunk(chunk) {
                                summaryText += chunk;
                            },
                            onComplete() {
                                try {
                                    const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
                                    if (jsonMatch) {
                                        const parsed = JSON.parse(jsonMatch[0]);
                                        const summary: StructuredSummary = {
                                            goal: parsed.goal || "",
                                            decisions: Array.isArray(parsed.decisions)
                                                ? parsed.decisions
                                                : [],
                                            constraints: Array.isArray(parsed.constraints)
                                                ? parsed.constraints
                                                : [],
                                            openTasks: Array.isArray(parsed.openTasks)
                                                ? parsed.openTasks
                                                : [],
                                            importantFiles: Array.isArray(parsed.importantFiles)
                                                ? parsed.importantFiles
                                                : [],
                                        };
                                        resolve(summary);
                                    } else {
                                        resolve(null);
                                    }
                                } catch {
                                    resolve(null);
                                }
                            },
                            onError() {
                                resolve(null);
                            },
                            onToolCall() {},
                        },
                        {
                            tools: [],
                            model: currentModel,
                            systemOverride: SUMMARY_SYSTEM,
                        }
                    );
                });
            },
            trimTranscript(keepLast: number) {
                const userAssistantEntries = transcript.filter(
                    (e) => e.role === "user" || e.role === "assistant"
                );
                const idsToKeepFromUA = new Set(
                    userAssistantEntries.slice(-keepLast).map((e) => e.id)
                );

                transcript = transcript.filter((e) => {
                    if (e.role === "user" || e.role === "assistant") {
                        return idsToKeepFromUA.has(e.id);
                    }
                    if (
                        (e.role === "diff_review" || e.role === "shell_review") &&
                        e.reviewStatus !== "pending"
                    ) {
                        return true;
                    }
                    return false;
                });

                emitState();
            },
            requestExit() {
                stopped = true;
                callbacks.onExit?.();
            },
            async showPicker(
                commandName: string,
                prompt: string,
                options: PickerOption[]
            ): Promise<string | null> {
                const reviewId = generateId();
                const reviewEntry: TranscriptEntry = {
                    id: reviewId,
                    role: "command_review",
                    content: "",
                    ts: Date.now(),
                    commandName,
                    commandPrompt: prompt,
                    commandOptions: options,
                    reviewStatus: "pending",
                };
                transcript.push(reviewEntry);
                emitState();

                const decision = await waitForCommandReviewDecision(reviewEntry);

                updateEntry(reviewId, {
                    reviewStatus: decision ? "selected" : "cancelled",
                    commandSelectedId: decision || undefined,
                });

                pendingReviewId = null;
                pendingCommandReview = null;
                emitState();

                return decision;
            },
            getTranscript() {
                return [...transcript];
            },
            listCommands() {
                return commandRegistry.list();
            },
            triggerLearning() {
                void startLearningSessionInternal();
            },
        };
    }

    async function startLearningSessionInternal() {
        if (learningInProgress || stopped) return;

        learningInProgress = true;
        learningPercent = 0;
        learningTopic = "";

        const progressEntryId = generateId();
        transcript.push({
            id: progressEntryId,
            role: "learning_progress",
            content: "",
            ts: Date.now(),
            learningPercent: 0,
            learningTopic: "",
        });
        emitState();

        try {
            const profileText = await runLearningSession(
                context.repoRoot,
                toolRegistry,
                provider,
                context.logger,
                (percent: number, topic: string) => {
                    learningPercent = percent;
                    learningTopic = topic;
                    updateEntry(progressEntryId, {
                        learningPercent: percent,
                        learningTopic: topic,
                    });
                    emitState();
                }
            );

            saveProfile(context.repoRoot, profileText);

            const idx = transcript.findIndex((e) => e.id === progressEntryId);
            if (idx !== -1) {
                transcript.splice(idx, 1);
            }

            const completionEntry: TranscriptEntry = {
                id: generateId(),
                role: "assistant",
                content: "I've finished learning the project. Let me know how I can help!",
                ts: Date.now(),
            };
            transcript.push(completionEntry);

            context.logger.info("learning_complete", {});
        } catch (err) {
            context.logger.error(
                "learning_error",
                err instanceof Error ? err : new Error(String(err))
            );

            const idx = transcript.findIndex((e) => e.id === progressEntryId);
            if (idx !== -1) {
                transcript.splice(idx, 1);
            }

            const errorEntry: TranscriptEntry = {
                id: generateId(),
                role: "assistant",
                content:
                    "I encountered an error while learning the project. You can try again with the /learn command.",
                ts: Date.now(),
            };
            transcript.push(errorEntry);
        } finally {
            learningInProgress = false;
            learningPercent = 0;
            learningTopic = "";
            learningPromptId = null;
            emitState();
        }
    }

    async function executeCommands(content: string): Promise<string> {
        const { invocations, remainingText } = parseCommandInvocations(content, commandRegistry);

        if (invocations.length === 0) {
            return content;
        }

        const ctx = createCommandContext();

        for (const invocation of invocations) {
            const result = await commandRegistry.execute(invocation.name, ctx, invocation.args);

            const executedEntry: TranscriptEntry = {
                id: generateId(),
                role: "command_executed",
                content: result.ok
                    ? result.message || `/${invocation.name} executed`
                    : result.error || "Command failed",
                ts: Date.now(),
                commandName: invocation.name,
            };
            transcript.push(executedEntry);
            emitState();

            if (stopped) break;
        }

        return remainingText;
    }

    async function runConversationLoop(_mode: Mode): Promise<void> {
        let toolResultRecoveryAttempted = false;
        let transientRetryCount = 0;

        while (!stopped && !cancelled) {
            const requestId = generateId();
            const requestStart = Date.now();
            callbacks.onRequestStart?.(requestId, currentModel);

            const assistantId = generateId();
            currentAssistantId = assistantId;

            currentAbortController = new AbortController();

            const assistantEntry: TranscriptEntry = {
                id: assistantId,
                role: "assistant",
                content: "",
                ts: Date.now(),
                isStreaming: true,
            };
            transcript.push(assistantEntry);
            toolCallsMap.set(assistantId, []);
            emitState();

            let messages = buildMessagesForClaude();
            const allToolSchemas = toolRegistry.getSchemas();
            const toolSchemas = filterToolsForMode(_mode, allToolSchemas);
            const signal = currentAbortController.signal;

            const systemPrompt = provider.systemPrompt;
            const estimate = estimatePromptTokens(systemPrompt, messages);
            contextUsedTokens = estimate.estimatedTokens;
            contextLimitTokens = getModelContextLimit(currentModel);
            contextUsage = contextUsedTokens / contextLimitTokens;
            emitState();

            const COMPACT_THRESHOLD = 0.92;
            if (contextUsage >= COMPACT_THRESHOLD) {
                const ctx = createCommandContext();
                const summary = await ctx.generateSummary();
                if (summary) {
                    ctx.setRollingSummary(summary);
                    ctx.trimTranscript(10);
                    messages = buildMessagesForClaude();
                    const newEstimate = estimatePromptTokens(systemPrompt, messages);
                    contextUsedTokens = newEstimate.estimatedTokens;
                    contextUsage = contextUsedTokens / contextLimitTokens;
                    emitState();
                }
            }

            type StreamResult = { text: string; toolCalls: ToolCall[]; stopReason: string | null };
            const streamOutcome = await new Promise<{ result: StreamResult } | { error: Error }>(
                (resolve) => {
                    provider.stream(
                        messages,
                        {
                            onChunk(chunk: string) {
                                streamBuffer += chunk;
                                scheduleStreamFlush();
                            },
                            onToolCall(toolCall: ToolCall) {
                                const calls = toolCallsMap.get(assistantId) || [];
                                calls.push(toolCall);
                                toolCallsMap.set(assistantId, calls);
                            },
                            onComplete(result) {
                                resolve({ result });
                            },
                            onError(error: Error) {
                                resolve({ error });
                            },
                        },
                        {
                            tools: toolSchemas as ToolSchema[],
                            model: currentModel,
                            signal,
                        }
                    );
                }
            );

            flushStreamBuffer();
            currentAssistantId = null;
            currentAbortController = null;

            const requestDuration = Date.now() - requestStart;

            if ("error" in streamOutcome) {
                const err = streamOutcome.error;
                if (err.name === "AbortError" || cancelled) {
                    updateEntry(assistantId, {
                        isStreaming: false,
                        content: findEntry(assistantId)?.content + " [Cancelled]",
                    });
                    emitState();
                    break;
                }

                const orphanMatch = err.message.match(
                    /tool_use.*ids.*without.*tool_result.*: (toolu_\w+)/
                );
                if (orphanMatch && !toolResultRecoveryAttempted) {
                    const orphanedId = orphanMatch[1];
                    writeToolCallIds.delete(orphanedId);
                    shellToolCallIds.delete(orphanedId);
                    context.logger.info("tool_result_recovery", { orphanedId });
                    toolResultRecoveryAttempted = true;
                    transcript.pop();
                    toolCallsMap.delete(assistantId);
                    continue;
                }

                if (
                    isRetryableError(err) &&
                    transientRetryCount < DEFAULT_RETRY_CONFIG.maxRetries
                ) {
                    transientRetryCount++;
                    const delayMs = calculateBackoff(transientRetryCount - 1);
                    context.logger.info("api_retry_attempt", {
                        attempt: transientRetryCount,
                        maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
                        delayMs: Math.round(delayMs),
                        errorMessage: err.message,
                    });
                    transcript.pop();
                    toolCallsMap.delete(assistantId);
                    await sleep(delayMs);
                    continue;
                }

                callbacks.onRequestComplete?.(requestId, requestDuration, err);
                updateEntry(assistantId, {
                    isStreaming: false,
                    content: findEntry(assistantId)?.content + `\n\n[Error: ${err.message}]`,
                });
                emitState();
                break;
            }

            const result = streamOutcome.result;

            if (result.stopReason === "cancelled" || cancelled) {
                updateEntry(assistantId, {
                    isStreaming: false,
                    content: result.text + " [Cancelled]",
                });
                emitState();
                break;
            }

            callbacks.onRequestComplete?.(requestId, requestDuration);
            transientRetryCount = 0;

            updateEntry(assistantId, {
                isStreaming: false,
                content: result.text,
            });
            emitState();

            if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
                break;
            }

            for (const toolCall of result.toolCalls) {
                if (stopped) break;

                const { needsReview, entry, reviewType } = await executeToolCall(
                    toolCall,
                    assistantId,
                    _mode
                );

                if (needsReview) {
                    if (reviewType === "write") {
                        const decision = await waitForWriteReviewDecision(entry);
                        await applyWriteDecision(entry, decision);
                    } else if (reviewType === "shell") {
                        const decision = await waitForShellReviewDecision(entry);
                        await applyShellDecision(entry, decision);
                    }
                }
            }

            if (stopped) break;
        }
    }

    emitState();

    return {
        async sendMessage(content: string, mode: Mode = "agent") {
            if (isProcessing || stopped) return;

            isProcessing = true;
            cancelled = false;
            emitState();

            try {
                const remainingText = await executeCommands(content);

                if (stopped) {
                    isProcessing = false;
                    emitState();
                    return;
                }

                if (remainingText.trim().length === 0) {
                    isProcessing = false;
                    emitState();
                    return;
                }

                const userEntry: TranscriptEntry = {
                    id: generateId(),
                    role: "user",
                    content: remainingText.trim(),
                    ts: Date.now(),
                };
                transcript.push(userEntry);
                emitState();

                await runConversationLoop(mode);
            } catch (err) {
                context.logger.error(
                    "conversation_loop_error",
                    err instanceof Error ? err : new Error(String(err))
                );
            } finally {
                isProcessing = false;
                emitState();
            }
        },

        resolveWriteReview(reviewId: string, decision: WriteDecision) {
            if (pendingWriteReview && pendingWriteReview.id === reviewId) {
                pendingWriteReview.resolve(decision);
            }
        },

        resolveShellReview(reviewId: string, decision: ShellDecision) {
            if (pendingShellReview && pendingShellReview.id === reviewId) {
                pendingShellReview.resolve(decision);
            }
        },

        resolveCommandReview(reviewId: string, decision: CommandDecision) {
            if (pendingCommandReview && pendingCommandReview.id === reviewId) {
                pendingCommandReview.resolve(decision);
            }
        },

        resolveLearningPrompt(reviewId: string, decision: LearningDecision) {
            if (pendingLearningPrompt && pendingLearningPrompt.id === reviewId) {
                pendingLearningPrompt.resolve(decision);
            }
        },

        async startLearningSession() {
            await startLearningSessionInternal();
        },

        getModel() {
            return currentModel;
        },

        getCommandRegistry() {
            return commandRegistry;
        },

        cancel() {
            if (!isProcessing) return;

            cancelled = true;

            if (currentAbortController) {
                currentAbortController.abort();
            }

            if (shellAbortController) {
                shellAbortController.abort();
            }

            if (pendingWriteReview) {
                pendingWriteReview.resolve("reject");
                pendingWriteReview = null;
            }
            if (pendingShellReview) {
                pendingShellReview.resolve("deny");
                pendingShellReview = null;
            }
            if (pendingCommandReview) {
                pendingCommandReview.resolve(null);
                pendingCommandReview = null;
            }
            if (pendingLearningPrompt) {
                pendingLearningPrompt.resolve("decline");
                pendingLearningPrompt = null;
            }

            pendingReviewId = null;
            learningPromptId = null;
        },

        stop() {
            stopped = true;
            cancelled = true;

            if (currentAbortController) {
                currentAbortController.abort();
            }

            if (shellAbortController) {
                shellAbortController.abort();
            }

            if (pendingWriteReview) {
                pendingWriteReview.resolve("reject");
            }
            if (pendingShellReview) {
                pendingShellReview.resolve("deny");
            }
            if (pendingCommandReview) {
                pendingCommandReview.resolve(null);
            }
        },

        isProcessing() {
            return isProcessing;
        },
    };
}
