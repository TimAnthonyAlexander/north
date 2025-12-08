import { createProvider, type Message, type Provider } from "../provider/anthropic";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
}

export interface OrchestratorState {
  transcript: TranscriptEntry[];
  isProcessing: boolean;
}

export interface OrchestratorCallbacks {
  onStateChange: (state: OrchestratorState) => void;
  onRequestStart: (requestId: string, model: string) => void;
  onRequestComplete: (requestId: string, durationMs: number, error?: Error) => void;
}

export interface Orchestrator {
  getState(): OrchestratorState;
  sendMessage(content: string): void;
  getModel(): string;
}

const STREAM_THROTTLE_MS = 32;

let entryIdCounter = 0;
function generateEntryId(): string {
  return `entry-${++entryIdCounter}`;
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createOrchestrator(callbacks: OrchestratorCallbacks): Orchestrator {
  const provider: Provider = createProvider();
  const state: OrchestratorState = {
    transcript: [],
    isProcessing: false,
  };

  let pendingEmit: ReturnType<typeof setTimeout> | null = null;
  let streamBuffer = "";

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
    if (!streamBuffer) return;
    const lastEntry = state.transcript[state.transcript.length - 1];
    if (lastEntry && lastEntry.role === "assistant" && lastEntry.isStreaming) {
      lastEntry.content += streamBuffer;
      streamBuffer = "";
    }
  }

  function buildMessages(): Message[] {
    return state.transcript
      .filter((entry) => !entry.isStreaming)
      .map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
  }

  async function processUserMessage(userContent: string): Promise<void> {
    const messages = buildMessages();
    messages.push({ role: "user", content: userContent });

    const userEntry: TranscriptEntry = {
      id: generateEntryId(),
      role: "user",
      content: userContent,
      isStreaming: false,
    };
    state.transcript.push(userEntry);
    emitState();

    const assistantEntry: TranscriptEntry = {
      id: generateEntryId(),
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

    await provider.stream(messages, {
      onChunk(chunk: string) {
        streamBuffer += chunk;
        emitStateThrottled();
      },
      onComplete() {
        if (pendingEmit) {
          clearTimeout(pendingEmit);
          pendingEmit = null;
        }
        flushStreamBuffer();
        const lastEntry = state.transcript[state.transcript.length - 1];
        if (lastEntry) {
          lastEntry.isStreaming = false;
        }
        state.isProcessing = false;
        emitState();
        callbacks.onRequestComplete(requestId, Date.now() - startTime);
      },
      onError(error: Error) {
        if (pendingEmit) {
          clearTimeout(pendingEmit);
          pendingEmit = null;
        }
        flushStreamBuffer();
        const lastEntry = state.transcript[state.transcript.length - 1];
        if (lastEntry) {
          if (!lastEntry.content) {
            lastEntry.content = `Error: ${error.message}`;
          }
          lastEntry.isStreaming = false;
        }
        state.isProcessing = false;
        emitState();
        callbacks.onRequestComplete(requestId, Date.now() - startTime, error);
      },
    });
  }

  return {
    getState(): OrchestratorState {
      return { ...state, transcript: [...state.transcript] };
    },

    sendMessage(content: string): void {
      if (state.isProcessing) return;
      processUserMessage(content);
    },

    getModel(): string {
      return provider.model;
    },
  };
}

