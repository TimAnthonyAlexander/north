import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    EditInsertAtLineInput,
    EditPrepareResult,
} from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

export const editInsertAtLineTool: ToolDefinition<EditInsertAtLineInput, EditPrepareResult> = {
    name: "edit_insert_at_line",
    description:
        "Insert content at a specific line number. The content will be inserted BEFORE the specified line. Line numbers are 1-based.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            line: {
                type: "number",
                description:
                    "Line number to insert before (1-based). Use 1 to insert at the beginning, or file length + 1 to append.",
            },
            content: {
                type: "string",
                description: "Content to insert",
            },
        },
        required: ["path", "line", "content"],
    },

    async execute(
        args: EditInsertAtLineInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const result = readFileContent(ctx.repoRoot, args.path);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const original = result.content;
        const lines = original.split("\n");

        if (args.line < 1) {
            return { ok: false, error: `Line number must be at least 1, got ${args.line}` };
        }

        if (args.line > lines.length + 1) {
            return {
                ok: false,
                error: `Line ${args.line} exceeds file length (${lines.length} lines). Use ${lines.length + 1} to append.`,
            };
        }

        const insertLines = args.content.split("\n");
        const newLines = [
            ...lines.slice(0, args.line - 1),
            ...insertLines,
            ...lines.slice(args.line - 1),
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
