import { describe, test, expect, afterEach } from "bun:test";
import { readFileTool } from "../src/tools/read_file";
import { searchTextTool } from "../src/tools/search_text";
import { editReplaceExactTool } from "../src/tools/edit_replace_exact";
import { editInsertAtLineTool } from "../src/tools/edit_insert_at_line";
import { editCreateFileTool } from "../src/tools/edit_create_file";
import { editApplyBatchTool } from "../src/tools/edit_apply_batch";
import type { ToolContext } from "../src/tools/types";
import { createTempRepo, createFile, createSymlink, type TempRepo } from "./helpers/fixtures";
import { tmpdir } from "os";
import { join } from "path";

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

describe("Path Traversal Security", () => {
    describe("read_file", () => {
        test("blocks ../ traversal attempts", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "safe.txt", "safe content");

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "../../../etc/passwd" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("blocks normalized paths that escape", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "subdir/../../outside.txt" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("blocks absolute paths outside repo", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "/etc/passwd" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("allows valid relative paths", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "subdir/file.txt", "content");

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "subdir/file.txt" }, ctx);

            expect(result.ok).toBe(true);
        });

        test("allows absolute paths within repo", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file.txt", "content");
            const absolutePath = join(tempRepo.root, "file.txt");

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: absolutePath }, ctx);

            expect(result.ok).toBe(true);
        });
    });

    describe("search_text", () => {
        test("blocks path traversal in file parameter", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "safe.txt", "content");

            const ctx = createContext(tempRepo.root);
            const result = await searchTextTool.execute({
                query: "test",
                file: "../../../etc/passwd",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("allows valid file paths", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "dir/test.txt", "test content");

            const ctx = createContext(tempRepo.root);
            const result = await searchTextTool.execute({
                query: "test",
                file: "dir/test.txt",
            }, ctx);

            expect(result.ok).toBe(true);
        });
    });

    describe("edit_replace_exact", () => {
        test("blocks path traversal", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "safe.txt", "content");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "../../../etc/passwd",
                old: "root",
                new: "hacked",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("allows valid paths", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "dir/file.txt", "old text");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "dir/file.txt",
                old: "old",
                new: "new",
            }, ctx);

            expect(result.ok).toBe(true);
        });
    });

    describe("edit_insert_at_line", () => {
        test("blocks path traversal", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "../../outside.txt",
                line: 1,
                content: "malicious",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });
    });

    describe("edit_create_file", () => {
        test("blocks path traversal", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "../../../tmp/evil.txt",
                content: "malicious",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("allows creating files in subdirectories", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "subdir/newfile.txt",
                content: "safe content",
            }, ctx);

            expect(result.ok).toBe(true);
        });
    });

    describe("edit_apply_batch", () => {
        test("blocks path traversal in batch edits", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "safe.txt", "content");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_create_file",
                        args: {
                            path: "../../../tmp/evil.txt",
                            content: "malicious",
                        },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });
    });
});

describe("Symlink Escape Security", () => {
    describe("read_file", () => {
        test("blocks reading through symlink that escapes repo", async () => {
            tempRepo = createTempRepo();
            
            const outsideTarget = join(tmpdir(), `outside-${Date.now()}.txt`);
            createFile(tmpdir(), `outside-${Date.now()}.txt`.split("/").pop()!, "secret data");
            
            createSymlink(tempRepo.root, outsideTarget, "evil-link.txt");

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "evil-link.txt" }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("allows reading through symlink within repo", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "target.txt", "target content");
            createSymlink(tempRepo.root, join(tempRepo.root, "target.txt"), "link.txt");

            const ctx = createContext(tempRepo.root);
            const result = await readFileTool.execute({ path: "link.txt" }, ctx);

            expect(result.ok).toBe(true);
            if (result.data) {
                expect(result.data.content).toContain("target content");
            }
        });
    });

    describe("edit tools with symlinks", () => {
        test("blocks edit_create_file when parent is symlink chain escaping repo", async () => {
            tempRepo = createTempRepo();
            
            const outsideDir = join(tmpdir(), `outside-dir-${Date.now()}`);
            createFile(outsideDir, "dummy.txt", "outside");
            
            createSymlink(tempRepo.root, outsideDir, "evil-dir");

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "evil-dir/newfile.txt",
                content: "malicious",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });

        test("blocks edit_replace_exact through escaping symlink", async () => {
            tempRepo = createTempRepo();
            
            const outsideFile = join(tmpdir(), `outside-${Date.now()}.txt`);
            createFile(tmpdir(), `outside-${Date.now()}.txt`.split("/").pop()!, "outside content");
            
            createSymlink(tempRepo.root, outsideFile, "evil-link.txt");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "evil-link.txt",
                old: "outside",
                new: "hacked",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("escapes repository root");
        });
    });
});

describe("Security: No Side Effects on Failure", () => {
    test("failed path validation does not read file", async () => {
        tempRepo = createTempRepo();
        
        const sensitiveFile = join(tmpdir(), "sensitive.txt");
        createFile(tmpdir(), "sensitive.txt", "SECRET_API_KEY=abc123");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: sensitiveFile }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("escapes repository root");
        expect(result.data).toBeUndefined();
    });

    test("failed security check does not create file", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await editCreateFileTool.execute({
            path: "../../../tmp/evil.txt",
            content: "should not be created",
        }, ctx);

        expect(result.ok).toBe(false);
        expect(result.data).toBeUndefined();
    });

    test("failed security check in batch affects no files", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "legitimate.txt", "original");

        const ctx = createContext(tempRepo.root);
        const result = await editApplyBatchTool.execute({
            edits: [
                {
                    toolName: "edit_replace_exact",
                    args: {
                        path: "legitimate.txt",
                        old: "original",
                        new: "modified",
                    },
                },
                {
                    toolName: "edit_create_file",
                    args: {
                        path: "../../../tmp/evil.txt",
                        content: "malicious",
                    },
                },
            ],
        }, ctx);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("escapes repository root");
        expect(result.data).toBeUndefined();
    });
});

describe("Path Normalization Edge Cases", () => {
    test("handles multiple consecutive slashes", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "dir/file.txt", "content");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "dir//file.txt" }, ctx);

        expect(result.ok).toBe(true);
    });

    test("handles ./ in paths", async () => {
        tempRepo = createTempRepo();
        createFile(tempRepo.root, "file.txt", "content");

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "./file.txt" }, ctx);

        expect(result.ok).toBe(true);
    });

    test("blocks clever traversal with extra dots", async () => {
        tempRepo = createTempRepo();

        const ctx = createContext(tempRepo.root);
        const result = await readFileTool.execute({ path: "dir/../../etc/passwd" }, ctx);

        expect(result.ok).toBe(false);
    });
});

