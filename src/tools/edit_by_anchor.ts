import type { ToolDefinition, ToolContext, ToolResult, EditPrepareResult } from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

export interface EditByAnchorInput {
    path: string;
    mode: "insert_before" | "insert_after" | "replace_line" | "replace_between";
    anchor: string;
    anchorEnd?: string;
    content: string;
    occurrence?: number;
    inclusive?: boolean;
}

interface AnchorCandidate {
    line: number;
    preview: string;
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

function findLineWithText(lines: string[], text: string, startFrom: number = 0): number {
    for (let i = startFrom; i < lines.length; i++) {
        if (lines[i].includes(text)) {
            return i + 1;
        }
    }
    return -1;
}

export const editByAnchorTool: ToolDefinition<EditByAnchorInput, EditPrepareResult> = {
    name: "edit_by_anchor",
    description:
        "Unified anchor-based editing with four modes: " +
        "insert_before (insert content before anchor line), " +
        "insert_after (insert content after anchor line), " +
        "replace_line (replace the anchor line itself), " +
        "replace_between (replace content between anchor and anchorEnd). " +
        "If multiple matches exist, specify occurrence or the tool lists candidates.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            mode: {
                type: "string",
                description:
                    "Edit mode: 'insert_before', 'insert_after', 'replace_line', or 'replace_between'",
            },
            anchor: {
                type: "string",
                description: "Text to find in a line. The edit operates relative to this anchor.",
            },
            anchorEnd: {
                type: "string",
                description:
                    "End anchor for 'replace_between' mode. Must appear after the first anchor.",
            },
            content: {
                type: "string",
                description: "Content to insert or replace with",
            },
            occurrence: {
                type: "number",
                description:
                    "Which occurrence of the anchor to use (1-based). Required if anchor appears multiple times.",
            },
            inclusive: {
                type: "boolean",
                description:
                    "For 'replace_between' mode: if true, replace anchor lines too. If false (default), keep anchor lines.",
            },
        },
        required: ["path", "mode", "anchor", "content"],
    },
    async execute(
        args: EditByAnchorInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const result = readFileContent(ctx.repoRoot, args.path);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const original = result.content;
        const lines = original.split("\n");
        const anchorLines = findAnchorLines(lines, args.anchor);

        if (anchorLines.length === 0) {
            return {
                ok: false,
                error: `Anchor text not found: "${args.anchor}". Use search_text or read_around to locate the correct anchor.`,
            };
        }

        if (anchorLines.length > 1 && !args.occurrence) {
            const candidates: AnchorCandidate[] = anchorLines.slice(0, 10).map((lineNum) => ({
                line: lineNum,
                preview: getLinePreview(lines, lineNum),
            }));

            return {
                ok: false,
                error: `Multiple matches (${anchorLines.length}) found for anchor. Specify occurrence (1-${anchorLines.length}) or use a more specific anchor.`,
                data: { candidates } as unknown as EditPrepareResult,
            };
        }

        const occurrenceIndex = (args.occurrence ?? 1) - 1;
        if (occurrenceIndex >= anchorLines.length) {
            return {
                ok: false,
                error: `Occurrence ${args.occurrence} requested but only ${anchorLines.length} match(es) found.`,
            };
        }

        const targetLine = anchorLines[occurrenceIndex];
        const contentLines = args.content.split("\n");
        let newLines: string[];

        switch (args.mode) {
            case "insert_before":
                newLines = [
                    ...lines.slice(0, targetLine - 1),
                    ...contentLines,
                    ...lines.slice(targetLine - 1),
                ];
                break;

            case "insert_after":
                newLines = [
                    ...lines.slice(0, targetLine),
                    ...contentLines,
                    ...lines.slice(targetLine),
                ];
                break;

            case "replace_line":
                newLines = [
                    ...lines.slice(0, targetLine - 1),
                    ...contentLines,
                    ...lines.slice(targetLine),
                ];
                break;

            case "replace_between": {
                if (!args.anchorEnd) {
                    return {
                        ok: false,
                        error: `Mode 'replace_between' requires 'anchorEnd' parameter.`,
                    };
                }

                const endLine = findLineWithText(lines, args.anchorEnd, targetLine);
                if (endLine === -1) {
                    return {
                        ok: false,
                        error: `End anchor not found: "${args.anchorEnd}" (searching after line ${targetLine}).`,
                    };
                }

                if (endLine <= targetLine) {
                    return {
                        ok: false,
                        error: `End anchor (line ${endLine}) must come after start anchor (line ${targetLine}).`,
                    };
                }

                const inclusive = args.inclusive ?? false;
                if (inclusive) {
                    newLines = [
                        ...lines.slice(0, targetLine - 1),
                        ...contentLines,
                        ...lines.slice(endLine),
                    ];
                } else {
                    newLines = [
                        ...lines.slice(0, targetLine),
                        ...contentLines,
                        ...lines.slice(endLine - 1),
                    ];
                }
                break;
            }

            default:
                return {
                    ok: false,
                    error: `Invalid mode: "${args.mode}". Use 'insert_before', 'insert_after', 'replace_line', or 'replace_between'.`,
                };
        }

        const rawModified = newLines.join("\n");
        const modified = preserveTrailingNewline(original, rawModified);
        const fileDiff = computeUnifiedDiff(original, modified, args.path);

        return {
            ok: true,
            data: {
                diffsByFile: [fileDiff],
                applyPayload: [
                    {
                        type: "replace",
                        path: args.path,
                        content: modified,
                        originalContent: original,
                    },
                ],
                stats: {
                    filesChanged: 1,
                    totalLinesAdded: fileDiff.linesAdded,
                    totalLinesRemoved: fileDiff.linesRemoved,
                },
            },
        };
    },
};
