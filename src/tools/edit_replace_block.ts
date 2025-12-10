import type { ToolDefinition, ToolContext, ToolResult, EditPrepareResult } from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

export interface EditReplaceBlockInput {
    path: string;
    blockStart: string;
    blockEnd: string;
    content: string;
    inclusive?: boolean;
}

function findLineWithText(lines: string[], text: string, startFrom: number = 0): number {
    for (let i = startFrom; i < lines.length; i++) {
        if (lines[i].includes(text)) {
            return i + 1;
        }
    }
    return -1;
}

function getLinePreview(lines: string[], lineNum: number): string {
    const line = lines[lineNum - 1] || "";
    return line.length > 60 ? line.slice(0, 60) + "..." : line;
}

export const editReplaceBlockTool: ToolDefinition<EditReplaceBlockInput, EditPrepareResult> = {
    name: "edit_replace_block",
    description:
        "Replace content between two anchor texts. " +
        "Finds blockStart, then finds blockEnd after it, and replaces everything between. " +
        "By default keeps the anchor lines (exclusive). Set inclusive=true to replace anchors too.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            blockStart: {
                type: "string",
                description: "Text marking the start of the block to replace",
            },
            blockEnd: {
                type: "string",
                description:
                    "Text marking the end of the block to replace (must appear after blockStart)",
            },
            content: {
                type: "string",
                description: "Replacement content for the block",
            },
            inclusive: {
                type: "boolean",
                description:
                    "If true, replace the anchor lines too. If false (default), keep anchor lines and only replace content between them.",
            },
        },
        required: ["path", "blockStart", "blockEnd", "content"],
    },
    async execute(
        args: EditReplaceBlockInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const result = readFileContent(ctx.repoRoot, args.path);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const original = result.content;
        const lines = original.split("\n");

        const startLine = findLineWithText(lines, args.blockStart);
        if (startLine === -1) {
            return {
                ok: false,
                error: `Block start not found: "${args.blockStart}". Use search_text to locate the correct anchor.`,
            };
        }

        const endLine = findLineWithText(lines, args.blockEnd, startLine);
        if (endLine === -1) {
            return {
                ok: false,
                error: `Block end not found: "${args.blockEnd}" (searching after line ${startLine}). Use search_text to locate the correct anchor.`,
            };
        }

        if (endLine <= startLine) {
            return {
                ok: false,
                error: `Block end (line ${endLine}) must come after block start (line ${startLine}).`,
            };
        }

        const inclusive = args.inclusive ?? false;
        const replaceLines = args.content.split("\n");

        let newLines: string[];
        if (inclusive) {
            newLines = [...lines.slice(0, startLine - 1), ...replaceLines, ...lines.slice(endLine)];
        } else {
            newLines = [...lines.slice(0, startLine), ...replaceLines, ...lines.slice(endLine - 1)];
        }

        const rawModified = newLines.join("\n");
        const modified = preserveTrailingNewline(original, rawModified);
        const fileDiff = computeUnifiedDiff(original, modified, args.path);

        const replacedRange = inclusive
            ? `lines ${startLine}-${endLine}`
            : `lines ${startLine + 1}-${endLine - 1}`;

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
