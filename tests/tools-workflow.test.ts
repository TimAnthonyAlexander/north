import { describe, test, expect, afterEach } from "bun:test";
import { findBlocksTool } from "../src/tools/find_blocks";
import { editReplaceExactTool } from "../src/tools/edit_replace_exact";
import { readFileTool } from "../src/tools/read_file";
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

describe("Tool Workflow Integration", () => {
    describe("Mixed HTML Navigation Workflow", () => {
        test("find_blocks returns actionable coordinates for mixed HTML", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .site-header {
            background: #fff;
            padding: 20px;
        }
        .site-footer {
            background: #333;
            color: white;
        }
        @media (max-width: 768px) {
            .site-header { padding: 10px; }
        }
    </style>
</head>
<body>
    <header class="site-header">
        <nav id="main-nav">
            <a href="/">Home</a>
        </nav>
    </header>
    <main>
        <section id="hero">Hero Section</section>
        <section id="features">Features</section>
    </main>
    <footer class="site-footer">
        <p>Copyright 2025</p>
    </footer>
    <script>
        function initNavigation() {
            const nav = document.getElementById('main-nav');
            nav.addEventListener('click', handleClick);
        }
        
        function handleClick(e) {
            e.preventDefault();
            console.log('clicked');
        }
    </script>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();

            if (result.data) {
                const styleBlock = result.data.blocks.find((b) => b.label.includes("<style>"));
                expect(styleBlock).toBeDefined();
                expect(styleBlock!.startLine).toBeGreaterThan(0);
                expect(styleBlock!.endLine).toBeGreaterThan(styleBlock!.startLine);

                const footerCssRule = result.data.blocks.find((b) =>
                    b.label.includes(".site-footer")
                );
                expect(footerCssRule).toBeDefined();

                const mediaQuery = result.data.blocks.find((b) => b.label.includes("@media"));
                expect(mediaQuery).toBeDefined();

                const scriptBlock = result.data.blocks.find((b) => b.label.includes("<script>"));
                expect(scriptBlock).toBeDefined();

                const initFunc = result.data.blocks.find((b) =>
                    b.label.includes("initNavigation")
                );
                expect(initFunc).toBeDefined();

                const heroSection = result.data.blocks.find((b) => b.label.includes("#hero"));
                expect(heroSection).toBeDefined();

                const footerHtml = result.data.blocks.find(
                    (b) => b.id.startsWith("html-") && b.label.includes("footer")
                );
                expect(footerHtml).toBeDefined();
            }
        });

        test("can use find_blocks coordinates for targeted reading", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .header { color: blue; }
        .footer { color: gray; }
    </style>
</head>
<body>
    <header>Header</header>
    <footer>Footer</footer>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);

            const blocksResult = await findBlocksTool.execute({ path: "index.html" }, ctx);
            expect(blocksResult.ok).toBe(true);

            if (blocksResult.data) {
                const styleBlock = blocksResult.data.blocks.find((b) =>
                    b.label.includes("<style>")
                );
                expect(styleBlock).toBeDefined();

                const readResult = await readFileTool.execute(
                    {
                        path: "index.html",
                        startLine: styleBlock!.startLine,
                        endLine: styleBlock!.endLine,
                    },
                    ctx
                );

                expect(readResult.ok).toBe(true);
                if (readResult.data) {
                    expect(readResult.data.content).toContain(".header");
                    expect(readResult.data.content).toContain(".footer");
                }
            }
        });
    });

    describe("Edit Failure Diagnostics Workflow", () => {
        test("edit failure message includes whitespace diagnosis", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.ts", "function test() {\n  const x = 1;\n}\n");

            const ctx = createContext(tempRepo.root);

            const result = await editReplaceExactTool.execute(
                {
                    path: "test.ts",
                    old: "function test() {\n\tconst x = 1;\n}",
                    new: "function test() {\n\tconst x = 2;\n}",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toMatch(/whitespace|tab|space/i);
        });

        test("edit failure message includes near-match candidates", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.ts",
                "const handleUserClick = () => {\n  console.log('click');\n};\n"
            );

            const ctx = createContext(tempRepo.root);

            const result = await editReplaceExactTool.execute(
                {
                    path: "test.ts",
                    old: "const handleUserClcik = () => {",
                    new: "const handleUserClick = (e) => {",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toMatch(/near match|similar|line/i);
        });

        test("edit failure provides actionable hints", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.ts", "export const API_URL = 'https://api.example.com';\n");

            const ctx = createContext(tempRepo.root);

            const result = await editReplaceExactTool.execute(
                {
                    path: "test.ts",
                    old: "export const API_URL = 'https://api.example.org';",
                    new: "export const API_URL = 'https://api.newsite.com';",
                },
                ctx
            );

            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toMatch(/hint|read_around|anchor/i);
        });
    });

    describe("Structure-First Editing Pattern", () => {
        test("find_blocks enables targeted CSS selector editing", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .btn-primary {
            background: blue;
            color: white;
            padding: 10px 20px;
        }
        .btn-secondary {
            background: gray;
            color: black;
        }
    </style>
</head>
<body>
    <button class="btn-primary">Primary</button>
    <button class="btn-secondary">Secondary</button>
</body>
</html>`;
            createFile(tempRepo.root, "buttons.html", htmlContent);

            const ctx = createContext(tempRepo.root);

            const blocksResult = await findBlocksTool.execute({ path: "buttons.html" }, ctx);
            expect(blocksResult.ok).toBe(true);

            if (blocksResult.data) {
                const primaryRule = blocksResult.data.blocks.find((b) =>
                    b.label.includes(".btn-primary")
                );
                expect(primaryRule).toBeDefined();
                expect(primaryRule!.startLine).toBe(5);

                const readResult = await readFileTool.execute(
                    {
                        path: "buttons.html",
                        startLine: primaryRule!.startLine,
                        endLine: primaryRule!.endLine,
                    },
                    ctx
                );

                expect(readResult.ok).toBe(true);
                if (readResult.data) {
                    expect(readResult.data.content).toContain(".btn-primary");
                    expect(readResult.data.content).toContain("background: blue");
                }
            }
        });

        test("find_blocks enables targeted JS function editing", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<body>
    <script>
        function initApp() {
            setupListeners();
            loadData();
        }
        
        function setupListeners() {
            document.addEventListener('click', handleClick);
        }
        
        function handleClick(e) {
            console.log(e.target);
        }
        
        function loadData() {
            fetch('/api/data').then(r => r.json());
        }
    </script>
</body>
</html>`;
            createFile(tempRepo.root, "app.html", htmlContent);

            const ctx = createContext(tempRepo.root);

            const blocksResult = await findBlocksTool.execute({ path: "app.html" }, ctx);
            expect(blocksResult.ok).toBe(true);

            if (blocksResult.data) {
                const handleClickFunc = blocksResult.data.blocks.find((b) =>
                    b.label.includes("handleClick")
                );
                expect(handleClickFunc).toBeDefined();

                const readResult = await readFileTool.execute(
                    {
                        path: "app.html",
                        startLine: handleClickFunc!.startLine,
                        endLine: handleClickFunc!.endLine,
                    },
                    ctx
                );

                expect(readResult.ok).toBe(true);
                if (readResult.data) {
                    expect(readResult.data.content).toContain("handleClick");
                    expect(readResult.data.content).toContain("console.log");
                }
            }
        });
    });

    describe("Pre-check for Duplicate CSS Selectors", () => {
        test("find_blocks reveals existing selectors before adding new ones", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .card {
            padding: 20px;
            border: 1px solid #ddd;
        }
        .card-header {
            font-weight: bold;
        }
        .card-body {
            padding: 10px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="card-header">Title</div>
        <div class="card-body">Content</div>
    </div>
</body>
</html>`;
            createFile(tempRepo.root, "card.html", htmlContent);

            const ctx = createContext(tempRepo.root);

            const blocksResult = await findBlocksTool.execute({ path: "card.html" }, ctx);
            expect(blocksResult.ok).toBe(true);

            if (blocksResult.data) {
                const cssRules = blocksResult.data.blocks.filter(
                    (b) => b.id.includes("-css-") || b.label.startsWith(".")
                );

                const existingSelectors = cssRules.map((r) => r.label);
                expect(existingSelectors).toContain(".card");
                expect(existingSelectors).toContain(".card-header");
                expect(existingSelectors).toContain(".card-body");

                const hasCardFooter = existingSelectors.some((s) => s.includes(".card-footer"));
                expect(hasCardFooter).toBe(false);
            }
        });
    });

    describe("HTML Tag-Based Anchoring", () => {
        test("find_blocks provides semantic HTML landmarks", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<body>
    <header id="site-header">
        <nav class="main-nav">Navigation</nav>
    </header>
    <main>
        <article id="post-123">
            <section class="intro">Introduction</section>
            <section class="content">Main Content</section>
        </article>
        <aside class="sidebar">Sidebar</aside>
    </main>
    <footer id="site-footer">
        <nav class="footer-nav">Footer Nav</nav>
    </footer>
</body>
</html>`;
            createFile(tempRepo.root, "semantic.html", htmlContent);

            const ctx = createContext(tempRepo.root);

            const blocksResult = await findBlocksTool.execute({ path: "semantic.html" }, ctx);
            expect(blocksResult.ok).toBe(true);

            if (blocksResult.data) {
                const htmlBlocks = blocksResult.data.blocks.filter((b) => b.id.startsWith("html-"));

                const headerBlock = htmlBlocks.find((b) => b.label.includes("#site-header"));
                expect(headerBlock).toBeDefined();

                const footerBlock = htmlBlocks.find((b) => b.label.includes("#site-footer"));
                expect(footerBlock).toBeDefined();

                const articleBlock = htmlBlocks.find((b) => b.label.includes("#post-123"));
                expect(articleBlock).toBeDefined();

                const navBlock = htmlBlocks.find((b) => b.label.includes(".main-nav"));
                expect(navBlock).toBeDefined();
            }
        });
    });
});

