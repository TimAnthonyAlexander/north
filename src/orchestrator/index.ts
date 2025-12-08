import {
  createProvider,
  type Message,
  type Provider,
  type ToolCall,
  type StreamResult,
} from "../provider/anthropic";
import { createToolRegistryWithAllTools } from "../tools/index";
import type { ToolRegistry } from "../tools/registry";
import type { ToolContext, ToolResult, EditPrepareResult, EditOperation, FileDiff } from "../tools/types";
import type { Logger } from "../logging/index";
import { applyEditsAtomically } from "../utils/editing";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "tool" | "diff_review";
  content: string;
  isStreaming: boolean;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: ToolResult;
  diffContent?: FileDiff[];
  filesCount?: number;
  applyPayload?: EditOperation[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  toolCallId?: string;
}

export interface OrchestratorState {
  transcript: TranscriptEntry[];
  isProcessing: boolean;
  pendingReviewId: string | null;
}

export interface OrchestratorCallbacks {
  onStateChange: (state: OrchestratorState) => void;
  onRequestStart: (requestId: string, model: string) => void;
  onRequestComplete: (requestId: string, durationMs: number, error?: Error) => void;
  onToolCallStart?: (toolName: string, args: unknown) => void;
  onToolCallComplete?: (toolName: string, durationMs: number, ok: boolean) => void;
  onWriteReviewShown?: (filesCount: number, toolName: string) => void;
  onWriteReviewDecision?: (decision: "accept" | "reject", filesCount: number) => void;
  onWriteApplyStart?: () => void;
  onWriteApplyComplete?: (durationMs: number, ok: boolean) => void;
}

export interface OrchestratorOptions {
  repoRoot: string;
  logger: Logger;
}

export interface Orchestrator {
  getState(): OrchestratorState;
  sendMessage(content: string): void;
  getModel(): string;
  resolveWriteReview(entryId: string, decision: "accept" | "reject"): void;
}

const STREAM_THROTTLE_MS = 32;

let entryIdCounter = 0;
function generateEntryId(): string {
  return `entry-${++entryIdCounter}`;
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatToolIntent(toolName: string, input: unknown): string {
  const args = input as Record<string, unknown>;
  switch (toolName) {
    case "list_root":
      return "Listing repository root...";
    case "find_files":
      return `Finding files: pattern="${args.pattern}"`;
    case "search_text":
      return `Searching: "${args.query}"${args.path ? ` in ${args.path}` : ""}`;
    case "read_file":
      return `Reading: ${args.path}${args.range ? ` (lines ${(args.range as Record<string, number>).start}-${(args.range as Record<string, number>).end})` : ""}`;
    case "read_readme":
      return "Reading README...";
    case "detect_languages":
      return "Detecting language composition...";
    case "hotfiles":
      return `Finding hotfiles (limit: ${args.limit || 10})...`;
    case "edit_replace_exact":
      return `Preparing edit: replace in ${args.path}`;
    case "edit_insert_at_line":
      return `Preparing edit: insert at line ${args.line} in ${args.path}`;
    case "edit_create_file":
      return `Preparing edit: create ${args.path}`;
    case "edit_apply_batch":
      return `Preparing batch edit: ${(args.edits as unknown[])?.length || 0} operations`;
    default:
      return `Tool: ${toolName}`;
  }
}

function formatToolResultForTranscript(toolName: string, result: ToolResult): string {
  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const data = result.data as Record<string, unknown>;

  switch (toolName) {
    case "list_root": {
      const entries = data.entries as Array<{ name: string; type: string }>;
      const dirs = entries.filter((e) => e.type === "dir").map((e) => `${e.name}/`);
      const files = entries.filter((e) => e.type === "file").map((e) => e.name);
      const list = [...dirs.slice(0, 5), ...files.slice(0, 5)];
      const more = entries.length - list.length;
      return list.join(", ") + (more > 0 ? ` (+${more} more)` : "");
    }
    case "find_files": {
      const files = data.files as string[];
      const truncated = data.truncated as boolean;
      if (files.length === 0) return "No files found";
      const shown = files.slice(0, 5).join(", ");
      const moreCount = files.length > 5 ? files.length - 5 : 0;
      return shown + (moreCount > 0 || truncated ? ` (+${moreCount}${truncated ? "+" : ""} more)` : "");
    }
    case "search_text": {
      const matches = data.matches as Array<{ path: string; line: number; preview: string }>;
      const truncated = data.truncated as boolean;
      if (matches.length === 0) return "No matches found";
      const shown = matches.slice(0, 3).map((m) => `${m.path}:${m.line}`).join(", ");
      return `${matches.length} matches: ${shown}${matches.length > 3 || truncated ? " ..." : ""}`;
    }
    case "read_file": {
      const lines = (data.endLine as number) - (data.startLine as number) + 1;
      const truncated = data.truncated as boolean;
      return `${data.path} (${lines} lines${truncated ? ", truncated" : ""})`;
    }
    case "read_readme": {
      const truncated = data.truncated as boolean;
      return `${data.path}${truncated ? " (truncated)" : ""}`;
    }
    case "detect_languages": {
      const languages = data.languages as Array<{ language: string; percent: number }>;
      if (languages.length === 0) return "No code files detected";
      return languages.slice(0, 4).map((l) => `${l.language}: ${l.percent.toFixed(0)}%`).join(", ");
    }
    case "hotfiles": {
      const files = data.files as Array<{ path: string }>;
      const method = data.method as string;
      if (files.length === 0) return "No hotfiles found";
      return `${files.length} files (${method}): ${files.slice(0, 3).map((f) => f.path).join(", ")}`;
    }
    case "edit_replace_exact":
    case "edit_insert_at_line":
    case "edit_create_file":
    case "edit_apply_batch": {
      const stats = data.stats as { filesChanged: number; totalLinesAdded: number; totalLinesRemoved: number };
      return `${stats.filesChanged} file(s), +${stats.totalLinesAdded}/-${stats.totalLinesRemoved} lines`;
    }
    default:
      return "Done";
  }
}

export function createOrchestratorWithTools(
  callbacks: OrchestratorCallbacks,
  options: OrchestratorOptions
): Orchestrator {
  const provider: Provider = createProvider();
  const registry: ToolRegistry = createToolRegistryWithAllTools();

  const state: OrchestratorState = {
    transcript: [],
    isProcessing: false,
    pendingReviewId: null,
  };

  const toolContext: ToolContext = {
    repoRoot: options.repoRoot,
    logger: options.logger,
  };

  let pendingEmit: ReturnType<typeof setTimeout> | null = null;
  let streamBuffer = "";
  let currentAssistantEntryId: string | null = null;

  let pendingReviewResolve: ((decision: "accept" | "reject") => void) | null = null;

  function emitState(): void {
    callbacks.onStateChange({ ...state, transcript: [...state.transcript] });
  }

  function emitStateThrottled(): void {
    if (pendingEmit) return;
    pendingEmit = setTimeout(() => {
      pendingEmit = null;
      flushStreamBuffer();
      emitState();
    }, STREAM_THROTTLE_MS);
  }

  function flushStreamBuffer(): void {
    if (!streamBuffer || !currentAssistantEntryId) return;
    const entry = state.transcript.find((e) => e.id === currentAssistantEntryId);
    if (entry && entry.role === "assistant" && entry.isStreaming) {
      entry.content += streamBuffer;
      streamBuffer = "";
    }
  }

  async function waitForWriteReview(
    entryId: string,
    toolName: string,
    prepareResult: EditPrepareResult,
    toolCallId: string
  ): Promise<{ decision: "accept" | "reject"; applied: boolean; error?: string }> {
    const reviewEntry: TranscriptEntry = {
      id: entryId,
      role: "diff_review",
      content: "",
      isStreaming: false,
      toolName,
      diffContent: prepareResult.diffsByFile,
      filesCount: prepareResult.stats.filesChanged,
      applyPayload: prepareResult.applyPayload,
      reviewStatus: "pending",
      toolCallId,
    };

    state.transcript.push(reviewEntry);
    state.pendingReviewId = entryId;
    emitState();

    callbacks.onWriteReviewShown?.(prepareResult.stats.filesChanged, toolName);

    const decision = await new Promise<"accept" | "reject">((resolve) => {
      pendingReviewResolve = resolve;
    });

    pendingReviewResolve = null;
    callbacks.onWriteReviewDecision?.(decision, prepareResult.stats.filesChanged);

    const entry = state.transcript.find((e) => e.id === entryId);
    if (!entry) {
      return { decision, applied: false, error: "Review entry not found" };
    }

    if (decision === "reject") {
      entry.reviewStatus = "rejected";
      state.pendingReviewId = null;
      emitState();
      return { decision, applied: false };
    }

    callbacks.onWriteApplyStart?.();
    const applyStartTime = Date.now();

    const applyResult = applyEditsAtomically(options.repoRoot, prepareResult.applyPayload);

    const applyDuration = Date.now() - applyStartTime;
    callbacks.onWriteApplyComplete?.(applyDuration, applyResult.ok);

    entry.reviewStatus = applyResult.ok ? "accepted" : "rejected";
    state.pendingReviewId = null;
    emitState();

    return {
      decision,
      applied: applyResult.ok,
      error: applyResult.error,
    };
  }

  async function executeToolCall(toolCall: ToolCall): Promise<{ result: ToolResult; reviewEntryId?: string }> {
    const startTime = Date.now();
    callbacks.onToolCallStart?.(toolCall.name, toolCall.input);

    const approvalPolicy = registry.getApprovalPolicy(toolCall.name);

    const result = await registry.execute(toolCall.name, toolCall.input, toolContext);

    callbacks.onToolCallComplete?.(toolCall.name, Date.now() - startTime, result.ok);

    if (approvalPolicy === "write" && result.ok) {
      const prepareResult = result.data as EditPrepareResult;
      const reviewEntryId = generateEntryId();

      const reviewOutcome = await waitForWriteReview(
        reviewEntryId,
        toolCall.name,
        prepareResult,
        toolCall.id
      );

      const toolResultData = {
        ok: reviewOutcome.applied,
        applied: reviewOutcome.applied,
        decision: reviewOutcome.decision,
        stats: prepareResult.stats,
        error: reviewOutcome.error,
      };

      return {
        result: {
          ok: reviewOutcome.decision === "accept",
          data: toolResultData,
          error: reviewOutcome.decision === "reject" ? "User rejected the changes" : reviewOutcome.error,
        },
        reviewEntryId,
      };
    }

    return { result };
  }

  async function processUserMessage(userContent: string): Promise<void> {
    const userEntry: TranscriptEntry = {
      id: generateEntryId(),
      role: "user",
      content: userContent,
      isStreaming: false,
    };
    state.transcript.push(userEntry);
    emitState();

    const conversationMessages: Message[] = [];

    for (const entry of state.transcript) {
      if (entry.isStreaming) continue;
      if (entry.role === "tool") continue;
      if (entry.role === "diff_review") continue;
      if (entry.role === "user") {
        conversationMessages.push({ role: "user", content: entry.content });
      } else if (entry.role === "assistant") {
        conversationMessages.push({ role: "assistant", content: entry.content });
      }
    }

    let continueLoop = true;

    while (continueLoop) {
      const assistantEntryId = generateEntryId();
      currentAssistantEntryId = assistantEntryId;

      const assistantEntry: TranscriptEntry = {
        id: assistantEntryId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      state.transcript.push(assistantEntry);
      state.isProcessing = true;
      emitState();

      const requestId = generateRequestId();
      const startTime = Date.now();
      callbacks.onRequestStart(requestId, provider.model);

      streamBuffer = "";

      const toolSchemas = registry.getSchemas();

      let result: StreamResult;
      try {
        result = await new Promise<StreamResult>((resolve, reject) => {
          provider.stream(
            conversationMessages,
            {
              onChunk(chunk: string) {
                streamBuffer += chunk;
                emitStateThrottled();
              },
              onToolCall(toolCall: ToolCall) {
                const toolEntry: TranscriptEntry = {
                  id: generateEntryId(),
                  role: "tool",
                  content: formatToolIntent(toolCall.name, toolCall.input),
                  isStreaming: true,
                  toolName: toolCall.name,
                  toolInput: toolCall.input,
                };
                state.transcript.push(toolEntry);
                emitState();
              },
              onComplete(r: StreamResult) {
                if (pendingEmit) {
                  clearTimeout(pendingEmit);
                  pendingEmit = null;
                }
                flushStreamBuffer();
                const entry = state.transcript.find((e) => e.id === assistantEntryId);
                if (entry) {
                  entry.isStreaming = false;
                }
                emitState();
                callbacks.onRequestComplete(requestId, Date.now() - startTime);
                resolve(r);
              },
              onError(error: Error) {
                if (pendingEmit) {
                  clearTimeout(pendingEmit);
                  pendingEmit = null;
                }
                flushStreamBuffer();
                const entry = state.transcript.find((e) => e.id === assistantEntryId);
                if (entry) {
                  if (!entry.content) {
                    entry.content = `Error: ${error.message}`;
                  }
                  entry.isStreaming = false;
                }
                emitState();
                callbacks.onRequestComplete(requestId, Date.now() - startTime, error);
                reject(error);
              },
            },
            { tools: toolSchemas.length > 0 ? toolSchemas : undefined }
          );
        });
      } catch {
        continueLoop = false;
        break;
      }

      if (result.toolCalls.length > 0) {
        const assistantMessage = provider.buildAssistantMessage(result.text, result.toolCalls);
        conversationMessages.push(assistantMessage);

        const toolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> = [];

        for (const toolCall of result.toolCalls) {
          const { result: toolResult } = await executeToolCall(toolCall);

          const toolEntry = state.transcript.find(
            (e) =>
              e.role === "tool" &&
              e.toolName === toolCall.name &&
              e.isStreaming &&
              JSON.stringify(e.toolInput) === JSON.stringify(toolCall.input)
          );
          if (toolEntry) {
            toolEntry.isStreaming = false;
            toolEntry.toolResult = toolResult;
            toolEntry.content = formatToolResultForTranscript(toolCall.name, toolResult);
          }
          emitState();

          toolResults.push({
            toolCallId: toolCall.id,
            result: JSON.stringify(toolResult.ok ? toolResult.data : { error: toolResult.error }),
            isError: !toolResult.ok,
          });
        }

        const toolResultMessage = provider.buildToolResultMessage(toolResults);
        conversationMessages.push(toolResultMessage);
      } else {
        continueLoop = false;
      }
    }

    currentAssistantEntryId = null;
    state.isProcessing = false;
    emitState();
  }

  return {
    getState(): OrchestratorState {
      return { ...state, transcript: [...state.transcript] };
    },

    sendMessage(content: string): void {
      if (state.isProcessing) return;
      processUserMessage(content).catch((err) => {
        options.logger.error("orchestrator_error", err instanceof Error ? err : new Error(String(err)));
        state.isProcessing = false;
        emitState();
      });
    },

    getModel(): string {
      return provider.model;
    },

    resolveWriteReview(entryId: string, decision: "accept" | "reject"): void {
      if (state.pendingReviewId !== entryId) return;
      if (pendingReviewResolve) {
        pendingReviewResolve(decision);
      }
    },
  };
}
