import { describe, expect, test, mock, beforeEach } from "bun:test";
import { convertToolsToOpenAI, createOpenAIProvider, type OpenAITool } from "../src/provider/openai";
import type { ToolSchema, StreamCallbacks } from "../src/provider/anthropic";

describe("OpenAI Provider", () => {
    describe("convertToolsToOpenAI", () => {
        test("converts tool schema to OpenAI Responses API format with name at top level", () => {
            const tools: ToolSchema[] = [
                {
                    name: "read_file",
                    description: "Read a file from the repository",
                    input_schema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description: "The file path to read",
                            },
                        },
                        required: ["path"],
                    },
                },
            ];

            const result = convertToolsToOpenAI(tools);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("function");
            expect(result[0].name).toBe("read_file");
            expect(result[0].description).toBe("Read a file from the repository");
            expect(result[0]).not.toHaveProperty("strict");

            const params = result[0].parameters as Record<string, unknown>;
            expect(params.type).toBe("object");
            expect(params.required).toEqual(["path"]);
            expect(params.additionalProperties).toBe(false);
        });

        test("name is at top level, not nested under function property", () => {
            const tools: ToolSchema[] = [
                {
                    name: "test_tool",
                    description: "A test tool",
                    input_schema: {
                        type: "object",
                        properties: {},
                    },
                },
            ];

            const result = convertToolsToOpenAI(tools);

            expect(result[0]).toHaveProperty("name");
            expect(result[0].name).toBe("test_tool");
            expect(result[0]).not.toHaveProperty("function");
        });

        test("converts multiple tools correctly", () => {
            const tools: ToolSchema[] = [
                {
                    name: "list_root",
                    description: "List repository root",
                    input_schema: { type: "object", properties: {} },
                },
                {
                    name: "search_text",
                    description: "Search for text",
                    input_schema: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query" },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "shell_run",
                    description: "Run a shell command",
                    input_schema: {
                        type: "object",
                        properties: {
                            command: { type: "string", description: "Command to run" },
                        },
                        required: ["command"],
                    },
                },
            ];

            const result = convertToolsToOpenAI(tools);

            expect(result).toHaveLength(3);
            expect(result.map((t) => t.name)).toEqual(["list_root", "search_text", "shell_run"]);
            result.forEach((tool) => {
                expect(tool.type).toBe("function");
                expect(tool).not.toHaveProperty("strict");
                expect(tool).toHaveProperty("name");
                expect(tool).toHaveProperty("description");
                expect(tool).toHaveProperty("parameters");
            });
        });

        test("empty tools array returns empty array", () => {
            const result = convertToolsToOpenAI([]);
            expect(result).toEqual([]);
        });

        test("adds additionalProperties:false for object schemas", () => {
            const tools: ToolSchema[] = [
                {
                    name: "list_root",
                    description: "List root",
                    input_schema: { type: "object", properties: {} },
                },
            ];

            const [result] = convertToolsToOpenAI(tools);
            const params = result.parameters as Record<string, unknown>;

            expect(params.additionalProperties).toBe(false);
            expect(params).not.toHaveProperty("required");
        });

        test("does not auto-generate required array (allows optional fields)", () => {
            const tools: ToolSchema[] = [
                {
                    name: "read_file",
                    description: "Read a file",
                    input_schema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "File path" },
                            range: { type: "object", description: "Line range" },
                        },
                    },
                },
            ];

            const [result] = convertToolsToOpenAI(tools);
            const params = result.parameters as Record<string, unknown>;

            expect(params.additionalProperties).toBe(false);
            expect(params).not.toHaveProperty("required");
        });

        test("preserves existing required array as authored", () => {
            const tools: ToolSchema[] = [
                {
                    name: "search_text",
                    description: "Search for text",
                    input_schema: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query" },
                            limit: { type: "number", description: "Max results" },
                        },
                        required: ["query"],
                    },
                },
            ];

            const [result] = convertToolsToOpenAI(tools);
            const params = result.parameters as Record<string, unknown>;

            expect(params.additionalProperties).toBe(false);
            expect(params.required).toEqual(["query"]);
        });

        test("normalizes nested object schemas recursively", () => {
            const tools: ToolSchema[] = [
                {
                    name: "edit_file",
                    description: "Edit a file",
                    input_schema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "File path" },
                            options: {
                                type: "object",
                                properties: {
                                    overwrite: { type: "boolean", description: "Overwrite" },
                                },
                            },
                        },
                    },
                },
            ];

            const [result] = convertToolsToOpenAI(tools);
            const params = result.parameters as Record<string, unknown>;
            const props = params.properties as Record<string, Record<string, unknown>>;
            const nestedOptions = props.options;

            expect(params.additionalProperties).toBe(false);
            expect(nestedOptions.additionalProperties).toBe(false);
            expect(nestedOptions).not.toHaveProperty("required");
        });

        test("produces valid OpenAI Responses API tool format", () => {
            const tool: ToolSchema = {
                name: "edit_replace_exact",
                description: "Replace exact text in a file",
                input_schema: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "File path" },
                        old: { type: "string", description: "Text to find" },
                        new: { type: "string", description: "Replacement text" },
                    },
                    required: ["path", "old", "new"],
                },
            };

            const [result] = convertToolsToOpenAI([tool]);

            expect(result.type).toBe("function");
            expect(result.name).toBe("edit_replace_exact");
            expect(result.description).toBe("Replace exact text in a file");
            expect(result).not.toHaveProperty("strict");

            const params = result.parameters as Record<string, unknown>;
            expect(params.type).toBe("object");
            expect(params.required).toEqual(["path", "old", "new"]);
            expect(params.additionalProperties).toBe(false);
        });
    });

    describe("createOpenAIProvider", () => {
        test("returns provider with correct default model", () => {
            const provider = createOpenAIProvider();
            expect(provider.defaultModel).toBe("gpt-5.1");
        });

        test("returns provider with custom model", () => {
            const provider = createOpenAIProvider({ model: "gpt-5.1-codex" });
            expect(provider.defaultModel).toBe("gpt-5.1-codex");
        });

        test("has system prompt defined", () => {
            const provider = createOpenAIProvider();
            expect(provider.systemPrompt).toBeDefined();
            expect(provider.systemPrompt.length).toBeGreaterThan(100);
        });

        test("buildToolResultMessage creates correct structure", () => {
            const provider = createOpenAIProvider();
            const result = provider.buildToolResultMessage([
                { toolCallId: "call_123", result: '{"ok": true}', isError: false },
            ]);

            expect(result.role).toBe("user");
            expect(Array.isArray(result.content)).toBe(true);
            const content = result.content as Array<{ type: string; tool_use_id: string }>;
            expect(content[0].type).toBe("tool_result");
            expect(content[0].tool_use_id).toBe("call_123");
        });

        test("buildAssistantMessage includes text and tool calls", () => {
            const provider = createOpenAIProvider();
            const result = provider.buildAssistantMessage("Hello", [
                { id: "call_456", name: "read_file", input: { path: "test.txt" } },
            ]);

            expect(result.role).toBe("assistant");
            expect(Array.isArray(result.content)).toBe(true);
            const content = result.content as Array<{ type: string }>;
            expect(content).toHaveLength(2);
            expect(content[0].type).toBe("text");
            expect(content[1].type).toBe("tool_use");
        });
    });

    describe("SSE streaming", () => {
        const originalFetch = globalThis.fetch;

        beforeEach(() => {
            globalThis.fetch = originalFetch;
        });

        function createMockSSEResponse(events: string[]): Response {
            const sseData = events.map((e) => `data: ${e}`).join("\n\n") + "\n\n";
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData));
                    controller.close();
                },
            });
            return new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" },
            });
        }

        test("parses text delta events correctly", async () => {
            process.env.OPENAI_API_KEY = "test-key";

            const events = [
                JSON.stringify({ type: "response.output_text.delta", delta: "Hello" }),
                JSON.stringify({ type: "response.output_text.delta", delta: " world" }),
                JSON.stringify({ type: "response.completed", response: { id: "resp_1", status: "completed", output: [] } }),
            ];

            globalThis.fetch = mock(() => Promise.resolve(createMockSSEResponse(events)));

            const provider = createOpenAIProvider();
            const chunks: string[] = [];
            let completed = false;

            await provider.stream(
                [{ role: "user", content: "Hi" }],
                {
                    onChunk: (chunk) => chunks.push(chunk),
                    onComplete: (result) => {
                        completed = true;
                        expect(result.text).toBe("Hello world");
                        expect(result.stopReason).toBe("end_turn");
                    },
                    onError: () => {},
                }
            );

            expect(completed).toBe(true);
            expect(chunks).toEqual(["Hello", " world"]);
        });

        test("parses function call events correctly", async () => {
            process.env.OPENAI_API_KEY = "test-key";

            const events = [
                JSON.stringify({
                    type: "response.output_item.added",
                    item: { type: "function_call", id: "fc_001", name: "read_file", arguments: "" },
                }),
                JSON.stringify({
                    type: "response.function_call_arguments.delta",
                    item_id: "fc_001",
                    delta: '{"path":',
                }),
                JSON.stringify({
                    type: "response.function_call_arguments.delta",
                    item_id: "fc_001",
                    delta: '"test.txt"}',
                }),
                JSON.stringify({
                    type: "response.function_call_arguments.done",
                    item_id: "fc_001",
                    name: "read_file",
                    arguments: '{"path":"test.txt"}',
                }),
                JSON.stringify({
                    type: "response.completed",
                    response: {
                        id: "resp_1",
                        status: "completed",
                        output: [{ type: "function_call", id: "fc_001", name: "read_file", arguments: '{"path":"test.txt"}' }],
                    },
                }),
            ];

            globalThis.fetch = mock(() => Promise.resolve(createMockSSEResponse(events)));

            const provider = createOpenAIProvider();
            const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
            let completed = false;

            await provider.stream(
                [{ role: "user", content: "Read test.txt" }],
                {
                    onChunk: () => {},
                    onToolCall: (tc) => toolCalls.push(tc),
                    onComplete: (result) => {
                        completed = true;
                        expect(result.stopReason).toBe("tool_use");
                    },
                    onError: () => {},
                }
            );

            expect(completed).toBe(true);
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].id).toBe("fc_001");
            expect(toolCalls[0].name).toBe("read_file");
            expect(toolCalls[0].input).toEqual({ path: "test.txt" });
        });

        test("handles response.failed event", async () => {
            process.env.OPENAI_API_KEY = "test-key";

            const events = [
                JSON.stringify({
                    type: "response.failed",
                    error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "rate_limit" },
                }),
            ];

            globalThis.fetch = mock(() => Promise.resolve(createMockSSEResponse(events)));

            const provider = createOpenAIProvider();
            let errorReceived: Error | null = null;

            await provider.stream(
                [{ role: "user", content: "Hi" }],
                {
                    onChunk: () => {},
                    onComplete: () => {},
                    onError: (err) => {
                        errorReceived = err;
                    },
                }
            );

            expect(errorReceived).not.toBeNull();
            expect(errorReceived!.message).toBe("Rate limit exceeded");
        });

        test("handles missing API key", async () => {
            const originalKey = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;

            const provider = createOpenAIProvider();
            let errorReceived: Error | null = null;

            await provider.stream(
                [{ role: "user", content: "Hi" }],
                {
                    onChunk: () => {},
                    onComplete: () => {},
                    onError: (err) => {
                        errorReceived = err;
                    },
                }
            );

            expect(errorReceived).not.toBeNull();
            expect(errorReceived!.message).toContain("OPENAI_API_KEY");

            if (originalKey) process.env.OPENAI_API_KEY = originalKey;
        });
    });
});

