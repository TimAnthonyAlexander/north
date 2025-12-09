import { describe, test, expect, afterEach } from "bun:test";
import { editReplaceExactTool } from "../src/tools/edit_replace_exact";
import { editInsertAtLineTool } from "../src/tools/edit_insert_at_line";
import { editCreateFileTool } from "../src/tools/edit_create_file";
import { editApplyBatchTool } from "../src/tools/edit_apply_batch";
import { applyEditsAtomically } from "../src/utils/editing";
import type { ToolContext, EditPrepareResult } from "../src/tools/types";
import {
    createTempRepo,
    createFile,
    readFixtureFile,
    assertNoTempFiles,
    createFileWithTrailingNewline,
    createFileWithoutTrailingNewline,
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

describe("edit_replace_exact", () => {
    describe("Prepare Contract", () => {
        test("replaces single occurrence correctly", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "hello world\ntest line\ngoodbye world\n");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "test line",
                new: "modified line",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile.length).toBe(1);
                expect(result.data.diffsByFile[0].path).toBe("test.txt");
                expect(result.data.diffsByFile[0].linesAdded).toBe(1);
                expect(result.data.diffsByFile[0].linesRemoved).toBe(1);
                expect(result.data.diffsByFile[0].diff).toContain("-test line");
                expect(result.data.diffsByFile[0].diff).toContain("+modified line");
                expect(result.data.stats.filesChanged).toBe(1);
                expect(result.data.applyPayload.length).toBe(1);
            }
        });

        test("fails when text not found", async () => {
            tempRepo = createTempRepo();
            const originalContent = "hello world\n";
            createFile(tempRepo.root, "test.txt", originalContent);

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "nonexistent",
                new: "replacement",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("not found");
            expect(result.data).toBeUndefined();

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe(originalContent);
            assertNoTempFiles(tempRepo.root);
        });

        test("validates expectedOccurrences", async () => {
            tempRepo = createTempRepo();
            const originalContent = "foo bar foo baz foo\n";
            createFile(tempRepo.root, "test.txt", originalContent);

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "foo",
                new: "replaced",
                expectedOccurrences: 2,
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Expected 2");
            expect(result.error).toContain("found 3");

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe(originalContent);
            assertNoTempFiles(tempRepo.root);
        });

        test("replaces multiline blocks", async () => {
            tempRepo = createTempRepo();
            createFile(
                tempRepo.root,
                "test.txt",
                "line 1\nold block\nold content\nold end\nline 5\n"
            );

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "old block\nold content\nold end",
                new: "new block\nnew content\nnew end",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile[0].linesAdded).toBe(3);
                expect(result.data.diffsByFile[0].linesRemoved).toBe(3);
            }
        });

        test("preserves trailing newline", async () => {
            tempRepo = createTempRepo();
            createFileWithTrailingNewline(tempRepo.root, "test.txt", "hello world");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "world",
                new: "universe",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const modified = result.data.applyPayload[0].content;
                expect(modified.endsWith("\n")).toBe(true);
            }
        });

        test("preserves no trailing newline", async () => {
            tempRepo = createTempRepo();
            createFileWithoutTrailingNewline(tempRepo.root, "test.txt", "hello world");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "world",
                new: "universe",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const modified = result.data.applyPayload[0].content;
                expect(modified.endsWith("\n")).toBe(false);
            }
        });
    });

    describe("Apply Integration", () => {
        test("applied edit produces correct file content", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nold text\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editReplaceExactTool.execute({
                path: "test.txt",
                old: "old text",
                new: "new text",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("line 1\nnew text\nline 3\n");

                assertNoTempFiles(tempRepo.root);
            }
        });
    });
});

describe("edit_insert_at_line", () => {
    describe("Prepare Contract", () => {
        test("inserts at beginning (line 1)", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 1,
                content: "inserted",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile[0].linesAdded).toBe(1);
                expect(result.data.diffsByFile[0].linesRemoved).toBe(0);
                expect(result.data.applyPayload[0].content).toContain("inserted");
            }
        });

        test("inserts at middle line", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 2,
                content: "inserted",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
        });

        test("appends at end (length + 1)", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 3,
                content: "appended",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
        });

        test("fails on invalid line number (< 1)", async () => {
            tempRepo = createTempRepo();
            const originalContent = "line 1\n";
            createFile(tempRepo.root, "test.txt", originalContent);

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 0,
                content: "invalid",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("must be at least 1");

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe(originalContent);
            assertNoTempFiles(tempRepo.root);
        });

        test("fails on line number exceeding length + 1", async () => {
            tempRepo = createTempRepo();
            const originalContent = "line 1\nline 2\n";
            createFile(tempRepo.root, "test.txt", originalContent);

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 10,
                content: "invalid",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("exceeds file length");

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe(originalContent);
            assertNoTempFiles(tempRepo.root);
        });

        test("inserts into empty file", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "empty.txt", "");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "empty.txt",
                line: 1,
                content: "first line",
            }, ctx);

            expect(result.ok).toBe(true);
        });

        test("preserves trailing newline", async () => {
            tempRepo = createTempRepo();
            createFileWithTrailingNewline(tempRepo.root, "test.txt", "line 1");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 1,
                content: "inserted",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const modified = result.data.applyPayload[0].content;
                expect(modified.endsWith("\n")).toBe(true);
            }
        });
    });

    describe("Apply Integration", () => {
        test("insert at line 1 produces correct content", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 1,
                content: "inserted",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("inserted\nline 1\nline 2\n");

                assertNoTempFiles(tempRepo.root);
            }
        });

        test("insert at middle produces correct content", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editInsertAtLineTool.execute({
                path: "test.txt",
                line: 2,
                content: "inserted",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "test.txt");
                expect(finalContent).toBe("line 1\ninserted\nline 2\nline 3\n");
            }
        });
    });
});

describe("edit_create_file", () => {
    describe("Prepare Contract", () => {
        test("creates new file", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "new.txt",
                content: "new content\n",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile.length).toBe(1);
                expect(result.data.diffsByFile[0].path).toBe("new.txt");
                expect(result.data.diffsByFile[0].linesAdded).toBeGreaterThan(0);
                expect(result.data.diffsByFile[0].linesRemoved).toBe(0);
                expect(result.data.diffsByFile[0].diff).toContain("--- /dev/null");
                expect(result.data.diffsByFile[0].diff).toContain("+++ b/new.txt");
                expect(result.data.applyPayload[0].type).toBe("create");
            }
        });

        test("overwrites existing file when overwrite=true", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "existing.txt", "original content\n");

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "existing.txt",
                content: "new content\n",
                overwrite: true,
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile[0].linesAdded).toBeGreaterThan(0);
                expect(result.data.diffsByFile[0].linesRemoved).toBeGreaterThan(0);
                expect(result.data.applyPayload[0].originalContent).toBe("original content\n");
            }
        });

        test("fails when file exists and overwrite=false", async () => {
            tempRepo = createTempRepo();
            const originalContent = "content";
            createFile(tempRepo.root, "existing.txt", originalContent);

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "existing.txt",
                content: "new",
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("already exists");
            expect(result.data).toBeUndefined();

            const finalContent = readFixtureFile(tempRepo.root, "existing.txt");
            expect(finalContent).toBe(originalContent);
            assertNoTempFiles(tempRepo.root);
        });

        test("creates parent directories automatically", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "deep/nested/dir/file.txt",
                content: "content",
            }, ctx);

            expect(result.ok).toBe(true);
        });

        test("diff format correct for new file", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "new.txt",
                content: "line 1\nline 2\n",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const diff = result.data.diffsByFile[0].diff;
                expect(diff).toContain("--- /dev/null");
                expect(diff).toContain("+++ b/new.txt");
                expect(diff).toContain("+line 1");
                expect(diff).toContain("+line 2");
            }
        });
    });

    describe("Apply Integration", () => {
        test("creates file with exact content", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "new.txt",
                content: "line 1\nline 2\nline 3\n",
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "new.txt");
                expect(finalContent).toBe("line 1\nline 2\nline 3\n");

                assertNoTempFiles(tempRepo.root);
            }
        });

        test("overwrites file correctly", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file.txt", "old content\n");

            const ctx = createContext(tempRepo.root);
            const result = await editCreateFileTool.execute({
                path: "file.txt",
                content: "completely new\n",
                overwrite: true,
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const finalContent = readFixtureFile(tempRepo.root, "file.txt");
                expect(finalContent).toBe("completely new\n");
            }
        });
    });
});

describe("edit_apply_batch", () => {
    describe("Validation", () => {
        test("fails with unknown toolName", async () => {
            tempRepo = createTempRepo();

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "unknown_tool",
                        args: { path: "test.txt" },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Unknown tool");
        });

        test("fails when any child edit fails", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file1.txt", "content1\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "file1.txt",
                            old: "content1",
                            new: "modified1",
                        },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "nonexistent.txt",
                            old: "foo",
                            new: "bar",
                        },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(false);
            expect(result.error).toContain("Batch validation failed");
            expect(result.data).toBeUndefined();
        });

        test("succeeds when all edits valid", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file1.txt", "content1\n");
            createFile(tempRepo.root, "file2.txt", "content2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "file1.txt",
                            old: "content1",
                            new: "modified1",
                        },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "file2.txt",
                            old: "content2",
                            new: "modified2",
                        },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe("Consolidation", () => {
        test("consolidates multiple edits to same file", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "test.txt",
                            old: "line 1",
                            new: "modified 1",
                        },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: {
                            path: "test.txt",
                            old: "line 2",
                            new: "modified 2",
                        },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.diffsByFile.length).toBe(1);
                expect(result.data.diffsByFile[0].path).toBe("test.txt");
                expect(result.data.diffsByFile[0].linesAdded).toBe(2);
                expect(result.data.diffsByFile[0].linesRemoved).toBe(2);
            }
        });

        test("stats totals are correct", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file1.txt", "a\n");
            createFile(tempRepo.root, "file2.txt", "b\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "file1.txt", old: "a", new: "aa" },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "file2.txt", old: "b", new: "bb" },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.stats.filesChanged).toBe(2);
                expect(result.data.stats.totalLinesAdded).toBe(2);
                expect(result.data.stats.totalLinesRemoved).toBe(2);
            }
        });
    });

    describe("Apply Integration", () => {
        test("applies batch edits to multiple files atomically", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file1.txt", "content1\n");
            createFile(tempRepo.root, "file2.txt", "content2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "file1.txt", old: "content1", new: "modified1" },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "file2.txt", old: "content2", new: "modified2" },
                    },
                    {
                        toolName: "edit_create_file",
                        args: { path: "file3.txt", content: "new file\n" },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
            if (result.data) {
                const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
                expect(applyResult.ok).toBe(true);

                const content1 = readFixtureFile(tempRepo.root, "file1.txt");
                const content2 = readFixtureFile(tempRepo.root, "file2.txt");
                const content3 = readFixtureFile(tempRepo.root, "file3.txt");

                expect(content1).toBe("modified1\n");
                expect(content2).toBe("modified2\n");
                expect(content3).toBe("new file\n");

                assertNoTempFiles(tempRepo.root);
            }
        });

        test("multiple edits to same file apply correctly", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "test.txt", "line 1\nline 2\nline 3\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_insert_at_line",
                        args: { path: "test.txt", line: 1, content: "inserted" },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "test.txt", old: "line 2", new: "modified 2" },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe("Atomicity on Failure", () => {
        test("validation failure leaves filesystem unchanged", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "file1.txt", "original1\n");
            createFile(tempRepo.root, "file2.txt", "original2\n");

            const ctx = createContext(tempRepo.root);
            const result = await editApplyBatchTool.execute({
                edits: [
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "file1.txt", old: "original1", new: "modified1" },
                    },
                    {
                        toolName: "edit_replace_exact",
                        args: { path: "nonexistent.txt", old: "foo", new: "bar" },
                    },
                ],
            }, ctx);

            expect(result.ok).toBe(false);

            const content1 = readFixtureFile(tempRepo.root, "file1.txt");
            const content2 = readFixtureFile(tempRepo.root, "file2.txt");
            expect(content1).toBe("original1\n");
            expect(content2).toBe("original2\n");

            assertNoTempFiles(tempRepo.root);
        });
    });
});

describe("Newline and Encoding Edge Cases", () => {
    test("edit preserves file without trailing newline", async () => {
        tempRepo = createTempRepo();
        createFileWithoutTrailingNewline(tempRepo.root, "test.txt", "hello world");

        const ctx = createContext(tempRepo.root);
        const result = await editReplaceExactTool.execute({
            path: "test.txt",
            old: "world",
            new: "universe",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
            expect(applyResult.ok).toBe(true);

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe("hello universe");
            expect(finalContent.endsWith("\n")).toBe(false);
        }
    });

    test("edit preserves file with trailing newline", async () => {
        tempRepo = createTempRepo();
        createFileWithTrailingNewline(tempRepo.root, "test.txt", "hello world");

        const ctx = createContext(tempRepo.root);
        const result = await editReplaceExactTool.execute({
            path: "test.txt",
            old: "world",
            new: "universe",
        }, ctx);

        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data) {
            const applyResult = applyEditsAtomically(tempRepo.root, result.data.applyPayload);
            expect(applyResult.ok).toBe(true);

            const finalContent = readFixtureFile(tempRepo.root, "test.txt");
            expect(finalContent).toBe("hello universe\n");
            expect(finalContent.endsWith("\n")).toBe(true);
        }
    });
});

