import { existsSync, readFileSync, statSync } from "fs";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    ReadFileInput,
    ReadFileOutput,
} from "./types";
import { resolveSafePath } from "../utils/editing";

const MAX_FILE_SIZE = 100_000;
const MAX_LINES = 500;
const HEAD_TAIL_LINES = 10;

export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
    name: "read_file",
    description:
        "Read file content. Can read the entire file or a specific line range. " +
        "Use 'includeHeadTail' to always include first and last 10 lines for orientation. " +
        "For large files (>200 lines), prefer using get_file_symbols or get_file_outline first, then read specific ranges. " +
        "To find text and see context around it, use read_around instead.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            range: {
                type: "object",
                description:
                    "Optional line range (1-indexed). If not provided, reads the entire file.",
                properties: {
                    start: { type: "number", description: "Start line (1-indexed, inclusive)" },
                    end: { type: "number", description: "End line (1-indexed, inclusive)" },
                },
            },
            includeHeadTail: {
                type: "boolean",
                description:
                    "Always include first 10 and last 10 lines of the file for orientation, even when reading a range.",
            },
        },
        required: ["path"],
    },
    async execute(args: ReadFileInput, ctx: ToolContext): Promise<ToolResult<ReadFileOutput>> {
        const resolvedPath = resolveSafePath(ctx.repoRoot, args.path);
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
        let startLine = 1;
        let endLine = totalLines;
        let truncated = false;

        if (args.range) {
            if (args.range.end <= 0) {
                return {
                    ok: false,
                    error: `Invalid range: end line must be positive (got ${args.range.end})`,
                };
            }

            if (args.range.start > args.range.end) {
                return {
                    ok: false,
                    error: `Invalid range: start (${args.range.start}) cannot be greater than end (${args.range.end})`,
                };
            }

            startLine = Math.max(1, args.range.start);
            endLine = Math.min(totalLines, args.range.end);

            if (startLine > totalLines) {
                return {
                    ok: false,
                    error: `Start line ${startLine} exceeds file length (${totalLines} lines)`,
                };
            }
        }

        if (args.includeHeadTail && totalLines > HEAD_TAIL_LINES * 2) {
            if (args.range) {
                const headEnd = HEAD_TAIL_LINES;
                const tailStart = totalLines - HEAD_TAIL_LINES + 1;
                const rangeStart = startLine;
                const rangeEnd = endLine;

                const sections: string[] = [];

                if (headEnd < rangeStart) {
                    sections.push(`[Lines 1-${headEnd} of ${totalLines}]`);
                    sections.push(lines.slice(0, headEnd).join("\n"));
                    sections.push("");
                    const omitted = rangeStart - headEnd - 1;
                    if (omitted > 0) {
                        sections.push(`[... ${omitted} lines omitted ...]`);
                        sections.push("");
                    }
                    sections.push(`[Lines ${rangeStart}-${rangeEnd}]`);
                    sections.push(lines.slice(rangeStart - 1, rangeEnd).join("\n"));
                } else {
                    const actualStart = Math.min(1, rangeStart);
                    sections.push(`[Lines ${actualStart}-${rangeEnd}]`);
                    sections.push(lines.slice(actualStart - 1, rangeEnd).join("\n"));
                }

                if (tailStart > rangeEnd) {
                    sections.push("");
                    const omitted = tailStart - rangeEnd - 1;
                    if (omitted > 0) {
                        sections.push(`[... ${omitted} lines omitted ...]`);
                        sections.push("");
                    }
                    sections.push(`[Lines ${tailStart}-${totalLines}]`);
                    sections.push(lines.slice(tailStart - 1).join("\n"));
                }

                return {
                    ok: true,
                    data: {
                        path: args.path,
                        content: sections.join("\n"),
                        startLine: 1,
                        endLine: totalLines,
                        truncated: false,
                        totalLines,
                    },
                };
            }

            if (totalLines > MAX_LINES) {
                const headLines = lines.slice(0, HEAD_TAIL_LINES);
                const tailLines = lines.slice(-HEAD_TAIL_LINES);
                const omitted = totalLines - HEAD_TAIL_LINES * 2;

                const resultContent = [
                    `[Lines 1-${HEAD_TAIL_LINES} of ${totalLines}]`,
                    ...headLines,
                    "",
                    `[... ${omitted} lines omitted ...]`,
                    "",
                    `[Lines ${totalLines - HEAD_TAIL_LINES + 1}-${totalLines}]`,
                    ...tailLines,
                ].join("\n");

                return {
                    ok: true,
                    data: {
                        path: args.path,
                        content: resultContent,
                        startLine: 1,
                        endLine: totalLines,
                        truncated: true,
                        totalLines,
                    },
                };
            }
        }

        let selectedLines = lines.slice(startLine - 1, endLine);

        if (selectedLines.length > MAX_LINES) {
            selectedLines = selectedLines.slice(0, MAX_LINES);
            endLine = startLine + MAX_LINES - 1;
            truncated = true;
        }

        let resultContent = selectedLines.join("\n");
        if (resultContent.length > MAX_FILE_SIZE) {
            resultContent = resultContent.slice(0, MAX_FILE_SIZE);
            truncated = true;
        }

        if (truncated) {
            resultContent += `\n\n[... content truncated at line ${endLine}, file has ${totalLines} lines ...]`;
        }

        return {
            ok: true,
            data: {
                path: args.path,
                content: resultContent,
                startLine,
                endLine,
                truncated,
                totalLines,
            },
        };
    },
};
