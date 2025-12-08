import type { ToolDefinition, ToolContext, ToolResult, ListRootOutput } from "./types";
import { createIgnoreChecker, listRootEntries } from "../utils/ignore";

export const listRootTool: ToolDefinition<void, ListRootOutput> = {
    name: "list_root",
    description:
        "List root-level entries of the repository, respecting .gitignore. Returns files and directories at the top level.",
    inputSchema: {
        type: "object",
        properties: {},
    },
    async execute(_args: void, ctx: ToolContext): Promise<ToolResult<ListRootOutput>> {
        const checker = createIgnoreChecker(ctx.repoRoot);
        const entries = listRootEntries(ctx.repoRoot, checker);

        return {
            ok: true,
            data: {
                entries: entries.map((e) => ({
                    name: e.relativePath,
                    type: e.isDir ? "dir" : "file",
                })),
            },
        };
    },
};
