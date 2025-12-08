import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    EditBatchInput,
    EditPrepareResult,
    FileDiff,
    EditOperation,
} from "./types";
import { editReplaceExactTool } from "./edit_replace_exact";
import { editInsertAtLineTool } from "./edit_insert_at_line";
import { editCreateFileTool } from "./edit_create_file";

const EDIT_TOOLS: Record<string, ToolDefinition> = {
    edit_replace_exact: editReplaceExactTool,
    edit_insert_at_line: editInsertAtLineTool,
    edit_create_file: editCreateFileTool,
};

export const editApplyBatchTool: ToolDefinition<EditBatchInput, EditPrepareResult> = {
    name: "edit_apply_batch",
    description:
        "Apply multiple edits as a single atomic operation. All edits are validated first; if any fails, none are applied. Use for coordinated multi-file changes.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            edits: {
                type: "array",
                description: "Array of edit operations to apply atomically",
                items: {
                    type: "object",
                    properties: {
                        toolName: {
                            type: "string",
                            description:
                                "Name of the edit tool: edit_replace_exact, edit_insert_at_line, or edit_create_file",
                        },
                        args: {
                            type: "object",
                            description: "Arguments for the edit tool",
                        },
                    },
                },
            },
        },
        required: ["edits"],
    },

    async execute(args: EditBatchInput, ctx: ToolContext): Promise<ToolResult<EditPrepareResult>> {
        if (!args.edits || args.edits.length === 0) {
            return { ok: false, error: "No edits provided" };
        }

        const allDiffs: FileDiff[] = [];
        const allOperations: EditOperation[] = [];
        const errors: string[] = [];

        for (let i = 0; i < args.edits.length; i++) {
            const edit = args.edits[i];
            const tool = EDIT_TOOLS[edit.toolName];

            if (!tool) {
                errors.push(
                    `Edit ${i + 1}: Unknown tool "${edit.toolName}". Use edit_replace_exact, edit_insert_at_line, or edit_create_file.`
                );
                continue;
            }

            const result = await tool.execute(edit.args, ctx);

            if (!result.ok) {
                errors.push(`Edit ${i + 1} (${edit.toolName}): ${result.error}`);
                continue;
            }

            const data = result.data as EditPrepareResult;
            allDiffs.push(...data.diffsByFile);
            allOperations.push(...data.applyPayload);
        }

        if (errors.length > 0) {
            return {
                ok: false,
                error: `Batch validation failed:\n${errors.join("\n")}`,
            };
        }

        const diffsByFile = consolidateDiffsByFile(allDiffs);

        let totalLinesAdded = 0;
        let totalLinesRemoved = 0;
        for (const diff of diffsByFile) {
            totalLinesAdded += diff.linesAdded;
            totalLinesRemoved += diff.linesRemoved;
        }

        return {
            ok: true,
            data: {
                diffsByFile,
                applyPayload: allOperations,
                stats: {
                    filesChanged: diffsByFile.length,
                    totalLinesAdded,
                    totalLinesRemoved,
                },
            },
        };
    },
};

function consolidateDiffsByFile(diffs: FileDiff[]): FileDiff[] {
    const byPath = new Map<string, FileDiff>();

    for (const diff of diffs) {
        const existing = byPath.get(diff.path);
        if (existing) {
            existing.diff += "\n" + diff.diff;
            existing.linesAdded += diff.linesAdded;
            existing.linesRemoved += diff.linesRemoved;
        } else {
            byPath.set(diff.path, { ...diff });
        }
    }

    return Array.from(byPath.values());
}
