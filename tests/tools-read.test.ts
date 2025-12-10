import { describe, test, expect, afterEach } from "bun:test";
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
import type { ToolContext } from "../src/tools/types";
import {
    createTempRepo,
    createFile,
    writeGitignore,
    createTypescriptFixture,
    createPythonFixture,
    createJavaScriptFixture,
    createFileWithTrailingNewline,
    createFileWithoutTrailingNewline,
    createFileWithCRLF,
    createFileWithUTF8,
    createEmptyFile,
    createLongLineFile,
    createGitRepo,
    createGitCommit,
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

describe("list_root", () => {
    test("lists files and directories at root", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file1.txt", "content");
        createFile(tempRepo.root, "file2.js", "code");
        createFile(tempRepo.root, "subdir/nested.txt", "nested");

        const ctx = createContext(tempRepo.root);
        const result = await listRootTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const names = result.data.entries.map((e) => e.name).sort();
            expect(names).toContain("file1.txt");
            expect(names).toContain("file2.js");
            expect(names).toContain("subdir");
            expect(names).not.toContain("nested.txt");
        }
    });

    test("respects .gitignore", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "included.txt", "keep");
        createFile(tempRepo.root, "ignored.log", "ignore");
        writeGitignore(tempRepo.root, ["*.log"]);

        const ctx = createContext(tempRepo.root);
        const result = await listRootTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const names = result.data.entries.map((e) => e.name);
            expect(names).toContain("included.txt");
            expect(names).toContain(".gitignore");
            expect(names).not.toContain("ignored.log");
        }
    });

    test("ignores node_modules and .git", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "normal.txt", "keep");
        createFile(tempRepo.root, "node_modules/package.json", "ignore");
        createFile(tempRepo.root, ".git/config", "ignore");

        const ctx = createContext(tempRepo.root);
        const result = await listRootTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const names = result.data.entries.map((e) => e.name);
            expect(names).toContain("normal.txt");
            expect(names).not.toContain("node_modules");
            expect(names).not.toContain(".git");
        }
    });

    test("classifies files vs directories correctly", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file.txt", "content");
        createFile(tempRepo.root, "dir/nested.txt", "nested");

        const ctx = createContext(tempRepo.root);
        const result = await listRootTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const fileEntry = result.data.entries.find((e) => e.name === "file.txt");
            const dirEntry = result.data.entries.find((e) => e.name === "dir");

            expect(fileEntry?.type).toBe("file");
            expect(dirEntry?.type).toBe("dir");
        }
    });

    test("handles empty repo root", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await listRootTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.entries).toEqual([]);
        }
    });

    test("returns deterministic order", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "zebra.txt", "z");
        createFile(tempRepo.root, "alpha.txt", "a");
        createFile(tempRepo.root, "beta.txt", "b");

        const ctx = createContext(tempRepo.root);
        const result1 = await listRootTool.execute(undefined, ctx);
        const result2 = await listRootTool.execute(undefined, ctx);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);
        if (result1.data && result2.data) {
            const names1 = result1.data.entries.map((e) => e.name);
            const names2 = result2.data.entries.map((e) => e.name);
            expect(names1).toEqual(names2);
        }
    });
});

describe("find_files", () => {
    test("finds files matching simple glob", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.ts", "");
        createFile(tempRepo.root, "other.js", "");
        createFile(tempRepo.root, "readme.txt", "");

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "*.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files).toContain("test.ts");
            expect(result.data.files).not.toContain("other.js");
            expect(result.data.truncated).toBe(false);
        }
    });

    test("finds files with ** wildcard", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "src/utils/helper.ts", "");
        createFile(tempRepo.root, "tests/unit/test.ts", "");
        createFile(tempRepo.root, "readme.md", "");

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "**/*.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files).toContain("src/utils/helper.ts");
            expect(result.data.files).toContain("tests/unit/test.ts");
            expect(result.data.files).not.toContain("readme.md");
        }
    });

    test("case-insensitive matching", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "README.md", "");
        createFile(tempRepo.root, "readme.txt", "");

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "readme*" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files).toContain("README.md");
            expect(result.data.files).toContain("readme.txt");
        }
    });

    test("respects limit", async () => {
        tempRepo = createTempRepo();
        for (let i = 0; i < 60; i++) {
            createFile(tempRepo.root, `file${i}.txt`, "content");
        }

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "*.txt", limit: 10 }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files.length).toBe(10);
            expect(result.data.truncated).toBe(true);
        }
    });

    test("handles pattern matching nothing", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.ts", "");
        createFile(tempRepo.root, "other.js", "");

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "*.py" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files).toEqual([]);
            expect(result.data.truncated).toBe(false);
        }
    });

    test("respects ignore rules", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "src/app.ts", "");
        createFile(tempRepo.root, "node_modules/lib.ts", "");
        writeGitignore(tempRepo.root, ["node_modules"]);

        const ctx = createContext(tempRepo.root);
        const result = await findFilesTool.execute({ pattern: "**/*.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files).toContain("src/app.ts");
            expect(result.data.files).not.toContain("node_modules/lib.ts");
        }
    });

    test("deterministic ordering", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "zebra.ts", "");
        createFile(tempRepo.root, "alpha.ts", "");
        createFile(tempRepo.root, "beta.ts", "");

        const ctx = createContext(tempRepo.root);
        const result1 = await findFilesTool.execute({ pattern: "*.ts" }, ctx);
        const result2 = await findFilesTool.execute({ pattern: "*.ts" }, ctx);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);
        if (result1.data && result2.data) {
            expect(result1.data.files).toEqual(result2.data.files);
        }
    });
});

describe("search_text", () => {
    test("finds text in files with plain search", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file1.txt", "hello world\ntest line\n");
        createFile(tempRepo.root, "file2.txt", "another file\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "test" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBe(1);
            expect(result.data.matches[0].path).toBe("file1.txt");
            expect(result.data.matches[0].line).toBe(2);
        }
    });

    test("finds text with regex search", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.ts", "const value = 123;\nconst other = 456;\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "const \\w+ = \\d+", regex: true }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBe(2);
        }
    });

    test("file-scoped search only searches that file", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "target.txt", "keyword here\n");
        createFile(tempRepo.root, "other.txt", "keyword also here\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "keyword", file: "target.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBe(1);
            expect(result.data.matches[0].path).toContain("target.txt");
        }
    });

    test("line range search only searches within range", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.txt",
            "line 1 match\nline 2\nline 3 match\nline 4\nline 5 match\n"
        );

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({
            query: "match",
            file: "test.txt",
            lineRange: { start: 2, end: 4 },
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBe(1);
            expect(result.data.matches[0].line).toBe(3);
        }
    });

    test("respects limit and sets truncated", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 0; i < 100; i++) {
            content += `match on line ${i}\n`;
        }
        createFile(tempRepo.root, "big.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "match", limit: 10 }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches.length).toBe(10);
            expect(result.data.truncated).toBe(true);
        }
    });

    test("correct line numbers and column positions", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "abc\n  def\n    ghi\n");

        const ctx = createContext(tempRepo.root);
        const result = await searchTextTool.execute({ query: "def" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matches[0].line).toBe(2);
            expect(result.data.matches[0].column).toBe(3);
        }
    });
});

describe("read_file", () => {
    test("reads full file", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "test.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toBe("line 1\nline 2\nline 3\n");
            expect(result.data.startLine).toBe(1);
            expect(result.data.endLine).toBe(4);
            expect(result.data.truncated).toBe(false);
        }
    });

    test("reads specific line range", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\nline 4\nline 5\n");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.txt",
            range: { start: 2, end: 4 },
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toBe("line 2\nline 3\nline 4");
            expect(result.data.startLine).toBe(2);
            expect(result.data.endLine).toBe(4);
        }
    });

    test("includeContext imports includes import statements", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.ts",
            'import { foo } from "./foo";\nimport bar from "./bar";\n\nconst x = 1;\nconst y = 2;\n'
        );

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.ts",
            range: { start: 4, end: 5 },
            includeContext: "imports",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.content).toContain("import { foo }");
            expect(result.data.content).toContain("import bar");
            expect(result.data.content).toContain("const x = 1");
            expect(result.data.startLine).toBe(1);
        }
    });

    test("truncates at 500 lines", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 0; i < 600; i++) {
            content += `line ${i}\n`;
        }
        createFile(tempRepo.root, "big.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "big.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.truncated).toBe(true);
            expect(result.data.content).toContain("[... content truncated at line");
        }
    });

    test("errors on invalid line range", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "line 1\nline 2\n");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({
            path: "test.txt",
            range: { start: 100, end: 200 },
        }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("exceeds file length");
    });

    test("errors on directory path", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "dir/file.txt", "content");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "dir" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("directory");
    });
});

describe("get_line_count", () => {
    test("counts lines with LF endings", async () => {
        tempRepo = createTempRepo();
        createFileWithTrailingNewline(tempRepo.root, "test.txt", "line 1\nline 2\nline 3");

        const ctx = createContext(tempRepo.root);
        const result = await getLineCountTool.execute({ path: "test.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.lineCount).toBe(4);
            expect(result.data.sizeBytes).toBeGreaterThan(0);
        }
    });

    test("counts lines with CRLF endings", async () => {
        tempRepo = createTempRepo();
        createFileWithCRLF(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

        const ctx = createContext(tempRepo.root);
        const result = await getLineCountTool.execute({ path: "test.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.lineCount).toBeGreaterThan(0);
        }
    });

    test("handles empty file", async () => {
        tempRepo = createTempRepo();
        createEmptyFile(tempRepo.root, "empty.txt");

        const ctx = createContext(tempRepo.root);
        const result = await getLineCountTool.execute({ path: "empty.txt" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.lineCount).toBe(1);
            expect(result.data.sizeBytes).toBe(0);
        }
    });

    test("errors on non-existent file", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await getLineCountTool.execute({ path: "missing.txt" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("not found");
    });

    test("willTruncate flag is accurate", async () => {
        tempRepo = createTempRepo();
        let smallContent = "";
        for (let i = 0; i < 100; i++) {
            smallContent += `line ${i}\n`;
        }
        createFile(tempRepo.root, "small.txt", smallContent);

        let bigContent = "";
        for (let i = 0; i < 600; i++) {
            bigContent += `line ${i}\n`;
        }
        createFile(tempRepo.root, "big.txt", bigContent);

        const ctx = createContext(tempRepo.root);
        const smallResult = await getLineCountTool.execute({ path: "small.txt" }, ctx);
        const bigResult = await getLineCountTool.execute({ path: "big.txt" }, ctx);

        expect(smallResult.ok).toBe(true);
        if (smallResult.data) {
            expect(smallResult.data.willTruncate).toBe(false);
        }

        expect(bigResult.ok).toBe(true);
        if (bigResult.data) {
            expect(bigResult.data.willTruncate).toBe(true);
        }
    });
});

describe("get_file_symbols", () => {
    test("extracts TypeScript symbols", async () => {
        tempRepo = createTempRepo();
        createTypescriptFixture(tempRepo.root, "test.ts");

        const ctx = createContext(tempRepo.root);
        const result = await getFileSymbolsTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("typescript");
            const symbolNames = result.data.symbols.map((s) => s.name);
            expect(symbolNames).toContain("TestInterface");
            expect(symbolNames).toContain("TestType");
            expect(symbolNames).toContain("TestEnum");
            expect(symbolNames).toContain("TestClass");
            expect(symbolNames).toContain("testFunction");
            expect(symbolNames.length).toBeGreaterThan(5);
        }
    });

    test("extracts Python symbols", async () => {
        tempRepo = createTempRepo();
        createPythonFixture(tempRepo.root, "test.py");

        const ctx = createContext(tempRepo.root);
        const result = await getFileSymbolsTool.execute({ path: "test.py" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("python");
            const symbolNames = result.data.symbols.map((s) => s.name);
            expect(symbolNames).toContain("standalone_function");
            expect(symbolNames).toContain("TestClass");
            expect(symbolNames).toContain("AnotherClass");
        }
    });

    test("extracts JavaScript symbols", async () => {
        tempRepo = createTempRepo();
        createJavaScriptFixture(tempRepo.root, "test.js");

        const ctx = createContext(tempRepo.root);
        const result = await getFileSymbolsTool.execute({ path: "test.js" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("javascript");
            const symbolNames = result.data.symbols.map((s) => s.name);
            expect(symbolNames).toContain("normalFunction");
            expect(symbolNames).toContain("asyncFunction");
            expect(symbolNames).toContain("MyClass");
        }
    });

    test("returns empty array for empty file", async () => {
        tempRepo = createTempRepo();
        createEmptyFile(tempRepo.root, "empty.ts");

        const ctx = createContext(tempRepo.root);
        const result = await getFileSymbolsTool.execute({ path: "empty.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.symbols).toEqual([]);
        }
    });

    test("includes line numbers and signatures", async () => {
        tempRepo = createTempRepo();
        createTypescriptFixture(tempRepo.root, "test.ts");

        const ctx = createContext(tempRepo.root);
        const result = await getFileSymbolsTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            for (const symbol of result.data.symbols) {
                expect(symbol.line).toBeGreaterThan(0);
                expect(symbol.signature).toBeTruthy();
                expect(typeof symbol.name).toBe("string");
                expect(typeof symbol.type).toBe("string");
            }
        }
    });
});

describe("get_file_outline", () => {
    test("provides hierarchical structure for TypeScript", async () => {
        tempRepo = createTempRepo();
        createTypescriptFixture(tempRepo.root, "test.ts");

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("typescript");
            expect(result.data.sections.length).toBeGreaterThan(0);

            const importSection = result.data.sections.find((s) => s.type === "imports");
            expect(importSection).toBeDefined();

            for (const section of result.data.sections) {
                expect(section.startLine).toBeGreaterThan(0);
                expect(section.endLine).toBeGreaterThanOrEqual(section.startLine);
                expect(section.type).toBeTruthy();
                expect(section.name).toBeTruthy();
            }
        }
    });

    test("provides hierarchical structure for Python", async () => {
        tempRepo = createTempRepo();
        createPythonFixture(tempRepo.root, "test.py");

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "test.py" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("python");
            expect(result.data.sections.length).toBeGreaterThan(0);
        }
    });

    test("fallback for unknown language uses generic chunks", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 0; i < 200; i++) {
            content += `line ${i}\n`;
        }
        createFile(tempRepo.root, "data.xml", content);

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "data.xml" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.sections.length).toBeGreaterThan(1);
        }
    });

    test("shows CSS rules inside embedded style blocks in HTML", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "page.html",
            `<!DOCTYPE html>
<html>
<head>
    <style>
        .header {
            background: blue;
        }
        .card {
            padding: 20px;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    </style>
</head>
<body>
    <header class="header">Title</header>
</body>
</html>`
        );

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "page.html" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.language).toBe("html");

            const styleSection = result.data.sections.find((s) => s.name === "<style>");
            expect(styleSection).toBeDefined();

            const cssRules = result.data.sections.filter((s) => s.name.includes("└─"));
            expect(cssRules.length).toBeGreaterThanOrEqual(2);

            const headerRule = cssRules.find((s) => s.name.includes(".header"));
            expect(headerRule).toBeDefined();

            const cardRule = cssRules.find((s) => s.name.includes(".card"));
            expect(cardRule).toBeDefined();
        }
    });

    test("shows JS symbols inside embedded script blocks in HTML", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "interactive.html",
            `<!DOCTYPE html>
<html>
<head>
    <script>
        function handleClick() {
            console.log('clicked');
        }
        
        const submitForm = () => {
            console.log('submitted');
        };
        
        class FormValidator {
            validate() {
                return true;
            }
        }
    </script>
</head>
<body>
    <button onclick="handleClick()">Click</button>
</body>
</html>`
        );

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "interactive.html" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const scriptSection = result.data.sections.find((s) => s.name === "<script>");
            expect(scriptSection).toBeDefined();

            const jsSymbols = result.data.sections.filter((s) => s.name.includes("└─"));
            expect(jsSymbols.length).toBeGreaterThanOrEqual(1);

            const handleClickSymbol = jsSymbols.find((s) => s.name.includes("handleClick"));
            expect(handleClickSymbol).toBeDefined();
        }
    });

    test("shows both embedded style and script blocks together", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "mixed.html",
            `<!DOCTYPE html>
<html>
<head>
    <style>
        .btn { padding: 10px; }
    </style>
    <script>
        function init() { console.log('ready'); }
    </script>
</head>
<body>
    <main>
        <button class="btn" onclick="init()">Go</button>
    </main>
</body>
</html>`
        );

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "mixed.html" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const styleSection = result.data.sections.find((s) => s.name === "<style>");
            const scriptSection = result.data.sections.find((s) => s.name === "<script>");
            const mainSection = result.data.sections.find((s) => s.name === "<main>");

            expect(styleSection).toBeDefined();
            expect(scriptSection).toBeDefined();
            expect(mainSection).toBeDefined();

            const cssRules = result.data.sections.filter(
                (s) => s.name.includes("└─") && s.name.includes(".btn")
            );
            expect(cssRules.length).toBeGreaterThanOrEqual(1);

            const jsSymbols = result.data.sections.filter(
                (s) => s.name.includes("└─") && s.name.includes("init")
            );
            expect(jsSymbols.length).toBeGreaterThanOrEqual(1);
        }
    });

    test("handles HTML without embedded blocks", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "simple.html",
            `<!DOCTYPE html>
<html>
<head>
    <title>Simple Page</title>
</head>
<body>
    <header id="main-header">
        <h1>Title</h1>
    </header>
    <main>
        <p>Content</p>
    </main>
    <footer>
        <p>Footer</p>
    </footer>
</body>
</html>`
        );

        const ctx = createContext(tempRepo.root);
        const result = await getFileOutlineTool.execute({ path: "simple.html" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const headerSection = result.data.sections.find((s) =>
                s.name.includes("header") && s.name.includes("main-header")
            );
            expect(headerSection).toBeDefined();

            const mainSection = result.data.sections.find((s) => s.name === "<main>");
            expect(mainSection).toBeDefined();

            const footerSection = result.data.sections.find((s) => s.name === "<footer>");
            expect(footerSection).toBeDefined();
        }
    });
});

describe("read_readme", () => {
    test("finds README.md", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "README.md", "# Project\n\nDescription");

        const ctx = createContext(tempRepo.root);
        const result = await readReadmeTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.path).toBe("README.md");
            expect(result.data.content).toContain("# Project");
            expect(result.data.truncated).toBe(false);
        }
    });

    test("finds README.txt", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "README.txt", "Plain text readme");

        const ctx = createContext(tempRepo.root);
        const result = await readReadmeTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.path).toBe("README.txt");
        }
    });

    test("prefers README.md over others", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "README.txt", "text");
        createFile(tempRepo.root, "README.md", "markdown");
        createFile(tempRepo.root, "README", "plain");

        const ctx = createContext(tempRepo.root);
        const result = await readReadmeTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.path).toBe("README.md");
        }
    });

    test("truncates at 8KB", async () => {
        tempRepo = createTempRepo();
        const longContent = "x".repeat(10000);
        createFile(tempRepo.root, "README.md", longContent);

        const ctx = createContext(tempRepo.root);
        const result = await readReadmeTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.truncated).toBe(true);
            expect(result.data.content).toContain("[... content truncated ...]");
        }
    });

    test("errors when no README exists", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "other.txt", "not a readme");

        const ctx = createContext(tempRepo.root);
        const result = await readReadmeTool.execute(undefined, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("No README");
    });
});

describe("detect_languages", () => {
    test("aggregates by extension and size", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file1.ts", "x".repeat(1000));
        createFile(tempRepo.root, "file2.ts", "x".repeat(2000));
        createFile(tempRepo.root, "file3.js", "x".repeat(500));
        createFile(tempRepo.root, "file4.py", "x".repeat(1500));

        const ctx = createContext(tempRepo.root);
        const result = await detectLanguagesTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const langs = result.data.languages;
            expect(langs.length).toBeGreaterThan(0);

            const tsEntry = langs.find((l) => l.language === "TypeScript");
            expect(tsEntry).toBeDefined();
            if (tsEntry) {
                expect(tsEntry.bytes).toBe(3000);
            }

            expect(langs[0].bytes).toBeGreaterThanOrEqual(langs[langs.length - 1].bytes);
        }
    });

    test("ignores node_modules", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "src/app.ts", "x".repeat(1000));
        createFile(tempRepo.root, "node_modules/lib.ts", "x".repeat(5000));

        const ctx = createContext(tempRepo.root);
        const result = await detectLanguagesTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const tsEntry = result.data.languages.find((l) => l.language === "TypeScript");
            if (tsEntry) {
                expect(tsEntry.bytes).toBe(1000);
            }
        }
    });

    test("returns empty array for empty repo", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await detectLanguagesTool.execute(undefined, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.languages).toEqual([]);
        }
    });

    test("deterministic ordering", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file1.ts", "x".repeat(1000));
        createFile(tempRepo.root, "file2.js", "x".repeat(500));

        const ctx = createContext(tempRepo.root);
        const result1 = await detectLanguagesTool.execute(undefined, ctx);
        const result2 = await detectLanguagesTool.execute(undefined, ctx);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);
        if (result1.data && result2.data) {
            expect(result1.data.languages).toEqual(result2.data.languages);
        }
    });
});

describe("hotfiles", () => {
    test("git mode with commit history", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "frequent.ts", "code");
        createFile(tempRepo.root, "rare.ts", "code");

        createGitRepo(tempRepo.root);
        createGitCommit(tempRepo.root, ["frequent.ts"], "commit 1");
        createFile(tempRepo.root, "frequent.ts", "more code");
        createGitCommit(tempRepo.root, ["frequent.ts"], "commit 2");
        createFile(tempRepo.root, "frequent.ts", "even more code");
        createGitCommit(tempRepo.root, ["frequent.ts"], "commit 3");
        createGitCommit(tempRepo.root, ["rare.ts"], "commit 4");

        const ctx = createContext(tempRepo.root);
        const result = await hotfilesTool.execute({}, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.method).toBe("git");
            expect(result.data.files.length).toBeGreaterThan(0);

            const frequentFile = result.data.files.find((f) => f.path === "frequent.ts");
            const rareFile = result.data.files.find((f) => f.path === "rare.ts");

            expect(frequentFile).toBeDefined();
            expect(rareFile).toBeDefined();

            if (frequentFile && rareFile) {
                expect(frequentFile.score).toBeGreaterThan(rareFile.score);
            }
        }
    });

    test("fallback mode without git", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "src/large.ts", "x".repeat(5000));
        createFile(tempRepo.root, "small.ts", "x".repeat(100));

        const ctx = createContext(tempRepo.root);
        const result = await hotfilesTool.execute({}, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.method).toBe("fallback");
            expect(result.data.files.length).toBeGreaterThan(0);
        }
    });

    test("respects limit", async () => {
        tempRepo = createTempRepo();
        for (let i = 0; i < 20; i++) {
            createFile(tempRepo.root, `file${i}.ts`, "code");
        }
        createGitRepo(tempRepo.root);
        for (let i = 0; i < 20; i++) {
            createGitCommit(tempRepo.root, [`file${i}.ts`], `commit ${i}`);
        }

        const ctx = createContext(tempRepo.root);
        const result = await hotfilesTool.execute({ limit: 5 }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.files.length).toBeLessThanOrEqual(5);
        }
    });
});

