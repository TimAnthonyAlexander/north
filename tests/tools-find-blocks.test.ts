import { describe, test, expect, afterEach } from "bun:test";
import { findBlocksTool } from "../src/tools/find_blocks";
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

describe("find_blocks", () => {
    describe("Mixed HTML Files", () => {
        test("finds embedded style block with line range", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .header { color: blue; }
    </style>
</head>
<body>
    <header>Test</header>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const styleBlock = result.data.blocks.find((b) => b.id.startsWith("style-"));
                expect(styleBlock).toBeDefined();
                expect(styleBlock?.label).toContain("<style>");
                expect(styleBlock?.startLine).toBe(4);
                expect(styleBlock?.endLine).toBe(6);
            }
        });

        test("finds CSS rules inside embedded style block", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .header {
            color: blue;
            font-size: 16px;
        }
        .footer {
            background: gray;
        }
    </style>
</head>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const cssBlocks = result.data.blocks.filter((b) => b.id.includes("-css-"));
                expect(cssBlocks.length).toBeGreaterThanOrEqual(2);

                const headerRule = cssBlocks.find((b) => b.label.includes(".header"));
                expect(headerRule).toBeDefined();

                const footerRule = cssBlocks.find((b) => b.label.includes(".footer"));
                expect(footerRule).toBeDefined();
            }
        });

        test("finds embedded script block with line range", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <script>
        function init() {
            console.log("hello");
        }
    </script>
</head>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const scriptBlock = result.data.blocks.find((b) => b.id.startsWith("script-"));
                expect(scriptBlock).toBeDefined();
                expect(scriptBlock?.label).toContain("<script>");
                expect(scriptBlock?.startLine).toBe(4);
                expect(scriptBlock?.endLine).toBe(8);
            }
        });

        test("finds JS functions inside embedded script block", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <script>
        function initApp() {
            console.log("init");
        }

        const handleClick = () => {
            console.log("click");
        };
    </script>
</head>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const jsBlocks = result.data.blocks.filter((b) => b.id.includes("-js-"));
                expect(jsBlocks.length).toBeGreaterThanOrEqual(1);

                const initFunc = jsBlocks.find((b) => b.label.includes("initApp"));
                expect(initFunc).toBeDefined();
            }
        });

        test("combines HTML sections with embedded blocks", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .site-header { color: blue; }
    </style>
</head>
<body>
    <header class="main-header">
        <nav>Navigation</nav>
    </header>
    <main>
        <section id="intro">Introduction</section>
    </main>
    <footer>Footer</footer>
    <script>
        function setup() {}
    </script>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const htmlBlocks = result.data.blocks.filter((b) => b.id.startsWith("html-"));
                expect(htmlBlocks.length).toBeGreaterThanOrEqual(4);

                const styleBlocks = result.data.blocks.filter((b) => b.id.startsWith("style-"));
                expect(styleBlocks.length).toBe(1);

                const scriptBlocks = result.data.blocks.filter((b) => b.id.startsWith("script-"));
                expect(scriptBlocks.length).toBe(1);

                const cssRules = result.data.blocks.filter((b) => b.id.includes("-css-"));
                expect(cssRules.length).toBeGreaterThanOrEqual(1);

                const headerBlock = htmlBlocks.find((b) => b.label.includes("header"));
                expect(headerBlock).toBeDefined();

                const footerBlock = htmlBlocks.find((b) => b.label.includes("footer"));
                expect(footerBlock).toBeDefined();

                const sectionBlock = htmlBlocks.find((b) => b.label.includes("#intro"));
                expect(sectionBlock).toBeDefined();
            }
        });

        test("handles multiple style and script blocks", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .header { color: blue; }
    </style>
    <style>
        .footer { color: gray; }
    </style>
</head>
<body>
    <script>
        function init() {}
    </script>
    <script>
        function cleanup() {}
    </script>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const styleBlocks = result.data.blocks.filter((b) =>
                    b.id.startsWith("style-") && !b.id.includes("-css-")
                );
                expect(styleBlocks.length).toBe(2);

                const scriptBlocks = result.data.blocks.filter((b) =>
                    b.id.startsWith("script-") && !b.id.includes("-js-")
                );
                expect(scriptBlocks.length).toBe(2);
            }
        });

        test("handles @media queries inside style blocks", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .header { color: blue; }
        @media (max-width: 768px) {
            .header { color: red; }
        }
    </style>
</head>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const mediaRule = result.data.blocks.find((b) => b.label.includes("@media"));
                expect(mediaRule).toBeDefined();
            }
        });

        test("blocks are sorted by startLine", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .a { color: blue; }
    </style>
</head>
<body>
    <header>Header</header>
    <script>
        function test() {}
    </script>
    <footer>Footer</footer>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const blocks = result.data.blocks;
                for (let i = 1; i < blocks.length; i++) {
                    expect(blocks[i].startLine).toBeGreaterThanOrEqual(blocks[i - 1].startLine);
                }
            }
        });
    });

    describe("Pure HTML Files", () => {
        test("finds HTML sections without style/script", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<body>
    <header id="main-header">Header</header>
    <main>
        <section class="intro">Intro</section>
        <article>Article</article>
    </main>
    <footer>Footer</footer>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "index.html" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.blocks.length).toBeGreaterThanOrEqual(5);
            }
        });
    });

    describe("Pure CSS Files", () => {
        test("finds CSS rules in standalone CSS file", async () => {
            tempRepo = createTempRepo();
            const cssContent = `.header {
    color: blue;
}

.footer {
    background: gray;
}

@media (max-width: 768px) {
    .header {
        font-size: 14px;
    }
}`;
            createFile(tempRepo.root, "styles.css", cssContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "styles.css" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.blocks.length).toBe(3);

                const headerRule = result.data.blocks.find((b) => b.label.includes(".header"));
                expect(headerRule).toBeDefined();

                const footerRule = result.data.blocks.find((b) => b.label.includes(".footer"));
                expect(footerRule).toBeDefined();

                const mediaRule = result.data.blocks.find((b) => b.label.includes("@media"));
                expect(mediaRule).toBeDefined();
            }
        });
    });

    describe("Pure JS/TS Files", () => {
        test("finds JS symbols in standalone JS file", async () => {
            tempRepo = createTempRepo();
            const jsContent = `function initApp() {
    console.log("init");
}

const handleClick = (e) => {
    console.log(e);
};

class MyClass {
    constructor() {}
}`;
            createFile(tempRepo.root, "app.js", jsContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "app.js" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const initFunc = result.data.blocks.find((b) => b.label.includes("initApp"));
                expect(initFunc).toBeDefined();

                const classBlock = result.data.blocks.find((b) => b.label.includes("class MyClass"));
                expect(classBlock).toBeDefined();
            }
        });
    });

    describe("Kind Filtering", () => {
        test("html_section filter returns only HTML sections", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>.a { color: blue; }</style>
</head>
<body>
    <header>Header</header>
    <script>function test() {}</script>
</body>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute(
                { path: "index.html", kind: "html_section" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.blocks.every((b) => b.id.startsWith("html-"))).toBe(true);
            }
        });

        test("css_rule filter can be used on HTML files", async () => {
            tempRepo = createTempRepo();
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        .a { color: blue; }
        .b { color: red; }
    </style>
</head>
</html>`;
            createFile(tempRepo.root, "index.html", htmlContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute(
                { path: "index.html", kind: "css_rule" },
                ctx
            );

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe("Error Handling", () => {
        test("returns error for non-existent file", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "nonexistent.html" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("not found");
        });

        test("returns error for directory path", async () => {
            tempRepo = createTempRepo();
            const fs = await import("fs");
            fs.mkdirSync(`${tempRepo.root}/subdir`, { recursive: true });

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "subdir" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("directory");
        });
    });

    describe("C# Files", () => {
        test("finds namespace, class, and method blocks", async () => {
            tempRepo = createTempRepo();
            const csContent = `using System;

namespace MyApp.Services
{
    public class UserService
    {
        private readonly ILogger _logger;

        public UserService(ILogger logger)
        {
            _logger = logger;
        }

        public async Task<User> GetUserAsync(int id)
        {
            return await _db.Users.FindAsync(id);
        }
    }
}`;
            createFile(tempRepo.root, "UserService.cs", csContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "UserService.cs" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const namespaceBlock = result.data.blocks.find((b) => b.label.includes("namespace"));
                expect(namespaceBlock).toBeDefined();

                const classBlock = result.data.blocks.find((b) => b.label.includes("class UserService"));
                expect(classBlock).toBeDefined();

                const methodBlock = result.data.blocks.find((b) => b.label.includes("method GetUserAsync"));
                expect(methodBlock).toBeDefined();
            }
        });

        test("finds interface and enum", async () => {
            tempRepo = createTempRepo();
            const csContent = `namespace MyApp
{
    public interface IUserService
    {
        Task<User> GetUser(int id);
    }

    public enum UserStatus
    {
        Active,
        Inactive
    }
}`;
            createFile(tempRepo.root, "Interfaces.cs", csContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "Interfaces.cs" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const interfaceBlock = result.data.blocks.find((b) => b.label.includes("interface IUserService"));
                expect(interfaceBlock).toBeDefined();

                const enumBlock = result.data.blocks.find((b) => b.label.includes("enum UserStatus"));
                expect(enumBlock).toBeDefined();
            }
        });
    });

    describe("PHP Files", () => {
        test("finds namespace, class, and method blocks", async () => {
            tempRepo = createTempRepo();
            const phpContent = `<?php

namespace App\\Services;

class UserService
{
    private $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function getUser(int $id): User
    {
        return $this->db->find($id);
    }

    private static function validateId($id): bool
    {
        return is_numeric($id);
    }
}`;
            createFile(tempRepo.root, "UserService.php", phpContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "UserService.php" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const namespaceBlock = result.data.blocks.find((b) => b.label.includes("namespace"));
                expect(namespaceBlock).toBeDefined();

                const classBlock = result.data.blocks.find((b) => b.label.includes("class UserService"));
                expect(classBlock).toBeDefined();

                const methodBlocks = result.data.blocks.filter((b) => b.label.includes("method"));
                expect(methodBlocks.length).toBeGreaterThanOrEqual(2);
            }
        });

        test("finds trait and interface", async () => {
            tempRepo = createTempRepo();
            const phpContent = `<?php

trait Loggable
{
    public function log(string $message): void
    {
        echo $message;
    }
}

interface UserRepositoryInterface
{
    public function find(int $id): ?User;
}`;
            createFile(tempRepo.root, "Contracts.php", phpContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "Contracts.php" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const traitBlock = result.data.blocks.find((b) => b.label.includes("trait Loggable"));
                expect(traitBlock).toBeDefined();

                const interfaceBlock = result.data.blocks.find((b) => b.label.includes("interface UserRepositoryInterface"));
                expect(interfaceBlock).toBeDefined();
            }
        });
    });

    describe("Java Files", () => {
        test("finds package, class, and method blocks", async () => {
            tempRepo = createTempRepo();
            const javaContent = `package com.myapp.services;

import java.util.List;

public class UserService {
    private final UserRepository repo;

    public UserService(UserRepository repo) {
        this.repo = repo;
    }

    public User getUser(int id) {
        return repo.findById(id);
    }

    private void validate(User user) {
        if (user == null) throw new IllegalArgumentException();
    }
}`;
            createFile(tempRepo.root, "UserService.java", javaContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "UserService.java" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const packageBlock = result.data.blocks.find((b) => b.label.includes("package"));
                expect(packageBlock).toBeDefined();

                const classBlock = result.data.blocks.find((b) => b.label.includes("class UserService"));
                expect(classBlock).toBeDefined();

                const methodBlocks = result.data.blocks.filter((b) => b.label.includes("method"));
                expect(methodBlocks.length).toBeGreaterThanOrEqual(2);
            }
        });

        test("finds interface and enum", async () => {
            tempRepo = createTempRepo();
            const javaContent = `package com.myapp;

public interface UserRepository {
    User findById(int id);
    List<User> findAll();
}

public enum Status {
    ACTIVE,
    INACTIVE
}`;
            createFile(tempRepo.root, "Contracts.java", javaContent);

            const ctx = createContext(tempRepo.root);
            const result = await findBlocksTool.execute({ path: "Contracts.java" }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const interfaceBlock = result.data.blocks.find((b) => b.label.includes("interface UserRepository"));
                expect(interfaceBlock).toBeDefined();

                const enumBlock = result.data.blocks.find((b) => b.label.includes("enum Status"));
                expect(enumBlock).toBeDefined();
            }
        });
    });
});

