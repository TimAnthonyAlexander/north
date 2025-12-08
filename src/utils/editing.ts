import {
    existsSync,
    readFileSync,
    writeFileSync,
    renameSync,
    mkdirSync,
    copyFileSync,
    unlinkSync,
} from "fs";
import { join, isAbsolute, normalize, dirname } from "path";
import { tmpdir } from "os";
import type { EditOperation, FileDiff } from "../tools/types";

export function resolveSafePath(repoRoot: string, filePath: string): string | null {
    const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
    const normalized = normalize(resolved);
    const normalizedRoot = normalize(repoRoot);

    if (!normalized.startsWith(normalizedRoot)) {
        return null;
    }

    return normalized;
}

export function readFileContent(
    repoRoot: string,
    filePath: string
): { ok: true; content: string } | { ok: false; error: string } {
    const resolved = resolveSafePath(repoRoot, filePath);
    if (!resolved) {
        return { ok: false, error: `Path escapes repository root: ${filePath}` };
    }

    if (!existsSync(resolved)) {
        return { ok: false, error: `File not found: ${filePath}` };
    }

    try {
        const content = readFileSync(resolved, "utf-8");
        return { ok: true, content };
    } catch {
        return { ok: false, error: `Cannot read file: ${filePath}` };
    }
}

export function preserveTrailingNewline(original: string, modified: string): string {
    const originalEndsWithNewline = original.endsWith("\n");
    const modifiedEndsWithNewline = modified.endsWith("\n");

    if (originalEndsWithNewline && !modifiedEndsWithNewline) {
        return modified + "\n";
    }
    if (!originalEndsWithNewline && modifiedEndsWithNewline) {
        return modified.slice(0, -1);
    }
    return modified;
}

export function computeUnifiedDiff(original: string, modified: string, path: string): FileDiff {
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");

    const diffLines: string[] = [];
    diffLines.push(`--- a/${path}`);
    diffLines.push(`+++ b/${path}`);

    let linesAdded = 0;
    let linesRemoved = 0;

    let hunkStart = -1;
    let hunkOriginalStart = 0;
    let hunkModifiedStart = 0;
    let hunkLines: string[] = [];
    let hunkOriginalCount = 0;
    let hunkModifiedCount = 0;

    function flushHunk() {
        if (hunkLines.length > 0) {
            diffLines.push(
                `@@ -${hunkOriginalStart + 1},${hunkOriginalCount} +${hunkModifiedStart + 1},${hunkModifiedCount} @@`
            );
            diffLines.push(...hunkLines);
            hunkLines = [];
        }
    }

    let i = 0;
    let j = 0;

    while (i < originalLines.length || j < modifiedLines.length) {
        const origLine = i < originalLines.length ? originalLines[i] : undefined;
        const modLine = j < modifiedLines.length ? modifiedLines[j] : undefined;

        if (origLine === modLine) {
            if (hunkStart !== -1) {
                hunkLines.push(` ${origLine ?? ""}`);
                hunkOriginalCount++;
                hunkModifiedCount++;

                const contextAfter = hunkLines.filter((l) => l.startsWith(" ")).length;
                const hasChanges = hunkLines.some((l) => l.startsWith("+") || l.startsWith("-"));
                if (hasChanges && contextAfter >= 3 && i < originalLines.length - 1) {
                    flushHunk();
                    hunkStart = -1;
                }
            }
            i++;
            j++;
        } else {
            if (hunkStart === -1) {
                hunkStart = i;
                hunkOriginalStart = Math.max(0, i - 3);
                hunkModifiedStart = Math.max(0, j - 3);
                hunkOriginalCount = 0;
                hunkModifiedCount = 0;

                for (let ctx = Math.max(0, i - 3); ctx < i; ctx++) {
                    hunkLines.push(` ${originalLines[ctx]}`);
                    hunkOriginalCount++;
                    hunkModifiedCount++;
                }
            }

            if (
                origLine !== undefined &&
                (modLine === undefined || !modifiedLines.slice(j).includes(origLine))
            ) {
                hunkLines.push(`-${origLine}`);
                hunkOriginalCount++;
                linesRemoved++;
                i++;
            } else if (
                modLine !== undefined &&
                (origLine === undefined || !originalLines.slice(i).includes(modLine))
            ) {
                hunkLines.push(`+${modLine}`);
                hunkModifiedCount++;
                linesAdded++;
                j++;
            } else {
                hunkLines.push(`-${origLine}`);
                hunkOriginalCount++;
                linesRemoved++;
                hunkLines.push(`+${modLine}`);
                hunkModifiedCount++;
                linesAdded++;
                i++;
                j++;
            }
        }
    }

    flushHunk();

    return {
        path,
        diff: diffLines.join("\n"),
        linesAdded,
        linesRemoved,
    };
}

export function computeCreateFileDiff(content: string, path: string): FileDiff {
    const lines = content.split("\n");
    const diffLines: string[] = [];
    diffLines.push(`--- /dev/null`);
    diffLines.push(`+++ b/${path}`);
    diffLines.push(`@@ -0,0 +1,${lines.length} @@`);

    for (const line of lines) {
        diffLines.push(`+${line}`);
    }

    return {
        path,
        diff: diffLines.join("\n"),
        linesAdded: lines.length,
        linesRemoved: 0,
    };
}

export interface ApplyResult {
    ok: boolean;
    error?: string;
}

export function applyEditsAtomically(repoRoot: string, operations: EditOperation[]): ApplyResult {
    const tempFiles: Array<{ tempPath: string; finalPath: string }> = [];

    try {
        for (const op of operations) {
            const finalPath = resolveSafePath(repoRoot, op.path);
            if (!finalPath) {
                return { ok: false, error: `Path escapes repository root: ${op.path}` };
            }

            const dir = dirname(finalPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            const tempPath = join(
                tmpdir(),
                `north-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
            );
            writeFileSync(tempPath, op.content, "utf-8");
            tempFiles.push({ tempPath, finalPath });
        }

        for (const { tempPath, finalPath } of tempFiles) {
            try {
                renameSync(tempPath, finalPath);
            } catch (err: any) {
                if (err.code === "EXDEV") {
                    copyFileSync(tempPath, finalPath);
                    unlinkSync(tempPath);
                } else {
                    throw err;
                }
            }
        }

        return { ok: true };
    } catch (err) {
        for (const { tempPath } of tempFiles) {
            try {
                if (existsSync(tempPath)) {
                    unlinkSync(tempPath);
                }
            } catch {
                // Cleanup failed, ignore
            }
        }
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
