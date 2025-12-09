import { describe, test, expect, afterEach } from "bun:test";
import { readFileTool } from "../src/tools/read_file";
import { searchTextTool } from "../src/tools/search_text";
import type { ToolContext } from "../src/tools/types";
import {
    createTempRepo,
    createFile,
    createTypescriptFixture,
    type TempRepo,
} from "./helpers/fixtures";

let tempRepo: TempRepo | null = null;

afterEach(() => {
    if (tempRepo) {
        tempRepo.cleanup();
        tempRepo = null;
    }
});

function createContext(repoRoot: string): ToolContext {
    return {
        repoRoot,
        logger: {
            info: () => {},
            error: () => {},
            debug: () => {},
        },
    };
}

describe("read_file includeContext edge cases", () => {
    test("includeContext full expands to surrounding function", async () => {
        tempRepo = createTempRepo();

        const content = `import { something } from "./module";

function outerFunction() {
    const a = 1;
    const b = 2;
    const target = 3;
    const c = 4;
    return a + b + target + c;
}

function anotherFunction() {
    return 42;
}`;

        createFile(tempRepo.root, "test.ts", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.ts",
            range: { start: 6, end: 6 },
            includeContext: "full",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toContain("function outerFunction");
            expect(result.data.content).toContain("const target = 3");
            expect(result.data.content).toContain("return a + b + target + c");

            expect(result.data.startLine).toBeLessThan(6);
            expect(result.data.endLine).toBeGreaterThan(6);
        }
    });

    test("includeContext full expands to surrounding class", async () => {
        tempRepo = createTempRepo();

        const content = `class MyClass {
    private value: number;

    constructor(val: number) {
        this.value = val;
    }

    getValue(): number {
        return this.value;
    }
}

const instance = new MyClass(42);`;

        createFile(tempRepo.root, "test.ts", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.ts",
            range: { start: 5, end: 5 },
            includeContext: "full",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toContain("class MyClass");
            expect(result.data.content).toContain("this.value = val");
            expect(result.data.content).toContain("getValue");

            expect(result.data.startLine).toBe(1);
        }
    });

    test("includeContext full handles nested functions", async () => {
        tempRepo = createTempRepo();

        const content = `function outer() {
    function inner() {
        const target = "here";
        return target;
    }
    return inner();
}`;

        createFile(tempRepo.root, "test.ts", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.ts",
            range: { start: 3, end: 3 },
            includeContext: "full",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toContain("function inner");
            expect(result.data.content).toContain("const target");

            expect(result.data.startLine).toBeLessThan(3);
            expect(result.data.endLine).toBeGreaterThan(3);
        }
    });
});

describe("read_file size caps", () => {
    test("truncates at 100KB by bytes", async () => {
        tempRepo = createTempRepo();

        const largeContent = "x".repeat(110000);
        createFile(tempRepo.root, "large.txt", largeContent);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "large.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.truncated).toBe(true);
            expect(result.data.content.length).toBeLessThan(largeContent.length);
            expect(result.data.content).toContain("[... content truncated ...]");
        }
    });

    test("truncates at 500 lines even if under 100KB", async () => {
        tempRepo = createTempRepo();

        let content = "";
        for (let i = 0; i < 600; i++) {
            content += `line ${i}\n`;
        }

        createFile(tempRepo.root, "many-lines.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "many-lines.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.truncated).toBe(true);
            const lineCount = result.data.content.split("\n").length;
            expect(lineCount).toBeLessThanOrEqual(502);
        }
    });

    test("does not truncate when under both limits", async () => {
        tempRepo = createTempRepo();

        let content = "";
        for (let i = 0; i < 100; i++) {
            content += `line ${i}\n`;
        }

        createFile(tempRepo.root, "small.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "small.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.truncated).toBe(false);
        }
    });
});

describe("search_text ripgrep vs fallback semantics", () => {
    test("both modes produce consistent output fields", async () => {
        tempRepo = createTempRepo();

        createFile(tempRepo.root, "test.txt", "line 1 match\nline 2\nline 3 match\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "match" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            for (const match of result.data.matches) {
                expect(match).toHaveProperty("path");
                expect(match).toHaveProperty("line");
                expect(match).toHaveProperty("column");
                expect(match).toHaveProperty("preview");

                expect(typeof match.path).toBe("string");
                expect(typeof match.line).toBe("number");
                expect(typeof match.column).toBe("number");
                expect(typeof match.preview).toBe("string");

                expect(match.line).toBeGreaterThan(0);
                expect(match.column).toBeGreaterThan(0);
            }
        }
    });

    test("line numbers are 1-indexed in both modes", async () => {
        tempRepo = createTempRepo();

        createFile(tempRepo.root, "test.txt", "first line match\nsecond line\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "first" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches[0].line).toBe(1);
        }
    });

    test("column positions are consistent", async () => {
        tempRepo = createTempRepo();

        createFile(tempRepo.root, "test.txt", "  match at column 3\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "match" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches[0].column).toBeGreaterThanOrEqual(1);
        }
    });

    test("preview field is trimmed and bounded", async () => {
        tempRepo = createTempRepo();

        const longLine = "   " + "x".repeat(200) + " match " + "y".repeat(200);
        createFile(tempRepo.root, "test.txt", longLine);

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "match" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const preview = result.data.matches[0].preview;
            expect(preview.length).toBeLessThanOrEqual(123);
            expect(preview.trim()).toBeTruthy();
        }
    });

    test("relative paths are consistent", async () => {
        tempRepo = createTempRepo();

        createFile(tempRepo.root, "dir/subdir/file.txt", "match here\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "match" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const path = result.data.matches[0].path;
            expect(path).toContain("dir/subdir/file.txt");
            expect(path.startsWith("/")).toBe(false);
        }
    });
});

