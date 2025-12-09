import { spawnSync } from "child_process";
import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, relative, isAbsolute, normalize, dirname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    SearchTextInput,
    SearchTextOutput,
    SearchMatch,
} from "./types";
import { createIgnoreChecker, walkDirectory } from "../utils/ignore";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const PREVIEW_LENGTH = 120;

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

function searchInFile(
    repoRoot: string,
    filePath: string,
    query: string,
    isRegex: boolean,
    lineRange: { start: number; end: number } | undefined,
    limit: number
): SearchMatch[] {
    const matches: SearchMatch[] = [];

    let content: string;
    try {
        content = readFileSync(filePath, "utf-8");
    } catch {
        return matches;
    }

    const lines = content.split("\n");
    const startLine = lineRange ? Math.max(1, lineRange.start) : 1;
    const endLine = lineRange ? Math.min(lines.length, lineRange.end) : lines.length;

    const regex = isRegex ? new RegExp(query, "gm") : null;

    for (let i = startLine - 1; i < endLine; i++) {
        if (matches.length >= limit) break;

        const line = lines[i];
        let matchIndex = -1;

        if (regex) {
            regex.lastIndex = 0;
            const match = regex.exec(line);
            if (match) {
                matchIndex = match.index;
            }
        } else {
            matchIndex = line.indexOf(query);
        }

        if (matchIndex !== -1) {
            let preview = line.trim();
            if (preview.length > PREVIEW_LENGTH) {
                preview = preview.slice(0, PREVIEW_LENGTH) + "...";
            }

            matches.push({
                path: relative(repoRoot, filePath),
                line: i + 1,
                column: matchIndex + 1,
                preview,
            });
        }
    }

    return matches;
}

function hasRipgrep(): boolean {
    const result = spawnSync("rg", ["--version"], { encoding: "utf-8" });
    return result.status === 0;
}

function searchWithRipgrep(
    repoRoot: string,
    query: string,
    searchPath: string,
    isRegex: boolean,
    limit: number
): SearchMatch[] {
    const args = [
        "--json",
        "--line-number",
        "--column",
        "--max-count",
        String(limit * 2),
        "--max-filesize",
        "1M",
    ];

    if (!isRegex) {
        args.push("--fixed-strings");
    }

    args.push(query, searchPath);

    const result = spawnSync("rg", args, {
        cwd: repoRoot,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status !== 0 && result.status !== 1) {
        return [];
    }

    const matches: SearchMatch[] = [];
    const lines = (result.stdout || "").split("\n").filter(Boolean);

    for (const line of lines) {
        if (matches.length >= limit) break;

        try {
            const entry = JSON.parse(line);
            if (entry.type === "match") {
                const filePath = relative(repoRoot, entry.data.path.text);
                const lineNum = entry.data.line_number;
                const column = entry.data.submatches?.[0]?.start ?? 0;
                let preview = entry.data.lines.text.trim();

                if (preview.length > PREVIEW_LENGTH) {
                    preview = preview.slice(0, PREVIEW_LENGTH) + "...";
                }

                matches.push({
                    path: filePath,
                    line: lineNum,
                    column: column + 1,
                    preview,
                });
            }
        } catch {
            // JSON parsing failed for ripgrep output line, skip
        }
    }

    return matches;
}

function searchWithFallback(
    repoRoot: string,
    query: string,
    searchPath: string,
    isRegex: boolean,
    limit: number
): SearchMatch[] {
    const checker = createIgnoreChecker(repoRoot);
    const entries = walkDirectory(repoRoot, checker, { maxFiles: 5000, maxDepth: 8 });

    const searchDir = searchPath === "." ? repoRoot : join(repoRoot, searchPath);
    const filesToSearch = entries.filter((e) => {
        if (e.isDir) return false;
        if (e.size > 500_000) return false;
        return e.path.startsWith(searchDir);
    });

    const matches: SearchMatch[] = [];
    const regex = isRegex ? new RegExp(query, "gm") : null;

    for (const entry of filesToSearch) {
        if (matches.length >= limit) break;

        let content: string;
        try {
            content = readFileSync(entry.path, "utf-8");
        } catch {
            continue;
        }

        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
            if (matches.length >= limit) break;

            const line = lines[i];
            let matchIndex = -1;

            if (regex) {
                regex.lastIndex = 0;
                const match = regex.exec(line);
                if (match) {
                    matchIndex = match.index;
                }
            } else {
                matchIndex = line.indexOf(query);
            }

            if (matchIndex !== -1) {
                let preview = line.trim();
                if (preview.length > PREVIEW_LENGTH) {
                    preview = preview.slice(0, PREVIEW_LENGTH) + "...";
                }

                matches.push({
                    path: entry.relativePath,
                    line: i + 1,
                    column: matchIndex + 1,
                    preview,
                });
            }
        }
    }

    return matches;
}

export const searchTextTool: ToolDefinition<SearchTextInput, SearchTextOutput> = {
    name: "search_text",
    description:
        "Search for text or patterns in the codebase. Similar to ripgrep. Returns matching lines with file path, line number, and preview. Can search entire repo, a subdirectory, or within a specific file and line range. For TypeScript: search for 'export function' or 'export class'. For Python: search for 'def ' or 'class '.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The text or regex pattern to search for",
            },
            path: {
                type: "string",
                description:
                    "Optional subdirectory to search in (relative to repo root). Defaults to entire repo. Cannot be used with 'file'.",
            },
            file: {
                type: "string",
                description:
                    "Optional specific file to search in (relative to repo root or absolute). Use this to search within a single file. Cannot be used with 'path'.",
            },
            lineRange: {
                type: "object",
                description:
                    "Optional line range to search within (requires 'file'). Only lines within this range will be searched.",
                properties: {
                    start: { type: "number", description: "Start line (1-indexed, inclusive)" },
                    end: { type: "number", description: "End line (1-indexed, inclusive)" },
                },
            },
            regex: {
                type: "boolean",
                description:
                    "If true, treat query as a regex pattern. Defaults to false (literal search).",
            },
            limit: {
                type: "number",
                description: `Maximum number of matches to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
            },
        },
        required: ["query"],
    },
    async execute(args: SearchTextInput, ctx: ToolContext): Promise<ToolResult<SearchTextOutput>> {
        if (!args.query) {
            return { ok: false, error: "Query is required" };
        }

        if (args.path && args.file) {
            return { ok: false, error: "Cannot specify both 'path' and 'file'" };
        }

        if (args.lineRange && !args.file) {
            return { ok: false, error: "'lineRange' requires 'file' to be specified" };
        }

        const isRegex = args.regex ?? false;
        const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

        if (args.file) {
            const resolvedPath = resolvePath(ctx.repoRoot, args.file);
            if (!resolvedPath) {
                return { ok: false, error: `Path escapes repository root: ${args.file}` };
            }

            if (!existsSync(resolvedPath)) {
                return { ok: false, error: `File not found: ${args.file}` };
            }

            const stat = statSync(resolvedPath);
            if (stat.isDirectory()) {
                return { ok: false, error: `Path is a directory, not a file: ${args.file}` };
            }

            const matches = searchInFile(
                ctx.repoRoot,
                resolvedPath,
                args.query,
                isRegex,
                args.lineRange,
                limit
            );

            return {
                ok: true,
                data: {
                    matches,
                    truncated: matches.length >= limit,
                },
            };
        }

        const searchPath = args.path || ".";
        const fullSearchPath = searchPath === "." ? ctx.repoRoot : join(ctx.repoRoot, searchPath);

        if (!existsSync(fullSearchPath)) {
            return { ok: false, error: `Path not found: ${searchPath}` };
        }

        const stat = statSync(fullSearchPath);
        if (!stat.isDirectory()) {
            return { ok: false, error: `Path is not a directory: ${searchPath}` };
        }

        let matches: SearchMatch[];

        if (hasRipgrep()) {
            matches = searchWithRipgrep(ctx.repoRoot, args.query, fullSearchPath, isRegex, limit);
        } else {
            matches = searchWithFallback(ctx.repoRoot, args.query, searchPath, isRegex, limit);
        }

        return {
            ok: true,
            data: {
                matches,
                truncated: matches.length >= limit,
            },
        };
    },
};
