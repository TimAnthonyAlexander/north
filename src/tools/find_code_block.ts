import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";

export interface FindCodeBlockInput {
    path: string;
    query: string;
    kind?: "function" | "class" | "method" | "block" | "any";
}

export interface CodeBlockMatch {
    startLine: number;
    endLine: number;
    snippet: string;
    kind: string;
    name?: string;
}

export interface FindCodeBlockOutput {
    path: string;
    found: boolean;
    matches: CodeBlockMatch[];
    totalMatches: number;
}

function resolvePath(repoRoot: string, filePath: string): string | null {
    const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
    const normalized = normalize(resolved);
    const normalizedRoot = normalize(repoRoot);

    if (!normalized.startsWith(normalizedRoot)) {
        return null;
    }

    try {
        const realPath = realpathSync(normalized);
        const realRoot = realpathSync(normalizedRoot);
        if (!realPath.startsWith(realRoot)) {
            return null;
        }
        return realPath;
    } catch {
        const parentDir = dirname(normalized);
        try {
            const realParent = realpathSync(parentDir);
            const realRoot = realpathSync(normalizedRoot);
            if (!realParent.startsWith(realRoot)) {
                return null;
            }
        } catch {
            return null;
        }
        return normalized;
    }
}

function detectLanguage(filePath: string): string | null {
    const ext = extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".py": "python",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
    };
    return langMap[ext] || null;
}

interface BlockBoundary {
    startLine: number;
    endLine: number;
    kind: string;
    name?: string;
}

function findBlockBoundaries(lines: string[], language: string | null): BlockBoundary[] {
    const blocks: BlockBoundary[] = [];

    if (language === "typescript" || language === "javascript") {
        return findJsTsBlocks(lines);
    } else if (language === "python") {
        return findPythonBlocks(lines);
    } else {
        return findGenericBlocks(lines);
    }
}

function findJsTsBlocks(lines: string[]): BlockBoundary[] {
    const blocks: BlockBoundary[] = [];
    const functionPattern =
        /^(\s*)(export\s+)?(async\s+)?(function\s+(\w+)|const\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>|(\w+)\s*\([^)]*\)\s*{)/;
    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const methodPattern = /^(\s*)(public|private|protected)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const endLine = findBlockEnd(lines, i);
            blocks.push({
                startLine: i + 1,
                endLine,
                kind: "class",
                name: classMatch[4],
            });
            continue;
        }

        const funcMatch = line.match(functionPattern);
        if (funcMatch) {
            const endLine = findBlockEnd(lines, i);
            const name = funcMatch[5] || funcMatch[6] || funcMatch[9];
            blocks.push({
                startLine: i + 1,
                endLine,
                kind: "function",
                name,
            });
            continue;
        }

        const methodMatch = line.match(methodPattern);
        if (
            methodMatch &&
            !line.includes("if") &&
            !line.includes("for") &&
            !line.includes("while")
        ) {
            const endLine = findBlockEnd(lines, i);
            blocks.push({
                startLine: i + 1,
                endLine,
                kind: "method",
                name: methodMatch[4],
            });
        }
    }

    return blocks;
}

function findPythonBlocks(lines: string[]): BlockBoundary[] {
    const blocks: BlockBoundary[] = [];
    const funcPattern = /^(\s*)(async\s+)?def\s+(\w+)/;
    const classPattern = /^(\s*)class\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const indent = classMatch[1].length;
            const endLine = findPythonBlockEnd(lines, i, indent);
            blocks.push({
                startLine: i + 1,
                endLine,
                kind: "class",
                name: classMatch[2],
            });
            continue;
        }

        const funcMatch = line.match(funcPattern);
        if (funcMatch) {
            const indent = funcMatch[1].length;
            const endLine = findPythonBlockEnd(lines, i, indent);
            blocks.push({
                startLine: i + 1,
                endLine,
                kind: "function",
                name: funcMatch[3],
            });
        }
    }

    return blocks;
}

function findGenericBlocks(lines: string[]): BlockBoundary[] {
    const blocks: BlockBoundary[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("{") && !line.trim().startsWith("//") && !line.trim().startsWith("/*")) {
            const endLine = findBlockEnd(lines, i);
            if (endLine > i + 1) {
                blocks.push({
                    startLine: i + 1,
                    endLine,
                    kind: "block",
                });
            }
        }
    }

    return blocks;
}

function findBlockEnd(lines: string[], startIndex: number): number {
    let braceDepth = 0;
    let foundOpen = false;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
            if (char === "{") {
                braceDepth++;
                foundOpen = true;
            } else if (char === "}") {
                braceDepth--;
                if (foundOpen && braceDepth === 0) {
                    return i + 1;
                }
            }
        }
    }

    return lines.length;
}

function findPythonBlockEnd(lines: string[], startIndex: number, baseIndent: number): number {
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;

        const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (currentIndent <= baseIndent && line.trim() !== "") {
            return i;
        }
    }
    return lines.length;
}

function lineContainsQuery(line: string, query: string, isRegex: boolean): boolean {
    if (isRegex) {
        try {
            const regex = new RegExp(query);
            return regex.test(line);
        } catch {
            return line.includes(query);
        }
    }
    return line.includes(query);
}

export const findCodeBlockTool: ToolDefinition<FindCodeBlockInput, FindCodeBlockOutput> = {
    name: "find_code_block",
    description:
        "Find code blocks (functions, classes, methods) that contain specific text. " +
        "Returns the line range and a snippet of matching blocks. " +
        "Use this to quickly locate where to make edits without reading the entire file.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            query: {
                type: "string",
                description:
                    "Text to search for within code blocks. Supports simple text or regex.",
            },
            kind: {
                type: "string",
                description:
                    "Filter by block type: 'function', 'class', 'method', 'block', or 'any' (default: 'any')",
            },
        },
        required: ["path", "query"],
    },
    async execute(
        args: FindCodeBlockInput,
        ctx: ToolContext
    ): Promise<ToolResult<FindCodeBlockOutput>> {
        const resolvedPath = resolvePath(ctx.repoRoot, args.path);
        if (!resolvedPath) {
            return { ok: false, error: `Path escapes repository root: ${args.path}` };
        }

        if (!existsSync(resolvedPath)) {
            return { ok: false, error: `File not found: ${args.path}` };
        }

        let stat;
        try {
            stat = statSync(resolvedPath);
        } catch {
            return { ok: false, error: `Cannot access file: ${args.path}` };
        }

        if (stat.isDirectory()) {
            return { ok: false, error: `Path is a directory, not a file: ${args.path}` };
        }

        let content: string;
        try {
            content = readFileSync(resolvedPath, "utf-8");
        } catch {
            return { ok: false, error: `Cannot read file: ${args.path}` };
        }

        const lines = content.split("\n");
        const language = detectLanguage(args.path);
        const blocks = findBlockBoundaries(lines, language);
        const kindFilter = args.kind || "any";

        const isRegex = args.query.startsWith("/") && args.query.endsWith("/");
        const query = isRegex ? args.query.slice(1, -1) : args.query;

        const matchingBlocks: CodeBlockMatch[] = [];

        for (const block of blocks) {
            if (kindFilter !== "any" && block.kind !== kindFilter) {
                continue;
            }

            const blockLines = lines.slice(block.startLine - 1, block.endLine);
            const containsQuery = blockLines.some((line) =>
                lineContainsQuery(line, query, isRegex)
            );

            if (containsQuery) {
                const snippetLines = blockLines.slice(0, 5);
                const snippet =
                    snippetLines.join("\n") +
                    (blockLines.length > 5 ? `\n... (${blockLines.length - 5} more lines)` : "");

                matchingBlocks.push({
                    startLine: block.startLine,
                    endLine: block.endLine,
                    snippet,
                    kind: block.kind,
                    name: block.name,
                });
            }
        }

        if (matchingBlocks.length === 0) {
            const lineMatches: number[] = [];
            for (let i = 0; i < lines.length; i++) {
                if (lineContainsQuery(lines[i], query, isRegex)) {
                    lineMatches.push(i + 1);
                }
            }

            if (lineMatches.length > 0) {
                return {
                    ok: true,
                    data: {
                        path: args.path,
                        found: false,
                        matches: [],
                        totalMatches: 0,
                    },
                };
            }

            return {
                ok: false,
                error: `No matches found for "${args.query}" in ${args.path}. The text may not exist in this file.`,
            };
        }

        const limitedMatches = matchingBlocks.slice(0, 10);

        return {
            ok: true,
            data: {
                path: args.path,
                found: true,
                matches: limitedMatches,
                totalMatches: matchingBlocks.length,
            },
        };
    },
};
