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
const DEFAULT_WINDOW_LINES = 20;
const HEAD_TAIL_LINES = 10;

function findMatchLine(lines: string[], searchText: string): number | null {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchText)) {
            return i + 1;
        }
    }
    return null;
}

interface ContentSection {
    startLine: number;
    endLine: number;
    label?: string;
    lines: string[];
}

function buildWindowedContent(
    lines: string[],
    matchLine: number,
    windowLines: number,
    includeHeadTail: boolean
): { content: string; startLine: number; endLine: number } {
    const totalLines = lines.length;
    const sections: ContentSection[] = [];

    const windowStart = Math.max(1, matchLine - windowLines);
    const windowEnd = Math.min(totalLines, matchLine + windowLines);

    if (includeHeadTail) {
        const headEnd = Math.min(HEAD_TAIL_LINES, totalLines);
        const tailStart = Math.max(1, totalLines - HEAD_TAIL_LINES + 1);

        if (headEnd < windowStart - 1) {
            sections.push({
                startLine: 1,
                endLine: headEnd,
                label: `[Lines 1-${headEnd} of ${totalLines}]`,
                lines: lines.slice(0, headEnd),
            });
        }

        const actualWindowStart = headEnd >= windowStart ? 1 : windowStart;
        const actualWindowEnd = tailStart <= windowEnd ? totalLines : windowEnd;

        if (actualWindowStart <= actualWindowEnd) {
            const omittedBefore =
                actualWindowStart > headEnd + 1 ? actualWindowStart - headEnd - 1 : 0;
            sections.push({
                startLine: actualWindowStart,
                endLine: actualWindowEnd,
                label:
                    omittedBefore > 0
                        ? `[... ${omittedBefore} lines omitted ...]\n\n[Lines ${actualWindowStart}-${actualWindowEnd} around match at line ${matchLine}]`
                        : `[Lines ${actualWindowStart}-${actualWindowEnd} around match at line ${matchLine}]`,
                lines: lines.slice(actualWindowStart - 1, actualWindowEnd),
            });
        }

        if (tailStart > windowEnd + 1) {
            const omittedAfter = tailStart - actualWindowEnd - 1;
            sections.push({
                startLine: tailStart,
                endLine: totalLines,
                label: `[... ${omittedAfter} lines omitted ...]\n\n[Lines ${tailStart}-${totalLines}]`,
                lines: lines.slice(tailStart - 1),
            });
        }
    } else {
        sections.push({
            startLine: windowStart,
            endLine: windowEnd,
            label: `[Lines ${windowStart}-${windowEnd} of ${totalLines}, match at line ${matchLine}]`,
            lines: lines.slice(windowStart - 1, windowEnd),
        });
    }

    const contentParts: string[] = [];
    for (const section of sections) {
        if (section.label) {
            contentParts.push(section.label);
        }
        contentParts.push(section.lines.join("\n"));
    }

    const firstSection = sections[0];
    const lastSection = sections[sections.length - 1];

    return {
        content: contentParts.join("\n\n"),
        startLine: firstSection?.startLine ?? 1,
        endLine: lastSection?.endLine ?? totalLines,
    };
}

export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
    name: "read_file",
    description:
        "Read file content. Can read the entire file, a specific line range, or a window around a text match. " +
        "Use 'aroundMatch' to find text and return surrounding context. " +
        "Use 'includeHeadTail' to always include first and last 10 lines for orientation. " +
        "For large files (>200 lines), prefer using get_file_symbols or get_file_outline first, then read specific ranges.",
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
            includeContext: {
                type: "string",
                description:
                    "When reading a specific range, 'imports' includes file imports at top. 'full' includes the entire surrounding function/class.",
            },
            aroundMatch: {
                type: "string",
                description:
                    "Find this text and return a window of lines around it. Takes precedence over 'range' if both provided.",
            },
            windowLines: {
                type: "number",
                description:
                    "Number of lines to show before and after a match (default: 20). Only used with 'aroundMatch'.",
            },
            includeHeadTail: {
                type: "boolean",
                description:
                    "Always include first 10 and last 10 lines of the file for orientation. Useful with 'aroundMatch' to see file boundaries.",
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
        let matchLine: number | undefined;

        if (args.aroundMatch) {
            const found = findMatchLine(lines, args.aroundMatch);
            if (!found) {
                return {
                    ok: false,
                    error: `Text not found: "${args.aroundMatch}". Use search_text to find the correct text.`,
                };
            }
            matchLine = found;
            const windowSize = args.windowLines ?? DEFAULT_WINDOW_LINES;
            const windowed = buildWindowedContent(
                lines,
                matchLine,
                windowSize,
                args.includeHeadTail ?? false
            );

            return {
                ok: true,
                data: {
                    path: args.path,
                    content: windowed.content,
                    startLine: windowed.startLine,
                    endLine: windowed.endLine,
                    truncated: false,
                    totalLines,
                    matchLine,
                },
            };
        }

        if (args.range) {
            startLine = Math.max(1, args.range.start);
            endLine = Math.min(totalLines, args.range.end);

            if (startLine > totalLines) {
                return {
                    ok: false,
                    error: `Start line ${startLine} exceeds file length (${totalLines} lines)`,
                };
            }

            if (args.includeContext === "imports") {
                let importEnd = 0;
                for (let i = 0; i < Math.min(startLine - 1, 50); i++) {
                    const line = lines[i].trim();
                    if (
                        line.startsWith("import ") ||
                        line.startsWith("from ") ||
                        line.startsWith("require(") ||
                        line.includes("= require(")
                    ) {
                        importEnd = i + 1;
                    }
                }
                if (importEnd > 0 && importEnd < startLine - 1) {
                    startLine = 1;
                }
            } else if (args.includeContext === "full") {
                let contextStart = startLine - 1;
                let braceDepth = 0;
                for (let i = startLine - 2; i >= 0; i--) {
                    const line = lines[i];
                    braceDepth -= (line.match(/}/g) || []).length;
                    braceDepth += (line.match(/{/g) || []).length;

                    if (
                        braceDepth >= 0 &&
                        (line.match(
                            /^(export\s+)?(function|class|interface|const|type|async function)/
                        ) ||
                            line.match(/^(public|private|protected)?\s*(async\s+)?def\s+/))
                    ) {
                        contextStart = i + 1;
                        break;
                    }
                    if (i === 0) {
                        contextStart = 1;
                        break;
                    }
                }
                startLine = contextStart;

                let contextEnd = endLine;
                braceDepth = 0;
                for (let i = endLine; i < totalLines; i++) {
                    const line = lines[i];
                    braceDepth += (line.match(/{/g) || []).length;
                    braceDepth -= (line.match(/}/g) || []).length;

                    if (braceDepth === 0 && line.trim() === "}") {
                        contextEnd = i + 1;
                        break;
                    }
                    if (i === totalLines - 1) {
                        contextEnd = totalLines;
                        break;
                    }
                }
                endLine = contextEnd;
            }
        }

        let selectedLines = lines.slice(startLine - 1, endLine);

        if (args.includeHeadTail && !args.range && !args.aroundMatch && totalLines > MAX_LINES) {
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
