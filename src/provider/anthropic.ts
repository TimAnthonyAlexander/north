import Anthropic from "@anthropic-ai/sdk";

export type StreamCallback = (chunk: string) => void;
export type CompleteCallback = (fullText: string) => void;
export type ErrorCallback = (error: Error) => void;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  onChunk: StreamCallback;
  onComplete: CompleteCallback;
  onError: ErrorCallback;
}

export interface Provider {
  model: string;
  stream(messages: Message[], options: StreamOptions): Promise<void>;
}

const SYSTEM_PROMPT = `You are North, a terminal assistant for codebases. You help developers understand and work with their code.

Guidelines:
- Be concise and direct
- Focus on the user's actual question
- When you need more context, ask specific questions
- Prefer showing relevant code snippets over verbose explanations`;

export function createProvider(options?: { model?: string }): Provider {
  const client = new Anthropic();
  const model = options?.model || "claude-sonnet-4-20250514";

  return {
    model,

    async stream(messages: Message[], callbacks: StreamOptions): Promise<void> {
      let fullText = "";

      try {
        const stream = await client.messages.stream({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullText += text;
            callbacks.onChunk(text);
          }
        }

        callbacks.onComplete(fullText);
      } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}

