import { describe, test, expect, afterEach } from "bun:test";
import { readAroundTool } from "../src/tools/read_around";
import { findBlocksTool } from "../src/tools/find_blocks";
import { editByAnchorTool } from "../src/tools/edit_by_anchor";
import { applyEditsAtomically } from "../src/utils/editing";
import type { ToolContext } from "../src/tools/types";
import {
    createTempRepo,
    createFile,
    readFixtureFile,
    assertNoTempFiles,
    createFileWithTrailingNewline,
    createFileWithoutTrailingNewline,
    createTypescriptFixture,
    createPythonFixture,
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

describe("read_around", () => {
    test("returns context window around anchor with line numbers", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 1; i <= 50; i++) {
            content += `line ${i}\n`;
        }
        createFile(tempRepo.root, "test.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "line 25" },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matchLine).toBe(25);
            expect(result.data.matchCount).toBe(1);
            expect(result.data.occurrenceUsed).toBe(1);
            expect(result.data.startLine).toBe(13);
            expect(result.data.endLine).toBe(45);
            expect(result.data.content).toContain("line 25");
            expect(result.data.content).toContain(">|");
        }
    });

    test("uses default before=12 and after=20", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 1; i <= 100; i++) {
            content += `line ${i}\n`;
        }
        createFile(tempRepo.root, "test.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "line 50" },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.startLine).toBe(38);
            expect(result.data.endLine).toBe(70);
        }
    });

    test("respects custom before and after values", async () => {
        tempRepo = createTempRepo();
        let content = "";
        for (let i = 1; i <= 100; i++) {
            content += `line ${i}\n`;
        }
        createFile(tempRepo.root, "test.txt", content);

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "line 50", before: 5, after: 10 },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.startLine).toBe(45);
            expect(result.data.endLine).toBe(60);
        }
    });

    test("clamps to file boundaries", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "line 2", before: 50, after: 50 },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.startLine).toBe(1);
            expect(result.data.endLine).toBe(4);
        }
    });

    test("multiple matches without occurrence returns candidates", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.txt",
            "foo bar\nfoo baz\nfoo qux\nother line\n"
        );

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "foo" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("Multiple matches");
        expect(result.error).toContain("3");
        if (result.data) {
            const candidates = (result.data as any).candidates;
            expect(candidates).toBeDefined();
            expect(candidates.length).toBe(3);
            expect(candidates[0].line).toBe(1);
            expect(candidates[1].line).toBe(2);
            expect(candidates[2].line).toBe(3);
        }
    });

    test("multiple matches with occurrence works correctly", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.txt",
            "foo first\nfoo second\nfoo third\nother line\n"
        );

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "foo", occurrence: 2 },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.matchLine).toBe(2);
            expect(result.data.occurrenceUsed).toBe(2);
            expect(result.data.matchCount).toBe(3);
            expect(result.data.content).toContain("foo second");
        }
    });

    test("anchor not found returns error", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "hello world\n");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "nonexistent" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("Anchor text not found");
    });

    test("invalid occurrence returns error", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "foo bar\nfoo baz\n");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "foo", occurrence: 5 },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("Occurrence 5");
        expect(result.error).toContain("only 2");
    });

    test("file not found returns error", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "missing.txt", anchor: "test" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("File not found");
    });

    test("directory path returns error", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "dir/file.txt", "content");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "dir", anchor: "test" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("directory");
    });

    test("path traversal is blocked", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "content");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "../../../etc/passwd", anchor: "test" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("escapes repository root");
    });

    test("marks the match line with >", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "test.txt", "line 1\ntarget line\nline 3\n");

        const ctx = createContext(tempRepo.root);
        const result = await readAroundTool.execute(
            { path: "test.txt", anchor: "target" },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const lines = result.data.content.split("\n");
            const targetLineContent = lines.find((l) => l.includes("target line"));
            expect(targetLineContent).toContain(">|");
            const otherLine = lines.find((l) => l.includes("line 1"));
            expect(otherLine).toContain(" |");
        }
    });
});

describe("find_blocks", () => {
    test("detects TypeScript classes and functions", async () => {
        tempRepo = createTempRepo();
        createTypescriptFixture(tempRepo.root, "test.ts");

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.blocks.length).toBeGreaterThan(0);
            const labels = result.data.blocks.map((b) => b.label);
            expect(labels).toContain("class TestClass");
            expect(labels.some((l) => l.includes("function testFunction"))).toBe(true);
            expect(labels.some((l) => l.includes("interface TestInterface"))).toBe(true);
            expect(labels.some((l) => l.includes("type TestType"))).toBe(true);
            expect(labels.some((l) => l.includes("enum TestEnum"))).toBe(true);
        }
    });

    test("detects Python classes and functions", async () => {
        tempRepo = createTempRepo();
        createPythonFixture(tempRepo.root, "test.py");

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.py" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.blocks.length).toBeGreaterThan(0);
            const labels = result.data.blocks.map((b) => b.label);
            expect(labels).toContain("class TestClass");
            expect(labels).toContain("def standalone_function");
        }
    });

    test("detects HTML sections with IDs and classes", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.html",
            `<html>
<body>
<header>Header content</header>
<section id="main">
  <article class="post">Article 1</article>
  <article class="post">Article 2</article>
</section>
<footer>Footer content</footer>
</body>
</html>
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.html" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const labels = result.data.blocks.map((b) => b.label);
            expect(labels).toContain("<header>");
            expect(labels).toContain("<section#main>");
            expect(labels).toContain("<article.post>");
            expect(labels).toContain("<footer>");
        }
    });

    test("detects CSS rules and at-rules", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.css",
            `.header {
  color: red;
}

.nav-item {
  padding: 10px;
}

@media (min-width: 768px) {
  .container {
    width: 100%;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.css" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const labels = result.data.blocks.map((b) => b.label);
            expect(labels).toContain(".header");
            expect(labels).toContain(".nav-item");
            expect(labels.some((l) => l.includes("@media"))).toBe(true);
            expect(labels.some((l) => l.includes("@keyframes fadeIn"))).toBe(true);
        }
    });

    test("kind filter filters to html_section only", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.tsx",
            `export const Header = () => {
  return (
    <header id="main-header">
      <nav>Navigation</nav>
    </header>
  );
};

export function Footer() {
  return <footer>Footer</footer>;
}
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute(
            { path: "test.tsx", kind: "js_ts_symbol" },
            ctx
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            expect(result.data.blocks.length).toBeGreaterThan(0);
            for (const block of result.data.blocks) {
                expect(block.id.startsWith("js-")).toBe(true);
            }
        }
    });

    test("returns block line ranges correctly", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.ts",
            `function foo() {
    return 1;
}

function bar() {
    return 2;
}
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const fooBlock = result.data.blocks.find((b) => b.label === "function foo");
            const barBlock = result.data.blocks.find((b) => b.label === "function bar");

            expect(fooBlock).toBeDefined();
            expect(barBlock).toBeDefined();

            if (fooBlock) {
                expect(fooBlock.startLine).toBe(1);
                expect(fooBlock.endLine).toBe(3);
            }
            if (barBlock) {
                expect(barBlock.startLine).toBe(5);
                expect(barBlock.endLine).toBe(7);
            }
        }
    });

    test("file not found returns error", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "missing.ts" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("File not found");
    });

    test("directory path returns error", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "dir/file.ts", "content");

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "dir" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("directory");
    });

    test("path traversal is blocked", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute(
            { path: "../../../etc/passwd" },
            ctx
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("escapes repository root");
    });

    test("returns unique block IDs", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.ts",
            `function a() {}
function b() {}
function c() {}
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.ts" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const ids = result.data.blocks.map((b) => b.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        }
    });

    test("detects React components", async () => {
        tempRepo = createTempRepo();
        createFile(
            tempRepo.root,
            "test.tsx",
            `export const MyComponent = () => {
    return <div>Hello</div>;
};

export function AnotherComponent() {
    return <span>World</span>;
}
`
        );

        const ctx = createContext(tempRepo.root);
        const result = await findBlocksTool.execute({ path: "test.tsx" }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const labels = result.data.blocks.map((b) => b.label);
            expect(labels.some((l) => l.includes("MyComponent"))).toBe(true);
            expect(labels.some((l) => l.includes("AnotherComponent"))).toBe(true);
        }
    });
});

describe("edit_by_anchor", () => {
    describe("insert_before mode", () => {
        test("inserts content before anchor line", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nanchor line\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "insert_before",
                    anchor: "anchor line",
                    content: "inserted content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe(
                    "line 1\ninserted content\nanchor line\nline 3\n"
                );
            }
        });

        test("inserts multiline content", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nanchor\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "insert_before",
                    anchor: "anchor",
                    content: "first\nsecond\nthird",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe(
                    "line 1\nfirst\nsecond\nthird\nanchor\nline 3\n"
                );
            }
        });
    });

    describe("insert_after mode", () => {
        test("inserts content after anchor line", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nanchor line\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "insert_after",
                    anchor: "anchor line",
                    content: "inserted content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe(
                    "line 1\nanchor line\ninserted content\nline 3\n"
                );
            }
        });
    });

    describe("replace_line mode", () => {
        test("replaces the anchor line with new content", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nold content\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "old content",
                    content: "new content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("line 1\nnew content\nline 3\n");
            }
        });

        test("can replace with multiple lines", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nold\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "old",
                    content: "new line 1\nnew line 2",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("line 1\nnew line 1\nnew line 2\nline 3\n");
            }
        });
    });

    describe("replace_between mode", () => {
        test("replaces content between anchors (non-inclusive)", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.txt",
                "line 1\nstart anchor\nold content 1\nold content 2\nend anchor\nline 6\n"
            );

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_between",
                    anchor: "start anchor",
                    anchorEnd: "end anchor",
                    content: "new content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe(
                    "line 1\nstart anchor\nnew content\nend anchor\nline 6\n"
                );
            }
        });

        test("replaces content between anchors (inclusive)", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.txt",
                "line 1\nstart anchor\nold content\nend anchor\nline 5\n"
            );

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_between",
                    anchor: "start anchor",
                    anchorEnd: "end anchor",
                    content: "replacement",
                    inclusive: true,
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("line 1\nreplacement\nline 5\n");
            }
        });

        test("requires anchorEnd parameter", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "start\nmiddle\nend\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_between",
                    anchor: "start",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("anchorEnd");
        });

        test("anchorEnd not found returns error", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "start\nmiddle\nend\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_between",
                    anchor: "start",
                    anchorEnd: "nonexistent",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("End anchor not found");
        });
    });

    describe("multiple matches handling", () => {
        test("multiple matches without occurrence returns candidates", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.txt",
                "foo first\nfoo second\nfoo third\n"
            );

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "foo",
                    content: "replacement",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Multiple matches");
            if (result.data) {
                const candidates = (result.data as any).candidates;
                expect(candidates).toBeDefined();
                expect(candidates.length).toBe(3);
            }
        });

        test("multiple matches with occurrence works correctly", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.txt",
                "foo first\nfoo second\nfoo third\n"
            );

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "foo",
                    content: "replacement",
                    occurrence: 2,
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(
                    tempRepo.root,
                    result.data.applyPayload
                );
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("foo first\nreplacement\nfoo third\n");
            }
        });

        test("invalid occurrence returns error", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "foo\nfoo\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "foo",
                    content: "new",
                    occurrence: 5,
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Occurrence 5");
            expect(result.error).toContain("only 2");
        });
    });

    describe("error handling", () => {
        test("anchor not found returns error", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "hello world\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "nonexistent",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Anchor text not found");
            assertNoTempFiles(tempRepo.root);
        });

        test("file not found returns error", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "missing.txt",
                    mode: "replace_line",
                    anchor: "test",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("not found");
        });

        test("invalid mode returns error", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "content\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "invalid_mode" as any,
                    anchor: "content",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Invalid mode");
        });
    });

    describe("newline preservation", () => {
        test("preserves trailing newline", async () => {
            tempRepo = createTempRepo();
            createFileWithTrailingNewline(tempRepo.root, "test.txt", "old content");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "old",
                    content: "new content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const modified = result.data.applyPayload[0].content;
                expect(modified.endsWith("\n")).toBe(true);
            }
        });

        test("preserves no trailing newline", async () => {
            tempRepo = createTempRepo();
            createFileWithoutTrailingNewline(tempRepo.root, "test.txt", "old content");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "old",
                    content: "new content",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const modified = result.data.applyPayload[0].content;
                expect(modified.endsWith("\n")).toBe(false);
            }
        });
    });

    describe("diff stats", () => {
        test("reports correct diff stats for insert", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nanchor\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "insert_after",
                    anchor: "anchor",
                    content: "new line",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.stats.filesChanged).toBe(1);
                expect(result.data.stats.totalLinesAdded).toBeGreaterThan(0);
            }
        });

        test("reports correct diff stats for replace", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nold\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editByAnchorTool.execute(
                {
                    path: "test.txt",
                    mode: "replace_line",
                    anchor: "old",
                    content: "new",
                },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.stats.filesChanged).toBe(1);
                expect(result.data.stats.totalLinesAdded).toBe(1);
                expect(result.data.stats.totalLinesRemoved).toBe(1);
            }
        });
    });
});

