import { existsSync } from "fs";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    EditCreateFileInput,
    EditPrepareResult,
} from "./types";
import {
    resolveSafePath,
    readFileContent,
    computeUnifiedDiff,
    computeCreateFileDiff,
} from "../utils/editing";

export const editCreateFileTool: ToolDefinition<EditCreateFileInput, EditPrepareResult> = {
    name: "edit_create_file",
    description:
        "Create a new file or overwrite an existing file. Set overwrite to true to replace an existing file.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path for the new file (relative to repo root or absolute)",
            },
            content: {
                type: "string",
                description: "Content for the new file",
            },
            overwrite: {
                type: "boolean",
                description:
                    "If true, overwrite existing file. If false (default), fail if file exists.",
            },
        },
        required: ["path", "content"],
    },

    async execute(
        args: EditCreateFileInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const resolved = resolveSafePath(ctx.repoRoot, args.path);
        if (!resolved) {
            return { ok: false, error: `Path escapes repository root: ${args.path}` };
        }

        const fileExists = existsSync(resolved);

        if (fileExists && !args.overwrite) {
            return {
                ok: false,
                error: `File already exists: ${args.path}. Set overwrite to true to replace it.`,
            };
        }

        let fileDiff;
        let originalContent: string | undefined;

        if (fileExists) {
            const readResult = readFileContent(ctx.repoRoot, args.path);
            if (!readResult.ok) {
                return { ok: false, error: readResult.error };
            }
            originalContent = readResult.content;
            fileDiff = computeUnifiedDiff(originalContent, args.content, args.path);
        } else {
            fileDiff = computeCreateFileDiff(args.content, args.path);
        }

        return {
            ok: true,
            data: {
                diffsByFile: [fileDiff],
                applyPayload: [
                    {
                        type: "create",
                        path: args.path,
                        content: args.content,
                        originalContent,
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
