import { existsSync, statSync, readFileSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    GetLineCountInput,
    GetLineCountOutput,
} from "./types";

const MAX_LINES_THRESHOLD = 500;

function resolvePath(repoRoot: string, filePath: string): string | null {
    const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
    const normalized = normalize(resolved);
    const normalizedRoot = normalize(repoRoot);

    if (!normalized.startsWith(normalizedRoot)) {
        return null;
    }

    try {
        const realPath = realpathSync(normalized);
        const realRoot = realpathSync(normalizedRoot);
        if (!realPath.startsWith(realRoot)) {
            return null;
        }
        return realPath;
    } catch {
        const parentDir = dirname(normalized);
        try {
            const realParent = realpathSync(parentDir);
            const realRoot = realpathSync(normalizedRoot);
            if (!realParent.startsWith(realRoot)) {
                return null;
            }
        } catch {
            return null;
        }
        return normalized;
    }
}

export const getLineCountTool: ToolDefinition<GetLineCountInput, GetLineCountOutput> = {
    name: "get_line_count",
    description:
        "Get the total line count and size of a file. Use this BEFORE reading large files to determine if you need to use get_file_symbols, get_file_outline, or targeted range reads instead of reading the entire file.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
        },
        required: ["path"],
    },
    async execute(
        args: GetLineCountInput,
        ctx: ToolContext
    ): Promise<ToolResult<GetLineCountOutput>> {
        const resolvedPath = resolvePath(ctx.repoRoot, args.path);
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
        const lineCount = lines.length;
        const sizeBytes = stat.size;
        const willTruncate = lineCount > MAX_LINES_THRESHOLD;

        return {
            ok: true,
            data: {
                path: args.path,
                lineCount,
                sizeBytes,
                willTruncate,
            },
        };
    },
};
