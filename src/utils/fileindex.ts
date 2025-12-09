import { walkDirectory, createIgnoreChecker, type WalkEntry } from "./ignore";
import { basename } from "path";

const fileIndexCache = new Map<string, string[]>();

export function getFileIndex(repoRoot: string): string[] {
    const cached = fileIndexCache.get(repoRoot);
    if (cached) return cached;

    const checker = createIgnoreChecker(repoRoot);
    const entries = walkDirectory(repoRoot, checker, { maxFiles: 5000 });

    const files = entries
        .filter((e: WalkEntry) => !e.isDir)
        .map((e: WalkEntry) => e.relativePath)
        .sort();

    fileIndexCache.set(repoRoot, files);
    return files;
}

export function clearFileIndexCache(repoRoot?: string): void {
    if (repoRoot) {
        fileIndexCache.delete(repoRoot);
    } else {
        fileIndexCache.clear();
    }
}

function fuzzyMatch(query: string, target: string): boolean {
    const lowerQuery = query.toLowerCase();
    const lowerTarget = target.toLowerCase();

    let qi = 0;
    for (let ti = 0; ti < lowerTarget.length && qi < lowerQuery.length; ti++) {
        if (lowerTarget[ti] === lowerQuery[qi]) {
            qi++;
        }
    }
    return qi === lowerQuery.length;
}

function scoreMatch(query: string, filePath: string): number {
    const lowerQuery = query.toLowerCase();
    const lowerPath = filePath.toLowerCase();
    const fileName = basename(filePath).toLowerCase();

    if (fileName === lowerQuery) return 1000;
    if (fileName.startsWith(lowerQuery)) return 900;
    if (lowerPath.endsWith("/" + lowerQuery) || lowerPath === lowerQuery) return 850;

    if (fileName.includes(lowerQuery)) return 700;

    const pathParts = lowerPath.split("/");
    for (const part of pathParts) {
        if (part.startsWith(lowerQuery)) return 600;
    }

    let consecutiveBonus = 0;
    let qi = 0;
    let lastMatchIndex = -2;
    for (let ti = 0; ti < lowerPath.length && qi < lowerQuery.length; ti++) {
        if (lowerPath[ti] === lowerQuery[qi]) {
            if (ti === lastMatchIndex + 1) {
                consecutiveBonus += 10;
            }
            lastMatchIndex = ti;
            qi++;
        }
    }

    const fileNameBonus = fileName.includes(lowerQuery.charAt(0)) ? 50 : 0;

    return 100 + consecutiveBonus + fileNameBonus - filePath.length * 0.1;
}

export function fuzzyMatchFiles(query: string, files: string[], limit = 20): string[] {
    if (!query) {
        return files.slice(0, limit);
    }

    const matches = files
        .filter((f) => fuzzyMatch(query, f))
        .map((f) => ({ path: f, score: scoreMatch(query, f) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((m) => m.path);

    return matches;
}

