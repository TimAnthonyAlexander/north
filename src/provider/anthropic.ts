import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
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

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onComplete: (result: StreamResult) => void;
  onError: (error: Error) => void;
}

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResultBlockParam[];
}

export interface ToolResultInput {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface Provider {
  model: string;
  stream(
    messages: Message[],
    callbacks: StreamCallbacks,
    options?: { tools?: ToolSchema[] }
  ): Promise<void>;
  buildToolResultMessage(results: ToolResultInput[]): Message;
  buildAssistantMessage(text: string, toolCalls: ToolCall[]): Message;
}

const SYSTEM_PROMPT = `You are North, a terminal assistant for codebases. You help developers understand and work with their code.

You have access to tools for exploring repositories:
- list_root: See the top-level files and directories
- find_files: Find files matching a pattern
- search_text: Search for text/symbols in the codebase
- read_file: Read file contents (whole file or specific lines)
- read_readme: Get the README content
- detect_languages: See the language composition of the repo
- hotfiles: Find the most frequently modified files

Guidelines:
- Use tools to gather context before answering questions about code
- Be concise and direct
- When you need more context, use tools rather than asking the user
- Prefer showing relevant code snippets over verbose explanations
- If a tool fails, explain what went wrong and try an alternative approach`;

export function createProvider(options?: { model?: string }): Provider {
  const client = new Anthropic();
  const model = options?.model || "claude-sonnet-4-20250514";

  return {
    model,

    async stream(
      messages: Message[],
      callbacks: StreamCallbacks,
      options?: { tools?: ToolSchema[] }
    ): Promise<void> {
      let fullText = "";
      const toolCalls: ToolCall[] = [];
      let currentToolId = "";
      let currentToolName = "";
      let currentToolInput = "";
      let stopReason: string | null = null;

      try {
        const apiMessages: MessageParam[] = messages.map((m) => {
          if (typeof m.content === "string") {
            return { role: m.role, content: m.content };
          }
          return { role: m.role, content: m.content as MessageParam["content"] };
        });

        const stream = await client.messages.stream({
          model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
          tools: options?.tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool["input_schema"],
          })),
        });

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = "";
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              const text = event.delta.text;
              fullText += text;
              callbacks.onChunk(text);
            } else if (event.delta.type === "input_json_delta") {
              currentToolInput += event.delta.partial_json;
            }
          } else if (event.type === "content_block_stop") {
            if (currentToolId && currentToolName) {
              let parsedInput: unknown = {};
              try {
                parsedInput = JSON.parse(currentToolInput || "{}");
              } catch {}
              const toolCall: ToolCall = {
                id: currentToolId,
                name: currentToolName,
                input: parsedInput,
              };
              toolCalls.push(toolCall);
              callbacks.onToolCall?.(toolCall);
              currentToolId = "";
              currentToolName = "";
              currentToolInput = "";
            }
          } else if (event.type === "message_delta") {
            if (event.delta.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          }
        }

        callbacks.onComplete({ text: fullText, toolCalls, stopReason });
      } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },

    buildToolResultMessage(results: ToolResultInput[]): Message {
      const content: ToolResultBlockParam[] = results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.toolCallId,
        content: r.result,
        is_error: r.isError,
      }));
      return { role: "user", content };
    },

    buildAssistantMessage(text: string, toolCalls: ToolCall[]): Message {
      const content: ContentBlock[] = [];
      if (text) {
        content.push({ type: "text", text } as TextBlock);
      }
      for (const tc of toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        } as ToolUseBlock);
      }
      return { role: "assistant", content };
    },
  };
}
