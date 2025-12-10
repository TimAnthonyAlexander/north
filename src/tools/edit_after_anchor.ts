import type { ToolDefinition, ToolContext, ToolResult, EditPrepareResult } from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

export interface EditAfterAnchorInput {
    path: string;
    anchor: string;
    content: string;
    occurrence?: number;
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

export const editAfterAnchorTool: ToolDefinition<EditAfterAnchorInput, EditPrepareResult> = {
    name: "edit_after_anchor",
    description:
        "Insert content AFTER a line containing the anchor text. " +
        "Use this instead of line numbers for more reliable edits. " +
        "If multiple matches exist, specify occurrence (1-based) or the tool will list candidates.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            anchor: {
                type: "string",
                description: "Text to find in a line. Content will be inserted after this line.",
            },
            content: {
                type: "string",
                description: "Content to insert after the anchor line",
            },
            occurrence: {
                type: "number",
                description:
                    "Which occurrence of the anchor to use (1-based). Required if anchor appears multiple times.",
            },
        },
        required: ["path", "anchor", "content"],
    },
    async execute(
        args: EditAfterAnchorInput,
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
                error: `Anchor text not found: "${args.anchor}". Use search_text or find_code_block to locate the correct anchor.`,
            };
        }

        if (anchorLines.length > 1 && !args.occurrence) {
            const candidates: AnchorCandidate[] = anchorLines.slice(0, 10).map((lineNum) => ({
                line: lineNum,
                preview: getLinePreview(lines, lineNum),
            }));

            return {
                ok: false,
                error: `Multiple matches found for anchor. Specify occurrence (1-${anchorLines.length}) or use a more specific anchor.`,
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
        const insertLines = args.content.split("\n");

        const newLines = [
            ...lines.slice(0, targetLine),
            ...insertLines,
            ...lines.slice(targetLine),
        ];

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
