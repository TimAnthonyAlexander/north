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
        } catch {}
        return normalized;
    }
}

export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
    name: "read_file",
    description:
        "Read file content. Can read the entire file or a specific line range. Large files are truncated. Use 'includeContext' to automatically include imports or full context when reading specific sections. For large files (>200 lines), prefer using get_file_symbols or get_file_outline first, then read specific ranges.",
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
            includeContext: {
                type: "string",
                description:
                    "Optional. When reading a specific range, 'imports' includes file imports/requires at the top. 'full' includes the entire surrounding function/class. Defaults to no extra context.",
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

            if (args.includeContext === "imports") {
                let importEnd = 0;
                for (let i = 0; i < Math.min(startLine - 1, 50); i++) {
                    const line = lines[i].trim();
                    if (
                        line.startsWith("import ") ||
                        line.startsWith("from ") ||
                        line.startsWith("require(") ||
                        line.includes("= require(")
                    ) {
                        importEnd = i + 1;
                    }
                }
                if (importEnd > 0 && importEnd < startLine - 1) {
                    startLine = 1;
                }
            } else if (args.includeContext === "full") {
                let contextStart = startLine - 1;
                let braceDepth = 0;
                for (let i = startLine - 2; i >= 0; i--) {
                    const line = lines[i];
                    braceDepth -= (line.match(/}/g) || []).length;
                    braceDepth += (line.match(/{/g) || []).length;

                    if (
                        braceDepth >= 0 &&
                        (line.match(
                            /^(export\s+)?(function|class|interface|const|type|async function)/
                        ) ||
                            line.match(/^(public|private|protected)?\s*(async\s+)?def\s+/))
                    ) {
                        contextStart = i + 1;
                        break;
                    }
                    if (i === 0) {
                        contextStart = 1;
                        break;
                    }
                }
                startLine = contextStart;

                let contextEnd = endLine;
                braceDepth = 0;
                for (let i = endLine; i < lines.length; i++) {
                    const line = lines[i];
                    braceDepth += (line.match(/{/g) || []).length;
                    braceDepth -= (line.match(/}/g) || []).length;

                    if (braceDepth === 0 && line.trim() === "}") {
                        contextEnd = i + 1;
                        break;
                    }
                    if (i === lines.length - 1) {
                        contextEnd = lines.length;
                        break;
                    }
                }
                endLine = contextEnd;
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
