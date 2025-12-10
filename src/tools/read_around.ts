import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname } from "path";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";

export interface ReadAroundInput {
    path: string;
    anchor: string;
    before?: number;
    after?: number;
    occurrence?: number;
}

export interface ReadAroundOutput {
    path: string;
    totalLines: number;
    matchCount: number;
    occurrenceUsed: number;
    matchLine: number;
    startLine: number;
    endLine: number;
    content: string;
}

interface AnchorCandidate {
    line: number;
    preview: string;
}

const DEFAULT_BEFORE = 12;
const DEFAULT_AFTER = 20;

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

function findAnchorLines(lines: string[], anchor: string): number[] {
    const matches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(anchor)) {
            matches.push(i + 1);
        }
    }
    return matches;
}

function getLinePreview(lines: string[], lineNum: number): string {
    const line = lines[lineNum - 1] || "";
    return line.length > 60 ? line.slice(0, 60) + "..." : line;
}

function formatLineNumber(lineNum: number, maxLineNum: number): string {
    const width = String(maxLineNum).length;
    return String(lineNum).padStart(width, " ");
}

export const readAroundTool: ToolDefinition<ReadAroundInput, ReadAroundOutput> = {
    name: "read_around",
    description:
        "Get a context window around an anchor string with line numbers. " +
        "Returns asymmetric before/after lines (default: 12 before, 20 after). " +
        "If multiple matches exist, specify occurrence or the tool lists candidates.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            anchor: {
                type: "string",
                description: "Text to find in the file. Returns context around this line.",
            },
            before: {
                type: "number",
                description: "Lines to include before the match (default: 12)",
            },
            after: {
                type: "number",
                description: "Lines to include after the match (default: 20)",
            },
            occurrence: {
                type: "number",
                description:
                    "Which occurrence of the anchor to use (1-based). Required if anchor appears multiple times.",
            },
        },
        required: ["path", "anchor"],
    },
    async execute(args: ReadAroundInput, ctx: ToolContext): Promise<ToolResult<ReadAroundOutput>> {
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
        const totalLines = lines.length;
        const anchorLines = findAnchorLines(lines, args.anchor);

        if (anchorLines.length === 0) {
            return {
                ok: false,
                error: `Anchor text not found: "${args.anchor}". Use search_text to find the correct anchor.`,
            };
        }

        if (anchorLines.length > 1 && !args.occurrence) {
            const candidates: AnchorCandidate[] = anchorLines.slice(0, 10).map((lineNum) => ({
                line: lineNum,
                preview: getLinePreview(lines, lineNum),
            }));

            return {
                ok: false,
                error: `Multiple matches (${anchorLines.length}) found. Specify occurrence (1-${anchorLines.length}) or use a more specific anchor.`,
                data: { candidates } as unknown as ReadAroundOutput,
            };
        }

        const occurrenceIndex = (args.occurrence ?? 1) - 1;
        if (occurrenceIndex >= anchorLines.length) {
            return {
                ok: false,
                error: `Occurrence ${args.occurrence} requested but only ${anchorLines.length} match(es) found.`,
            };
        }

        const matchLine = anchorLines[occurrenceIndex];
        const before = args.before ?? DEFAULT_BEFORE;
        const after = args.after ?? DEFAULT_AFTER;

        const startLine = Math.max(1, matchLine - before);
        const endLine = Math.min(totalLines, matchLine + after);

        const windowLines = lines.slice(startLine - 1, endLine);
        const formattedLines = windowLines.map((line, idx) => {
            const lineNum = startLine + idx;
            const prefix = formatLineNumber(lineNum, endLine);
            const marker = lineNum === matchLine ? ">" : " ";
            return `${prefix}${marker}| ${line}`;
        });

        return {
            ok: true,
            data: {
                path: args.path,
                totalLines,
                matchCount: anchorLines.length,
                occurrenceUsed: occurrenceIndex + 1,
                matchLine,
                startLine,
                endLine,
                content: formattedLines.join("\n"),
            },
        };
    },
};
