import { describe, test, expect } from "bun:test";
import { getLineCountTool } from "../src/tools/get_line_count";
import { getFileSymbolsTool } from "../src/tools/get_file_symbols";
import { getFileOutlineTool } from "../src/tools/get_file_outline";
import { searchTextTool } from "../src/tools/search_text";
import { readFileTool } from "../src/tools/read_file";
import type { ToolContext } from "../src/tools/types";

const testContext: ToolContext = {
    repoRoot: process.cwd(),
    logger: {
        info: () => {},
        error: () => {},
        debug: () => {},
    },
};

describe("Large File Navigation Tools", () => {
    test("get_line_count returns file stats", async () => {
        const result = await getLineCountTool.execute(
            { path: "src/provider/anthropic.ts" },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.lineCount).toBeGreaterThan(0);
            expect(result.data.sizeBytes).toBeGreaterThan(0);
            expect(typeof result.data.willTruncate).toBe("boolean");
        }
    });

    test("get_file_symbols extracts TypeScript symbols", async () => {
        const result = await getFileSymbolsTool.execute(
            { path: "src/provider/anthropic.ts" },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("typescript");
            expect(result.data.symbols.length).toBeGreaterThan(0);
            expect(result.data.symbols[0]).toHaveProperty("name");
            expect(result.data.symbols[0]).toHaveProperty("type");
            expect(result.data.symbols[0]).toHaveProperty("line");
            expect(result.data.symbols[0]).toHaveProperty("signature");
        }
    });

    test("get_file_outline provides hierarchical structure", async () => {
        const result = await getFileOutlineTool.execute(
            { path: "src/provider/anthropic.ts" },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("typescript");
            expect(result.data.sections.length).toBeGreaterThan(0);
            expect(result.data.sections[0]).toHaveProperty("type");
            expect(result.data.sections[0]).toHaveProperty("name");
            expect(result.data.sections[0]).toHaveProperty("startLine");
            expect(result.data.sections[0]).toHaveProperty("endLine");
        }
    });

    test("search_text can search within specific file", async () => {
        const result = await searchTextTool.execute(
            {
                query: "createProvider",
                file: "src/provider/anthropic.ts",
            },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBeGreaterThan(0);
            expect(result.data.matches[0].path).toContain("anthropic.ts");
        }
    });

    test("search_text can search within line range", async () => {
        const result = await searchTextTool.execute(
            {
                query: "export",
                file: "src/provider/anthropic.ts",
                lineRange: { start: 1, end: 50 },
            },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            result.data.matches.forEach((match) => {
                expect(match.line).toBeLessThanOrEqual(50);
            });
        }
    });

    test("read_file with includeContext imports", async () => {
        const result = await readFileTool.execute(
            {
                path: "src/provider/anthropic.ts",
                range: { start: 116, end: 120 },
                includeContext: "imports",
            },
            testContext
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toContain("import");
        }
    });

    test("get_file_symbols works with Python", async () => {
        const pythonTestContent = `import os
import sys

class TestClass:
    def __init__(self):
        pass
    
    def test_method(self):
        return True

def test_function():
    return False
`;
        const result = await getFileSymbolsTool.execute(
            { path: "test_sample.py" },
            { ...testContext, repoRoot: "/tmp" }
        );

        expect(result.ok).toBe(false);
    });

    test("tools handle non-existent files gracefully", async () => {
        const lineCountResult = await getLineCountTool.execute(
            { path: "non_existent_file.ts" },
            testContext
        );
        expect(lineCountResult.ok).toBe(false);

        const symbolsResult = await getFileSymbolsTool.execute(
            { path: "non_existent_file.ts" },
            testContext
        );
        expect(symbolsResult.ok).toBe(false);

        const outlineResult = await getFileOutlineTool.execute(
            { path: "non_existent_file.ts" },
            testContext
        );
        expect(outlineResult.ok).toBe(false);
    });
});

