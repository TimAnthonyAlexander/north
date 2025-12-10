import { describe, test, expect, afterEach } from "bun:test";
import { findCodeBlockTool } from "../src/tools/find_code_block";
import type { ToolContext } from "../src/tools/types";
import { createTempRepo, createFile, type TempRepo } from "./helpers/fixtures";

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

describe("find_code_block", () => {
    describe("CSS files", () => {
        test("finds CSS selectors containing query text", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "styles.css",
                `.card {
    background: white;
}

.card:hover {
    background: gray;
}

.button {
    padding: 10px;
}

.card-header {
    font-size: 20px;
}`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "styles.css", query: "card" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
            expect(result.data?.matches.length).toBeGreaterThanOrEqual(2);

            const matchNames = result.data?.matches.map((m) => m.name) || [];
            expect(matchNames.some((n) => n?.includes(".card"))).toBe(true);
            expect(matchNames.some((n) => n?.includes(".card:hover"))).toBe(true);
        });

        test("finds @media blocks", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "responsive.css",
                `body {
    font-size: 16px;
}

@media (max-width: 768px) {
    body {
        font-size: 14px;
    }
    .container {
        width: 100%;
    }
}

@media (min-width: 1200px) {
    .container {
        max-width: 1140px;
    }
}`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "responsive.css", query: "768" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
            expect(result.data?.matches.length).toBeGreaterThanOrEqual(1);

            const matchNames = result.data?.matches.map((m) => m.name) || [];
            expect(matchNames.some((n) => n?.includes("@media"))).toBe(true);
        });

        test("finds @keyframes blocks", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "animations.css",
                `.spinner {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
}`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "animations.css", query: "rotate" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);

            const matchNames = result.data?.matches.map((m) => m.name) || [];
            expect(matchNames.some((n) => n?.includes("@keyframes spin"))).toBe(true);
        });
    });

    describe("HTML files", () => {
        test("finds HTML sections with embedded style blocks", async () => {
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
        .nav-link:hover {
            color: red;
        }
    </style>
</head>
<body>
    <header class="header">
        <nav>Navigation</nav>
    </header>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "page.html", query: "hover" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
            expect(result.data?.matches.length).toBeGreaterThanOrEqual(1);
        });

        test("finds CSS rules inside embedded style blocks", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "styled.html",
                `<!DOCTYPE html>
<html>
<head>
    <style>
        .card {
            padding: 20px;
            background: white;
        }
        .card-title {
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2 class="card-title">Title</h2>
    </div>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "styled.html", query: ".card" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
        });

        test("finds JS functions inside embedded script blocks", async () => {
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
    </script>
</head>
<body>
    <button onclick="handleClick()">Click</button>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "interactive.html", query: "handleClick" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
        });

        test("finds semantic HTML sections", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "semantic.html",
                `<!DOCTYPE html>
<html>
<body>
    <header id="main-header">
        <h1>Site Title</h1>
    </header>
    <main>
        <article>
            <h2>Article Title</h2>
            <p>Content here</p>
        </article>
    </main>
    <footer id="site-footer">
        <p>Copyright 2025</p>
    </footer>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "semantic.html", query: "footer" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
        });

        test("deduplicates nested blocks", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "nested.html",
                `<!DOCTYPE html>
<html>
<body>
    <section id="outer">
        <div class="inner">
            <p>nested content with keyword</p>
        </div>
    </section>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "nested.html", query: "keyword" },
                ctx
            );

            expect(result.ok).toBe(true);
            if (result.data?.found) {
                const blocks = result.data.matches;
                for (let i = 0; i < blocks.length; i++) {
                    for (let j = i + 1; j < blocks.length; j++) {
                        const blockI = blocks[i];
                        const blockJ = blocks[j];
                        const iContainsJ =
                            blockI.startLine <= blockJ.startLine &&
                            blockI.endLine >= blockJ.endLine;
                        const jContainsI =
                            blockJ.startLine <= blockI.startLine &&
                            blockJ.endLine >= blockI.endLine;
                        expect(iContainsJ && blockI.startLine !== blockJ.startLine || blockI.endLine !== blockJ.endLine).toBe(false);
                        expect(jContainsI && blockI.startLine !== blockJ.startLine || blockI.endLine !== blockJ.endLine).toBe(false);
                    }
                }
            }
        });
    });

    describe("helpful hints", () => {
        test("returns hint for HTML when no blocks match but text exists", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "simple.html",
                `<!DOCTYPE html>
<html>
<body>
    <p>Some paragraph with specific-text-here</p>
</body>
</html>`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "simple.html", query: "specific-text-here" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(false);
            expect(result.data?.hint).toContain("find_blocks");
        });

        test("returns hint for CSS when no blocks match but text exists", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "minimal.css",
                `/* Comment with search-term */
body { margin: 0; }`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "minimal.css", query: "search-term" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(false);
            expect(result.data?.hint).toContain("find_blocks");
        });

        test("returns hint in error for CSS when text does not exist", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "empty.css", `body { margin: 0; }`);

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "empty.css", query: "nonexistent-text" },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toContain("find_blocks");
        });
    });

    describe("existing functionality preserved", () => {
        test("still finds TypeScript functions", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "utils.ts",
                `export function calculateTotal(items: number[]): number {
    return items.reduce((sum, item) => sum + item, 0);
}

export function formatCurrency(amount: number): string {
    return \`$\${amount.toFixed(2)}\`;
}

export class Calculator {
    add(a: number, b: number): number {
        return a + b;
    }
}`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "utils.ts", query: "Total" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
            expect(result.data?.matches.some((m) => m.name === "calculateTotal")).toBe(true);
        });

        test("still finds Python functions", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "helpers.py",
                `def process_data(data):
    return [x * 2 for x in data]

def validate_input(value):
    if value < 0:
        raise ValueError("Negative value")
    return True

class DataProcessor:
    def __init__(self):
        self.data = []`
            );

            const ctx = createContext(tempRepo.root);
            const result = await findCodeBlockTool.execute(
                { path: "helpers.py", query: "validate" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data?.found).toBe(true);
            expect(result.data?.matches.some((m) => m.name === "validate_input")).toBe(true);
        });
    });
});

