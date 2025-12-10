import { describe, test, expect } from "bun:test";
import { createToolRegistry } from "../src/tools/registry";
import { listRootTool } from "../src/tools/list_root";
import { findFilesTool } from "../src/tools/find_files";
import { searchTextTool } from "../src/tools/search_text";
import { readFileTool } from "../src/tools/read_file";
import { getLineCountTool } from "../src/tools/get_line_count";
import { getFileSymbolsTool } from "../src/tools/get_file_symbols";
import { getFileOutlineTool } from "../src/tools/get_file_outline";
import { readReadmeTool } from "../src/tools/read_readme";
import { detectLanguagesTool } from "../src/tools/detect_languages";
import { hotfilesTool } from "../src/tools/hotfiles";
import { editReplaceExactTool } from "../src/tools/edit_replace_exact";
import { editInsertAtLineTool } from "../src/tools/edit_insert_at_line";
import { editApplyBatchTool } from "../src/tools/edit_apply_batch";
import { shellRunTool } from "../src/tools/shell_run";
import type { ToolContext } from "../src/tools/types";

const dummyContext: ToolContext = {
    repoRoot: "/tmp/test",
    logger: {
        info: () => {},
        error: () => {},
        debug: () => {},
    },
};

const ALL_TOOLS = [
    listRootTool,
    findFilesTool,
    searchTextTool,
    readFileTool,
    getLineCountTool,
    getFileSymbolsTool,
    getFileOutlineTool,
    readReadmeTool,
    detectLanguagesTool,
    hotfilesTool,
    editReplaceExactTool,
    editInsertAtLineTool,
    editApplyBatchTool,
    shellRunTool,
];

describe("Tool Schema Tests", () => {
    describe("Tool Metadata", () => {
        test("list_root has correct metadata", () => {
            expect(listRootTool.name).toBe("list_root");
            expect(listRootTool.approvalPolicy).toBeUndefined();
            expect(listRootTool.description).toBeTruthy();
            expect(listRootTool.inputSchema).toBeTruthy();
            expect(listRootTool.inputSchema.type).toBe("object");
        });

        test("find_files has correct metadata", () => {
            expect(findFilesTool.name).toBe("find_files");
            expect(findFilesTool.approvalPolicy).toBeUndefined();
            expect(findFilesTool.description).toBeTruthy();
            expect(findFilesTool.inputSchema.properties?.pattern).toBeTruthy();
        });

        test("search_text has correct metadata", () => {
            expect(searchTextTool.name).toBe("search_text");
            expect(searchTextTool.approvalPolicy).toBeUndefined();
            expect(searchTextTool.inputSchema.properties?.query).toBeTruthy();
            expect(searchTextTool.inputSchema.required).toContain("query");
        });

        test("read_file has correct metadata", () => {
            expect(readFileTool.name).toBe("read_file");
            expect(readFileTool.approvalPolicy).toBeUndefined();
            expect(readFileTool.inputSchema.properties?.path).toBeTruthy();
            expect(readFileTool.inputSchema.required).toContain("path");
        });

        test("get_line_count has correct metadata", () => {
            expect(getLineCountTool.name).toBe("get_line_count");
            expect(getLineCountTool.approvalPolicy).toBeUndefined();
            expect(getLineCountTool.inputSchema.properties?.path).toBeTruthy();
        });

        test("get_file_symbols has correct metadata", () => {
            expect(getFileSymbolsTool.name).toBe("get_file_symbols");
            expect(getFileSymbolsTool.approvalPolicy).toBeUndefined();
            expect(getFileSymbolsTool.inputSchema.properties?.path).toBeTruthy();
        });

        test("get_file_outline has correct metadata", () => {
            expect(getFileOutlineTool.name).toBe("get_file_outline");
            expect(getFileOutlineTool.approvalPolicy).toBeUndefined();
            expect(getFileOutlineTool.inputSchema.properties?.path).toBeTruthy();
        });

        test("read_readme has correct metadata", () => {
            expect(readReadmeTool.name).toBe("read_readme");
            expect(readReadmeTool.approvalPolicy).toBeUndefined();
            expect(readReadmeTool.description).toBeTruthy();
        });

        test("detect_languages has correct metadata", () => {
            expect(detectLanguagesTool.name).toBe("detect_languages");
            expect(detectLanguagesTool.approvalPolicy).toBeUndefined();
            expect(detectLanguagesTool.description).toBeTruthy();
        });

        test("hotfiles has correct metadata", () => {
            expect(hotfilesTool.name).toBe("hotfiles");
            expect(hotfilesTool.approvalPolicy).toBeUndefined();
            expect(hotfilesTool.description).toBeTruthy();
        });

        test("edit_replace_exact has correct metadata", () => {
            expect(editReplaceExactTool.name).toBe("edit_replace_exact");
            expect(editReplaceExactTool.approvalPolicy).toBe("write");
            expect(editReplaceExactTool.inputSchema.properties?.path).toBeTruthy();
            expect(editReplaceExactTool.inputSchema.properties?.old).toBeTruthy();
            expect(editReplaceExactTool.inputSchema.properties?.new).toBeTruthy();
            expect(editReplaceExactTool.inputSchema.required).toContain("path");
            expect(editReplaceExactTool.inputSchema.required).toContain("old");
            expect(editReplaceExactTool.inputSchema.required).toContain("new");
        });

        test("edit_insert_at_line has correct metadata", () => {
            expect(editInsertAtLineTool.name).toBe("edit_insert_at_line");
            expect(editInsertAtLineTool.approvalPolicy).toBe("write");
            expect(editInsertAtLineTool.inputSchema.properties?.path).toBeTruthy();
            expect(editInsertAtLineTool.inputSchema.properties?.line).toBeTruthy();
            expect(editInsertAtLineTool.inputSchema.properties?.content).toBeTruthy();
        });

        test("edit_apply_batch has correct metadata", () => {
            expect(editApplyBatchTool.name).toBe("edit_apply_batch");
            expect(editApplyBatchTool.approvalPolicy).toBe("write");
            expect(editApplyBatchTool.inputSchema.properties?.edits).toBeTruthy();
            expect(editApplyBatchTool.inputSchema.required).toContain("edits");
        });

        test("shell_run has correct metadata", () => {
            expect(shellRunTool.name).toBe("shell_run");
            expect(shellRunTool.approvalPolicy).toBe("shell");
            expect(shellRunTool.inputSchema.properties?.command).toBeTruthy();
            expect(shellRunTool.inputSchema.required).toContain("command");
        });
    });

    describe("Approval Policies", () => {
        test("read/navigation tools have no approval policy", () => {
            const readTools = [
                listRootTool,
                findFilesTool,
                searchTextTool,
                readFileTool,
                getLineCountTool,
                getFileSymbolsTool,
                getFileOutlineTool,
                readReadmeTool,
                detectLanguagesTool,
                hotfilesTool,
            ];

            for (const tool of readTools) {
                expect(tool.approvalPolicy).toBeUndefined();
            }
        });

        test("edit tools have write approval policy", () => {
            const editTools = [
                editReplaceExactTool,
                editInsertAtLineTool,
                editApplyBatchTool,
            ];

            for (const tool of editTools) {
                expect(tool.approvalPolicy).toBe("write");
            }
        });

        test("shell tool has shell approval policy", () => {
            expect(shellRunTool.approvalPolicy).toBe("shell");
        });
    });

    describe("Tool Registry", () => {
        test("register and get tools", () => {
            const registry = createToolRegistry();
            registry.register(listRootTool);
            registry.register(readFileTool);

            const retrieved = registry.get("list_root");
            expect(retrieved).toBe(listRootTool);

            const retrieved2 = registry.get("read_file");
            expect(retrieved2).toBe(readFileTool);
        });

        test("get returns undefined for unknown tool", () => {
            const registry = createToolRegistry();
            const result = registry.get("nonexistent_tool");
            expect(result).toBeUndefined();
        });

        test("list returns all registered tools", () => {
            const registry = createToolRegistry();
            registry.register(listRootTool);
            registry.register(readFileTool);
            registry.register(editReplaceExactTool);

            const tools = registry.list();
            expect(tools.length).toBe(3);
            expect(tools).toContain(listRootTool);
            expect(tools).toContain(readFileTool);
            expect(tools).toContain(editReplaceExactTool);
        });

        test("getApprovalPolicy returns correct policy", () => {
            const registry = createToolRegistry();
            registry.register(readFileTool);
            registry.register(editReplaceExactTool);
            registry.register(shellRunTool);

            expect(registry.getApprovalPolicy("read_file")).toBe("none");
            expect(registry.getApprovalPolicy("edit_replace_exact")).toBe("write");
            expect(registry.getApprovalPolicy("shell_run")).toBe("shell");
        });

        test("getApprovalPolicy returns none for unknown tool", () => {
            const registry = createToolRegistry();
            expect(registry.getApprovalPolicy("unknown")).toBe("none");
        });

        test("getSchemas returns correct format", () => {
            const registry = createToolRegistry();
            registry.register(listRootTool);
            registry.register(readFileTool);

            const schemas = registry.getSchemas();
            expect(schemas.length).toBe(2);

            for (const schema of schemas) {
                expect(schema).toHaveProperty("name");
                expect(schema).toHaveProperty("description");
                expect(schema).toHaveProperty("input_schema");
                expect(typeof schema.name).toBe("string");
                expect(typeof schema.description).toBe("string");
                expect(schema.input_schema).toHaveProperty("type");
            }
        });

        test("execute with unknown tool returns error", async () => {
            const registry = createToolRegistry();
            const result = await registry.execute("unknown_tool", {}, dummyContext);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Unknown tool");
        });

        test("execute runs tool successfully", async () => {
            const registry = createToolRegistry();
            registry.register(getLineCountTool);

            const result = await registry.execute(
                "get_line_count",
                { path: "nonexistent.txt" },
                dummyContext
            );

            expect(result.ok).toBe(false);
        });
    });

    describe("Invalid Input Handling", () => {
        test("find_files rejects empty pattern", async () => {
            const result = await findFilesTool.execute({ pattern: "" }, dummyContext);
            expect(result.ok).toBe(false);
            expect(result.error).toBeTruthy();
        });

        test("search_text rejects empty query", async () => {
            const result = await searchTextTool.execute({ query: "" }, dummyContext);
            expect(result.ok).toBe(false);
            expect(result.error).toBeTruthy();
        });

        test("search_text rejects conflicting path and file", async () => {
            const result = await searchTextTool.execute(
                { query: "test", path: "src", file: "test.ts" },
                dummyContext
            );
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Cannot specify both");
        });

        test("search_text rejects lineRange without file", async () => {
            const result = await searchTextTool.execute(
                { query: "test", lineRange: { start: 1, end: 10 } },
                dummyContext
            );
            expect(result.ok).toBe(false);
            expect(result.error).toContain("requires 'file'");
        });

        test("edit_apply_batch rejects empty edits array", async () => {
            const result = await editApplyBatchTool.execute({ edits: [] }, dummyContext);
            expect(result.ok).toBe(false);
            expect(result.error).toContain("No edits");
        });

        test("edit_apply_batch rejects unknown tool name", async () => {
            const result = await editApplyBatchTool.execute(
                {
                    edits: [
                        {
                            toolName: "unknown_edit_tool",
                            args: { path: "test.ts" },
                        },
                    ],
                },
                dummyContext
            );
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Unknown tool");
        });
    });

    describe("Tool Name Uniqueness", () => {
        test("all tool names are unique", () => {
            const names = ALL_TOOLS.map((t) => t.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });

        test("all tool names match expected format", () => {
            const namePattern = /^[a-z_]+$/;
            for (const tool of ALL_TOOLS) {
                expect(tool.name).toMatch(namePattern);
            }
        });
    });
});

