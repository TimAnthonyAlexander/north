import { createProvider, type Provider, type Message, type ToolCall } from "../provider/anthropic";
import { createToolRegistryWithAllTools, type ToolRegistry } from "../tools/index";
import type { Logger } from "../logging/index";
import type { FileDiff, EditPrepareResult } from "../tools/types";
import { applyEditsAtomically } from "../utils/editing";

export interface TranscriptEntry {
    id: string;
    role: "user" | "assistant" | "tool" | "diff_review";
    content: string;
    ts: number;
    isStreaming?: boolean;
    toolResult?: { ok: boolean; data?: unknown; error?: string };
    diffContent?: FileDiff[];
    filesCount?: number;
    toolName?: string;
    reviewStatus?: "pending" | "accepted" | "rejected";
    applyPayload?: unknown;
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
}

export interface OrchestratorContext {
    repoRoot: string;
    logger: Logger;
}

export interface Orchestrator {
    sendMessage(content: string): void;
    resolveWriteReview(reviewId: string, decision: "accept" | "reject"): void;
    getModel(): string;
    stop(): void;
}

interface PendingReview {
    id: string;
    resolve: (decision: "accept" | "reject") => void;
    filesCount: number;
    applyPayload: unknown;
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
    let pendingReview: PendingReview | null = null;
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
                if (toolCallId && !writeToolCallIds.has(toolCallId)) {
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

    async function executeToolCall(
        toolCall: ToolCall,
        assistantId: string
    ): Promise<{ needsReview: boolean; entry: TranscriptEntry }> {
        const toolName = toolCall.name;
        const args = toolCall.input;
        const policy = registry.getApprovalPolicy(toolName);

        if (policy === "write") {
            writeToolCallIds.add(toolCall.id);
        }

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

            return { needsReview: true, entry: reviewEntry };
        }

        updateEntry(toolEntryId, { toolResult: result });
        emitState();

        return { needsReview: false, entry: toolEntry };
    }

    async function waitForReviewDecision(reviewEntry: TranscriptEntry): Promise<"accept" | "reject"> {
        pendingReviewId = reviewEntry.id;
        emitState();

        return new Promise((resolve) => {
            pendingReview = {
                id: reviewEntry.id,
                resolve,
                filesCount: reviewEntry.filesCount || 0,
                applyPayload: reviewEntry.applyPayload,
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
        pendingReview = null;
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

            let streamResult: { text: string; toolCalls: ToolCall[]; stopReason: string | null } | null = null;
            let streamError: Error | null = null;

            await new Promise<void>((resolve) => {
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
                            streamResult = result;
                            resolve();
                        },
                        onError(error: Error) {
                            streamError = error;
                            resolve();
                        },
                    },
                    { tools: toolSchemas }
                );
            });

            flushStreamBuffer();
            currentAssistantId = null;

            const requestDuration = Date.now() - requestStart;

            if (streamError) {
                callbacks.onRequestComplete?.(requestId, requestDuration, streamError);
                updateEntry(assistantId, {
                    isStreaming: false,
                    content: findEntry(assistantId)?.content + `\n\n[Error: ${streamError.message}]`,
                });
                emitState();
                break;
            }

            if (!streamResult) {
                break;
            }

            callbacks.onRequestComplete?.(requestId, requestDuration);

            updateEntry(assistantId, {
                isStreaming: false,
                content: streamResult.text,
            });
            emitState();

            if (streamResult.stopReason !== "tool_use" || streamResult.toolCalls.length === 0) {
                break;
            }

            for (const toolCall of streamResult.toolCalls) {
                if (stopped) break;

                const { needsReview, entry } = await executeToolCall(toolCall, assistantId);

                if (needsReview) {
                    const decision = await waitForReviewDecision(entry);
                    await applyWriteDecision(entry, decision);
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
            if (pendingReview && pendingReview.id === reviewId) {
                pendingReview.resolve(decision);
            }
        },

        getModel() {
            return provider.model;
        },

        stop() {
            stopped = true;
            if (pendingReview) {
                pendingReview.resolve("reject");
            }
        },
    };
}
