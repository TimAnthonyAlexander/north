import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    ReadFileInput,
    ReadFileOutput,
} from "./types";

const MAX_FILE_SIZE = 100_000;
const MAX_LINES = 500;

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
        }
        return normalized;
    }
}

export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
    name: "read_file",
    description:
        "Read file content. Can read the entire file or a specific line range. Large files are truncated.",
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
        },
        required: ["path"],
    },
    async execute(args: ReadFileInput, ctx: ToolContext): Promise<ToolResult<ReadFileOutput>> {
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
        let startLine = 1;
        let endLine = lines.length;
        let truncated = false;

        if (args.range) {
            startLine = Math.max(1, args.range.start);
            endLine = Math.min(lines.length, args.range.end);

            if (startLine > lines.length) {
                return {
                    ok: false,
                    error: `Start line ${startLine} exceeds file length (${lines.length} lines)`,
                };
            }
        }

        let selectedLines = lines.slice(startLine - 1, endLine);

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
            resultContent += "\n\n[... content truncated ...]";
        }

        return {
            ok: true,
            data: {
                path: args.path,
                content: resultContent,
                startLine,
                endLine,
                truncated,
            },
        };
    },
};
