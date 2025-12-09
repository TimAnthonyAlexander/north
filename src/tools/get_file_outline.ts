import { existsSync, statSync, readFileSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    GetFileOutlineInput,
    GetFileOutlineOutput,
    OutlineSection,
    FileSymbol,
} from "./types";

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

function detectLanguage(filePath: string): string | null {
    const ext = extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".mjs": "javascript",
        ".cjs": "javascript",
        ".py": "python",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".kt": "kotlin",
        ".swift": "swift",
        ".c": "c",
        ".h": "c",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".hpp": "cpp",
        ".cs": "csharp",
        ".rb": "ruby",
        ".php": "php",
    };
    return langMap[ext] || null;
}

function buildTypeScriptOutline(content: string): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const lines = content.split("\n");
    let importEnd = 0;
    let exportStart = lines.length;
    const symbols: Array<{ line: number; name: string; endLine: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("import ") && importEnd === i) {
            importEnd = i + 1;
        }

        if (trimmed.match(/^export\s+(interface|type|class|function|const|enum)\s+(\w+)/)) {
            const match = trimmed.match(
                /^export\s+(?:interface|type|class|function|const|enum)\s+(\w+)/
            );
            if (match) {
                let endLine = i + 1;
                if (trimmed.includes("{") && !trimmed.includes("}")) {
                    let braceCount = 1;
                    for (let j = i + 1; j < lines.length; j++) {
                        const innerLine = lines[j];
                        braceCount += (innerLine.match(/{/g) || []).length;
                        braceCount -= (innerLine.match(/}/g) || []).length;
                        if (braceCount === 0) {
                            endLine = j + 1;
                            break;
                        }
                    }
                }
                symbols.push({ line: i + 1, name: match[1], endLine });
            }
        }

        if (trimmed.match(/^(interface|type|class|function|const)\s+(\w+)/)) {
            const match = trimmed.match(/^(?:interface|type|class|function|const)\s+(\w+)/);
            if (match && !trimmed.startsWith("export")) {
                let endLine = i + 1;
                if (trimmed.includes("{") && !trimmed.includes("}")) {
                    let braceCount = 1;
                    for (let j = i + 1; j < lines.length; j++) {
                        const innerLine = lines[j];
                        braceCount += (innerLine.match(/{/g) || []).length;
                        braceCount -= (innerLine.match(/}/g) || []).length;
                        if (braceCount === 0) {
                            endLine = j + 1;
                            break;
                        }
                    }
                }
                symbols.push({ line: i + 1, name: match[1], endLine });
            }
        }

        if (
            trimmed.startsWith("export {") ||
            trimmed.startsWith("export default") ||
            trimmed.startsWith("export *")
        ) {
            if (exportStart > i) {
                exportStart = i;
            }
        }
    }

    if (importEnd > 0) {
        sections.push({
            type: "imports",
            name: "imports",
            startLine: 1,
            endLine: importEnd,
        });
    }

    for (const sym of symbols) {
        sections.push({
            type: "symbol",
            name: sym.name,
            startLine: sym.line,
            endLine: sym.endLine,
        });
    }

    if (exportStart < lines.length) {
        sections.push({
            type: "exports",
            name: "exports",
            startLine: exportStart + 1,
            endLine: lines.length,
        });
    }

    return sections.sort((a, b) => a.startLine - b.startLine);
}

function buildPythonOutline(content: string): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const lines = content.split("\n");
    let importEnd = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if ((trimmed.startsWith("import ") || trimmed.startsWith("from ")) && importEnd === i) {
            importEnd = i + 1;
        }

        const classMatch = line.match(/^class\s+(\w+)/);
        if (classMatch) {
            let endLine = i + 1;
            const indent = line.search(/\S/);
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                if (nextLine.trim() && nextLine.search(/\S/) <= indent) {
                    endLine = j;
                    break;
                }
                if (j === lines.length - 1) {
                    endLine = j + 1;
                }
            }
            sections.push({
                type: "symbol",
                name: `class ${classMatch[1]}`,
                startLine: i + 1,
                endLine,
            });
        }

        const functionMatch = line.match(/^(async\s+)?def\s+(\w+)/);
        if (functionMatch) {
            let endLine = i + 1;
            const indent = line.search(/\S/);
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                if (nextLine.trim() && nextLine.search(/\S/) <= indent) {
                    endLine = j;
                    break;
                }
                if (j === lines.length - 1) {
                    endLine = j + 1;
                }
            }
            sections.push({
                type: "symbol",
                name: `def ${functionMatch[2]}`,
                startLine: i + 1,
                endLine,
            });
        }
    }

    if (importEnd > 0) {
        sections.unshift({
            type: "imports",
            name: "imports",
            startLine: 1,
            endLine: importEnd,
        });
    }

    return sections;
}

function buildGenericOutline(content: string, language: string | null): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const lines = content.split("\n");

    const chunkSize = 50;
    for (let i = 0; i < lines.length; i += chunkSize) {
        const endLine = Math.min(i + chunkSize, lines.length);
        sections.push({
            type: "other",
            name: `lines ${i + 1}-${endLine}`,
            startLine: i + 1,
            endLine,
        });
    }

    return sections;
}

export const getFileOutlineTool: ToolDefinition<GetFileOutlineInput, GetFileOutlineOutput> = {
    name: "get_file_outline",
    description:
        "Get a hierarchical outline of a file's structure with line numbers. Shows imports, symbols (functions, classes, etc.), and exports with their line ranges. Use this to understand the overall structure of a large file before reading specific sections.",
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
        args: GetFileOutlineInput,
        ctx: ToolContext
    ): Promise<ToolResult<GetFileOutlineOutput>> {
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

        const language = detectLanguage(args.path);
        let sections: OutlineSection[] = [];

        if (language === "typescript" || language === "javascript") {
            sections = buildTypeScriptOutline(content);
        } else if (language === "python") {
            sections = buildPythonOutline(content);
        } else {
            sections = buildGenericOutline(content, language);
        }

        return {
            ok: true,
            data: {
                path: args.path,
                language,
                sections,
            },
        };
    },
};
