import { createProvider, type Provider, type Message, type ToolCall } from "../provider/anthropic";
import { createToolRegistryWithAllTools, type ToolRegistry } from "../tools/index";
import type { Logger } from "../logging/index";
import type { FileDiff, EditPrepareResult, ShellRunInput } from "../tools/types";
import { applyEditsAtomically } from "../utils/editing";
import { isCommandAllowed, allowCommand } from "../storage/allowlist";
import { getShellService } from "../shell/index";

export type ShellReviewStatus = "pending" | "ran" | "always" | "denied";
export type WriteReviewStatus = "pending" | "accepted" | "rejected";
export type ReviewStatus = WriteReviewStatus | ShellReviewStatus;

export interface TranscriptEntry {
    id: string;
    role: "user" | "assistant" | "tool" | "diff_review" | "shell_review";
    content: string;
    ts: number;
    isStreaming?: boolean;
    toolResult?: { ok: boolean; data?: unknown; error?: string };
    diffContent?: FileDiff[];
    filesCount?: number;
    toolName?: string;
    reviewStatus?: ReviewStatus;
    applyPayload?: unknown;
    shellCommand?: string;
    shellCwd?: string | null;
}

export interface OrchestratorState {
    transcript: TranscriptEntry[];
    isProcessing: boolean;
    pendingReviewId: string | null;
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
    onShellReviewShown?: (command: string, cwd?: string | null) => void;
    onShellReviewDecision?: (decision: "run" | "always" | "deny", command: string) => void;
    onShellRunStart?: (command: string, cwd?: string | null) => void;
    onShellRunComplete?: (command: string, exitCode: number, durationMs: number, stdoutBytes: number, stderrBytes: number) => void;
}

export interface OrchestratorContext {
    repoRoot: string;
    logger: Logger;
}

export type ShellDecision = "run" | "always" | "deny";

export interface Orchestrator {
    sendMessage(content: string): void;
    resolveWriteReview(reviewId: string, decision: "accept" | "reject"): void;
    resolveShellReview(reviewId: string, decision: ShellDecision): void;
    getModel(): string;
    stop(): void;
}

interface PendingWriteReview {
    id: string;
    resolve: (decision: "accept" | "reject") => void;
    filesCount: number;
    applyPayload: unknown;
}

interface PendingShellReview {
    id: string;
    resolve: (decision: ShellDecision) => void;
    command: string;
    cwd?: string;
}

const STREAM_THROTTLE_MS = 32;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createOrchestratorWithTools(
    callbacks: OrchestratorCallbacks,
    context: OrchestratorContext
): Orchestrator {
    const provider = createProvider();
    const registry = createToolRegistryWithAllTools();

    let transcript: TranscriptEntry[] = [];
    let isProcessing = false;
    let pendingReviewId: string | null = null;
    let pendingWriteReview: PendingWriteReview | null = null;
    let pendingShellReview: PendingShellReview | null = null;
    let stopped = false;

    let streamBuffer = "";
    let streamTimer: ReturnType<typeof setTimeout> | null = null;
    let currentAssistantId: string | null = null;

    function emitState() {
        callbacks.onStateChange({
            transcript: [...transcript],
            isProcessing,
            pendingReviewId,
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
        let pendingToolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> = [];

        for (const entry of transcript) {
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
                const toolCallId = (entry as any).toolCallId;
                if (toolCallId && !writeToolCallIds.has(toolCallId) && !shellToolCallIds.has(toolCallId)) {
                    pendingToolResults.push({
                        toolCallId,
                        result: JSON.stringify(entry.toolResult),
                        isError: !entry.toolResult.ok,
                    });
                }
            } else if (entry.role === "diff_review" && entry.reviewStatus !== "pending") {
                const toolCallId = (entry as any).toolCallId;
                if (toolCallId) {
                    const applied = entry.reviewStatus === "accepted";
                    const resultData: Record<string, unknown> = { ok: true, applied };
                    if (entry.reviewStatus === "accepted" && entry.filesCount) {
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
                const toolCallId = (entry as any).toolCallId;
                const shellResult = (entry as any).shellResult;
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

    async function executeShellCommand(command: string, cwd?: string | null): Promise<{ ok: boolean; data?: unknown; error?: string }> {
        const cwdOrUndefined = cwd || undefined;
        callbacks.onShellRunStart?.(command, cwdOrUndefined);
        const startTime = Date.now();

        try {
            const shellService = getShellService(context.repoRoot, context.logger);
            const result = await shellService.run(command, { cwd: cwdOrUndefined });
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
            return { ok: false, error: message };
        }
    }

    async function handleShellTool(
        toolCall: ToolCall,
        toolEntryId: string
    ): Promise<{ needsReview: boolean; entry: TranscriptEntry }> {
        const args = toolCall.input as ShellRunInput;
        const command = args.command?.trim() || "";
        const cwd = args.cwd;

        shellToolCallIds.add(toolCall.id);

        if (isCommandAllowed(context.repoRoot, command)) {
            updateEntry(toolEntryId, {
                content: `shell_run (allowed)`,
            });
            emitState();

            const result = await executeShellCommand(command, cwd);

            const reviewEntry: TranscriptEntry = {
                id: generateId(),
                role: "shell_review",
                content: "",
                ts: Date.now(),
                toolName: "shell_run",
                shellCommand: command,
                shellCwd: cwd,
                reviewStatus: "always",
            };
            (reviewEntry as any).toolCallId = toolCall.id;
            (reviewEntry as any).shellResult = result;
            transcript.push(reviewEntry);

            updateEntry(toolEntryId, { toolResult: { ok: true, data: { autoApproved: true } } });
            emitState();

            return { needsReview: false, entry: reviewEntry };
        }

        callbacks.onShellReviewShown?.(command, cwd);

        const reviewId = generateId();
        const reviewEntry: TranscriptEntry = {
            id: reviewId,
            role: "shell_review",
            content: "",
            ts: Date.now(),
            toolName: "shell_run",
            shellCommand: command,
            shellCwd: cwd,
            reviewStatus: "pending",
        };
        (reviewEntry as any).toolCallId = toolCall.id;
        transcript.push(reviewEntry);

        updateEntry(toolEntryId, {
            content: `shell_run (awaiting approval)`,
            toolResult: { ok: true, data: { awaitingApproval: true } },
        });

        return { needsReview: true, entry: reviewEntry };
    }

    async function executeToolCall(
        toolCall: ToolCall,
        assistantId: string
    ): Promise<{ needsReview: boolean; entry: TranscriptEntry; reviewType?: "write" | "shell" }> {
        const toolName = toolCall.name;
        const args = toolCall.input;
        const policy = registry.getApprovalPolicy(toolName);

        callbacks.onToolCallStart?.(toolName, args);
        const startTime = Date.now();

        const toolEntryId = generateId();
        const toolEntry: TranscriptEntry = {
            id: toolEntryId,
            role: "tool",
            content: `${toolName}`,
            ts: Date.now(),
            toolName,
            toolResult: undefined,
        };
        (toolEntry as any).toolCallId = toolCall.id;
        transcript.push(toolEntry);
        emitState();

        if (policy === "shell") {
            const { needsReview, entry } = await handleShellTool(toolCall, toolEntryId);
            const durationMs = Date.now() - startTime;
            callbacks.onToolCallComplete?.(toolName, durationMs, true);
            return { needsReview, entry, reviewType: "shell" };
        }

        if (policy === "write") {
            writeToolCallIds.add(toolCall.id);
        }

        const result = await registry.execute(toolName, args, {
            repoRoot: context.repoRoot,
            logger: context.logger,
        });

        const durationMs = Date.now() - startTime;
        callbacks.onToolCallComplete?.(toolName, durationMs, result.ok);

        if (policy === "write" && result.ok && result.data) {
            const prepareResult = result.data as EditPrepareResult;
            const reviewId = generateId();

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
            };
            (reviewEntry as any).toolCallId = toolCall.id;
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

    async function waitForWriteReviewDecision(reviewEntry: TranscriptEntry): Promise<"accept" | "reject"> {
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

    async function waitForShellReviewDecision(reviewEntry: TranscriptEntry): Promise<ShellDecision> {
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

    async function applyWriteDecision(
        reviewEntry: TranscriptEntry,
        decision: "accept" | "reject"
    ): Promise<void> {
        const filesCount = reviewEntry.filesCount || 0;
        callbacks.onWriteReviewDecision?.(decision, filesCount);

        if (decision === "accept" && reviewEntry.applyPayload) {
            callbacks.onWriteApplyStart?.();
            const startTime = Date.now();

            const applyResult = applyEditsAtomically(
                context.repoRoot,
                reviewEntry.applyPayload as any
            );

            const durationMs = Date.now() - startTime;
            callbacks.onWriteApplyComplete?.(durationMs, applyResult.ok);

            updateEntry(reviewEntry.id, { reviewStatus: "accepted" });
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
            (reviewEntry as any).shellResult = result;
            updateEntry(reviewEntry.id, { reviewStatus: "denied" });
        } else {
            if (decision === "always") {
                allowCommand(context.repoRoot, command);
            }

            const result = await executeShellCommand(command, cwd);
            (reviewEntry as any).shellResult = result;

            updateEntry(reviewEntry.id, {
                reviewStatus: decision === "always" ? "always" : "ran",
            });
        }

        pendingReviewId = null;
        pendingShellReview = null;
        emitState();
    }

    async function runConversationLoop(): Promise<void> {
        while (!stopped) {
            const requestId = generateId();
            const requestStart = Date.now();
            callbacks.onRequestStart?.(requestId, provider.model);

            const assistantId = generateId();
            currentAssistantId = assistantId;

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

            const messages = buildMessagesForClaude();
            const toolSchemas = registry.getSchemas();

            type StreamResult = { text: string; toolCalls: ToolCall[]; stopReason: string | null };
            const streamOutcome = await new Promise<{ result: StreamResult } | { error: Error }>((resolve) => {
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
                    { tools: toolSchemas }
                );
            });

            flushStreamBuffer();
            currentAssistantId = null;

            const requestDuration = Date.now() - requestStart;

            if ("error" in streamOutcome) {
                const err = streamOutcome.error;
                callbacks.onRequestComplete?.(requestId, requestDuration, err);
                updateEntry(assistantId, {
                    isStreaming: false,
                    content: findEntry(assistantId)?.content + `\n\n[Error: ${err.message}]`,
                });
                emitState();
                break;
            }

            const result = streamOutcome.result;
            callbacks.onRequestComplete?.(requestId, requestDuration);

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

                const { needsReview, entry, reviewType } = await executeToolCall(toolCall, assistantId);

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

    return {
        sendMessage(content: string) {
            if (isProcessing || stopped) return;

            isProcessing = true;

            const userEntry: TranscriptEntry = {
                id: generateId(),
                role: "user",
                content,
                ts: Date.now(),
            };
            transcript.push(userEntry);
            emitState();

            runConversationLoop()
                .catch((err) => {
                    context.logger.error("conversation_loop_error", err);
                })
                .finally(() => {
                    isProcessing = false;
                    emitState();
                });
        },

        resolveWriteReview(reviewId: string, decision: "accept" | "reject") {
            if (pendingWriteReview && pendingWriteReview.id === reviewId) {
                pendingWriteReview.resolve(decision);
            }
        },

        resolveShellReview(reviewId: string, decision: ShellDecision) {
            if (pendingShellReview && pendingShellReview.id === reviewId) {
                pendingShellReview.resolve(decision);
            }
        },

        getModel() {
            return provider.model;
        },

        stop() {
            stopped = true;
            if (pendingWriteReview) {
                pendingWriteReview.resolve("reject");
            }
            if (pendingShellReview) {
                pendingShellReview.resolve("deny");
            }
        },
    };
}
