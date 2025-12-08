import { spawnSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
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
        "Search for text or patterns in the codebase. Similar to ripgrep. Returns matching lines with file path, line number, and preview.",
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
                    "Optional subdirectory to search in (relative to repo root). Defaults to entire repo.",
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

        const searchPath = args.path || ".";
        const isRegex = args.regex ?? false;
        const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

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
