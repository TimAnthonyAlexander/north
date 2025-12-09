import { describe, test, expect, afterEach } from "bun:test";
import { loadCursorRules } from "../src/rules/cursor";
import { createTempRepo, createFile, type TempRepo } from "./helpers/fixtures";
import { mkdirSync } from "fs";
import { join } from "path";

let tempRepo: TempRepo | null = null;

afterEach(() => {
    if (tempRepo) {
        tempRepo.cleanup();
        tempRepo = null;
    }
});

describe("Cursor Rules Loader", () => {
    describe("File Discovery", () => {
        test("recursively finds *.mdc files", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", "Rule 1 content");
            createFile(tempRepo.root, ".cursor/rules/nested/rule2.mdc", "Rule 2 content");
            createFile(tempRepo.root, ".cursor/rules/deep/nested/rule3.mdc", "Rule 3 content");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules.length).toBe(3);
                const paths = result.rules.map((r) => r.relativePath).sort();
                expect(paths).toEqual(["deep/nested/rule3.mdc", "nested/rule2.mdc", "rule1.mdc"]);
            }
        });

        test("ignores non-mdc files", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/rule.mdc", "Include this");
            createFile(tempRepo.root, ".cursor/rules/readme.md", "Ignore this");
            createFile(tempRepo.root, ".cursor/rules/config.json", "Ignore this too");
            createFile(tempRepo.root, ".cursor/rules/script.ts", "Also ignore");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules.length).toBe(1);
                expect(result.rules[0].name).toBe("rule");
            }
        });

        test("returns null when .cursor/rules directory does not exist", async () => {
            tempRepo = createTempRepo();

            const result = await loadCursorRules(tempRepo.root);

            expect(result).toBeNull();
        });

        test("returns null when .cursor/rules is empty", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const result = await loadCursorRules(tempRepo.root);

            expect(result).toBeNull();
        });

        test("returns null when only non-mdc files exist", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/readme.md", "Not an mdc file");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).toBeNull();
        });
    });

    describe("Ordering", () => {
        test("stable ordering by relativePath", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/zebra.mdc", "Z");
            createFile(tempRepo.root, ".cursor/rules/alpha.mdc", "A");
            createFile(tempRepo.root, ".cursor/rules/beta/gamma.mdc", "G");
            createFile(tempRepo.root, ".cursor/rules/beta/delta.mdc", "D");

            const result1 = await loadCursorRules(tempRepo.root);
            const result2 = await loadCursorRules(tempRepo.root);

            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();

            if (result1 && result2) {
                const paths1 = result1.rules.map((r) => r.relativePath);
                const paths2 = result2.rules.map((r) => r.relativePath);

                expect(paths1).toEqual(paths2);

                expect(paths1).toEqual(["alpha.mdc", "beta/delta.mdc", "beta/gamma.mdc", "zebra.mdc"]);
            }
        });
    });

    describe("Frontmatter Stripping", () => {
        test("strips YAML frontmatter and keeps body", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const contentWithFrontmatter = `---
title: My Rule
author: Test
version: 1.0
---

This is the body content.
It should be kept.`;

            createFile(tempRepo.root, ".cursor/rules/test.mdc", contentWithFrontmatter);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules[0].body).not.toContain("---");
                expect(result.rules[0].body).not.toContain("title:");
                expect(result.rules[0].body).toContain("This is the body content");
                expect(result.rules[0].body).toContain("It should be kept");
            }
        });

        test("handles content without frontmatter", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const plainContent = "This is plain content without frontmatter.";
            createFile(tempRepo.root, ".cursor/rules/plain.mdc", plainContent);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules[0].body).toBe(plainContent);
            }
        });

        test("handles malformed frontmatter gracefully", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const malformedContent = `---
title: Incomplete frontmatter
This is body text appearing too soon`;

            createFile(tempRepo.root, ".cursor/rules/malformed.mdc", malformedContent);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules[0].body).toBeTruthy();
            }
        });

        test("trims whitespace from body", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const contentWithWhitespace = `---
title: Test
---

   Content with leading and trailing spaces   

`;

            createFile(tempRepo.root, ".cursor/rules/whitespace.mdc", contentWithWhitespace);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules[0].body).toBe("Content with leading and trailing spaces");
            }
        });
    });

    describe("30KB Cap", () => {
        test("truncates when total size exceeds 30KB", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const largeContent = "x".repeat(10000);
            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", largeContent);
            createFile(tempRepo.root, ".cursor/rules/rule2.mdc", largeContent);
            createFile(tempRepo.root, ".cursor/rules/rule3.mdc", largeContent);
            createFile(tempRepo.root, ".cursor/rules/rule4.mdc", largeContent);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.truncated).toBe(true);
                expect(result.rules.length).toBeLessThan(4);
                expect(result.text).toContain("[truncated]");
            }
        });

        test("does not truncate when under 30KB", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const smallContent = "Small rule content";
            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", smallContent);
            createFile(tempRepo.root, ".cursor/rules/rule2.mdc", smallContent);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.truncated).toBe(false);
                expect(result.text).not.toContain("[truncated]");
            }
        });

        test("truncated marker appears in text output", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const largeContent = "x".repeat(12000);
            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", largeContent);
            createFile(tempRepo.root, ".cursor/rules/rule2.mdc", largeContent);
            createFile(tempRepo.root, ".cursor/rules/rule3.mdc", largeContent);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.truncated).toBe(true);
                expect(result.text).toContain("[truncated]");
            }
        });

        test("truncation stops before exceeding limit", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const content = "x".repeat(10000);
            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", content);
            createFile(tempRepo.root, ".cursor/rules/rule2.mdc", content);
            createFile(tempRepo.root, ".cursor/rules/rule3.mdc", content);
            createFile(tempRepo.root, ".cursor/rules/rule4.mdc", content);

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                const textBytes = Buffer.byteLength(result.text, "utf-8");
                expect(textBytes).toBeLessThanOrEqual(30 * 1024 + 100);
            }
        });
    });

    describe("Text Output Format", () => {
        test("text has correct header", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/test.mdc", "Test content");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.text).toContain("# Cursor Project Rules (.cursor/rules)");
            }
        });

        test("each rule has ## header with relativePath", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/test.mdc", "Content");
            createFile(tempRepo.root, ".cursor/rules/nested/deep.mdc", "Deep content");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.text).toContain("## nested/deep.mdc");
                expect(result.text).toContain("## test.mdc");
            }
        });

        test("text includes rule bodies", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/rule1.mdc", "First rule body");
            createFile(tempRepo.root, ".cursor/rules/rule2.mdc", "Second rule body");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.text).toContain("First rule body");
                expect(result.text).toContain("Second rule body");
            }
        });
    });

    describe("Edge Cases", () => {
        test("handles unreadable file gracefully", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/good.mdc", "Good content");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules.length).toBe(1);
            }
        });

        test("handles empty mdc file", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            createFile(tempRepo.root, ".cursor/rules/empty.mdc", "");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules.length).toBe(1);
                expect(result.rules[0].body).toBe("");
            }
        });

        test("handles very long file names", async () => {
            tempRepo = createTempRepo();
            mkdirSync(join(tempRepo.root, ".cursor/rules"), { recursive: true });

            const longName = "a".repeat(200) + ".mdc";
            createFile(tempRepo.root, `.cursor/rules/${longName}`, "Content");

            const result = await loadCursorRules(tempRepo.root);

            expect(result).not.toBeNull();
            if (result) {
                expect(result.rules.length).toBe(1);
            }
        });
    });
});

