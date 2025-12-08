import { existsSync, readFileSync, statSync, readdirSync } from "fs";
import { join, relative, basename } from "path";

const ALWAYS_IGNORED = [
    ".git",
    "node_modules",
    ".DS_Store",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".tox",
    ".eggs",
    "*.egg-info",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".output",
    "coverage",
    ".nyc_output",
    ".turbo",
    ".vercel",
    ".cache",
    "*.pyc",
    "*.pyo",
    "*.class",
    "*.o",
    "*.a",
    "*.so",
    "*.dylib",
];

interface IgnorePattern {
    pattern: string;
    negation: boolean;
    dirOnly: boolean;
    regex: RegExp;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern: string): RegExp {
    let regexStr = "";
    let i = 0;

    while (i < pattern.length) {
        const char = pattern[i];

        if (char === "*") {
            if (pattern[i + 1] === "*") {
                if (pattern[i + 2] === "/") {
                    regexStr += "(?:.*/)?";
                    i += 3;
                    continue;
                } else {
                    regexStr += ".*";
                    i += 2;
                    continue;
                }
            }
            regexStr += "[^/]*";
            i++;
        } else if (char === "?") {
            regexStr += "[^/]";
            i++;
        } else if (char === "[") {
            const closeIdx = pattern.indexOf("]", i);
            if (closeIdx !== -1) {
                regexStr += pattern.slice(i, closeIdx + 1);
                i = closeIdx + 1;
            } else {
                regexStr += escapeRegex(char);
                i++;
            }
        } else {
            regexStr += escapeRegex(char);
            i++;
        }
    }

    return new RegExp(`^${regexStr}$`);
}

function parsePattern(line: string): IgnorePattern | null {
    let pattern = line.trim();

    if (!pattern || pattern.startsWith("#")) return null;

    const negation = pattern.startsWith("!");
    if (negation) pattern = pattern.slice(1);

    const dirOnly = pattern.endsWith("/");
    if (dirOnly) pattern = pattern.slice(0, -1);

    if (!pattern.includes("/") || pattern.startsWith("**/")) {
        if (!pattern.startsWith("**/")) {
            pattern = `**/${pattern}`;
        }
    } else if (pattern.startsWith("/")) {
        pattern = pattern.slice(1);
    }

    return {
        pattern,
        negation,
        dirOnly,
        regex: patternToRegex(pattern),
    };
}

function parseGitignoreContent(content: string): IgnorePattern[] {
    return content
        .split("\n")
        .map(parsePattern)
        .filter((p): p is IgnorePattern => p !== null);
}

export interface IgnoreChecker {
    isIgnored(relativePath: string, isDir: boolean): boolean;
}

export function createIgnoreChecker(repoRoot: string): IgnoreChecker {
    const patterns: IgnorePattern[] = ALWAYS_IGNORED.map((p) => parsePattern(p)!).filter(Boolean);

    const gitignorePath = join(repoRoot, ".gitignore");
    if (existsSync(gitignorePath)) {
        try {
            const content = readFileSync(gitignorePath, "utf-8");
            patterns.push(...parseGitignoreContent(content));
        } catch {
            // Gitignore read failed, continue with default patterns
        }
    }

    return {
        isIgnored(relativePath: string, isDir: boolean): boolean {
            const name = basename(relativePath);
            if (name.startsWith(".") && name !== ".gitignore" && name !== ".north") {
                if (ALWAYS_IGNORED.includes(name)) return true;
            }

            let ignored = false;

            for (const pat of patterns) {
                if (pat.dirOnly && !isDir) continue;

                const matches = pat.regex.test(relativePath) || pat.regex.test(name);
                if (matches) {
                    ignored = !pat.negation;
                }
            }

            return ignored;
        },
    };
}

export interface WalkOptions {
    maxDepth?: number;
    maxFiles?: number;
}

export interface WalkEntry {
    path: string;
    relativePath: string;
    isDir: boolean;
    size: number;
}

export function walkDirectory(
    repoRoot: string,
    checker: IgnoreChecker,
    options: WalkOptions = {}
): WalkEntry[] {
    const { maxDepth = 10, maxFiles = 10000 } = options;
    const results: WalkEntry[] = [];

    function walk(dir: string, depth: number): boolean {
        if (depth > maxDepth || results.length >= maxFiles) return false;

        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return true;
        }

        for (const name of entries) {
            if (results.length >= maxFiles) return false;

            const fullPath = join(dir, name);
            const relPath = relative(repoRoot, fullPath);

            let stat;
            try {
                stat = statSync(fullPath);
            } catch {
                continue;
            }

            const isDir = stat.isDirectory();
            if (checker.isIgnored(relPath, isDir)) continue;

            results.push({
                path: fullPath,
                relativePath: relPath,
                isDir,
                size: isDir ? 0 : stat.size,
            });

            if (isDir) {
                if (!walk(fullPath, depth + 1)) return false;
            }
        }

        return true;
    }

    walk(repoRoot, 0);
    return results;
}

export function listRootEntries(repoRoot: string, checker: IgnoreChecker): WalkEntry[] {
    const results: WalkEntry[] = [];

    let entries: string[];
    try {
        entries = readdirSync(repoRoot);
    } catch {
        return results;
    }

    for (const name of entries) {
        const fullPath = join(repoRoot, name);
        const relPath = name;

        let stat;
        try {
            stat = statSync(fullPath);
        } catch {
            continue;
        }

        const isDir = stat.isDirectory();
        if (checker.isIgnored(relPath, isDir)) continue;

        results.push({
            path: fullPath,
            relativePath: relPath,
            isDir,
            size: isDir ? 0 : stat.size,
        });
    }

    return results.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.relativePath.localeCompare(b.relativePath);
    });
}
