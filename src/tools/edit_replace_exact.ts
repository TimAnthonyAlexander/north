import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    EditReplaceExactInput,
    EditPrepareResult,
} from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

export const editReplaceExactTool: ToolDefinition<EditReplaceExactInput, EditPrepareResult> = {
    name: "edit_replace_exact",
    description:
        "Replace exact text in a file. The 'old' text must match exactly (including whitespace). Use read_file first to get the exact content.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            old: {
                type: "string",
                description:
                    "Exact text to find and replace (must match exactly including whitespace)",
            },
            new: {
                type: "string",
                description: "Text to replace with",
            },
            expectedOccurrences: {
                type: "number",
                description:
                    "Expected number of occurrences. If provided, must match exactly or the operation fails.",
            },
        },
        required: ["path", "old", "new"],
    },

    async execute(
        args: EditReplaceExactInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const result = readFileContent(ctx.repoRoot, args.path);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const original = result.content;
        const occurrences = original.split(args.old).length - 1;

        if (occurrences === 0) {
            return {
                ok: false,
                error: `Text not found in file. Use read_file to verify the exact content you want to replace.`,
            };
        }

        if (args.expectedOccurrences !== undefined && occurrences !== args.expectedOccurrences) {
            return {
                ok: false,
                error: `Expected ${args.expectedOccurrences} occurrence(s) but found ${occurrences}. Use read_file to verify.`,
            };
        }

        const rawModified = original.split(args.old).join(args.new);
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
