import { existsSync, statSync, readFileSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    GetFileSymbolsInput,
    GetFileSymbolsOutput,
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
        } catch {
            return null;
        }
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

function extractTypeScriptSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

        const exportMatch = trimmed.match(
            /^export\s+(interface|type|class|function|const|enum)\s+(\w+)/
        );
        if (exportMatch) {
            const [, type, name] = exportMatch;
            let symbolType: FileSymbol["type"] = "const";
            if (type === "function") symbolType = "function";
            else if (type === "class") symbolType = "class";
            else if (type === "interface") symbolType = "interface";
            else if (type === "type") symbolType = "type";
            else if (type === "enum") symbolType = "enum";
            else if (type === "const") symbolType = "const";

            symbols.push({
                name,
                type: symbolType,
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const interfaceMatch = trimmed.match(/^interface\s+(\w+)/);
        if (interfaceMatch) {
            symbols.push({
                name: interfaceMatch[1],
                type: "interface",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const typeMatch = trimmed.match(/^type\s+(\w+)/);
        if (typeMatch) {
            symbols.push({
                name: typeMatch[1],
                type: "type",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const classMatch = trimmed.match(/^class\s+(\w+)/);
        if (classMatch) {
            symbols.push({
                name: classMatch[1],
                type: "class",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const functionMatch = trimmed.match(/^(async\s+)?function\s+(\w+)/);
        if (functionMatch) {
            symbols.push({
                name: functionMatch[2],
                type: "function",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const constMatch = trimmed.match(/^const\s+(\w+)\s*=/);
        if (constMatch) {
            symbols.push({
                name: constMatch[1],
                type: "const",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const arrowFunctionMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=.*=>/);
        if (arrowFunctionMatch) {
            symbols.push({
                name: arrowFunctionMatch[1],
                type: "function",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }
    }

    return symbols;
}

function extractPythonSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");
    let currentClass: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const classMatch = line.match(/^class\s+(\w+)/);
        if (classMatch) {
            currentClass = classMatch[1];
            symbols.push({
                name: classMatch[1],
                type: "class",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const functionMatch = line.match(/^(async\s+)?def\s+(\w+)/);
        if (functionMatch) {
            const name = functionMatch[2];
            const isMethod = line.startsWith("    ");

            if (isMethod && currentClass) {
                symbols.push({
                    name,
                    type: "method",
                    line: i + 1,
                    signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
                    parentSymbol: currentClass,
                });
            } else {
                currentClass = null;
                symbols.push({
                    name,
                    type: "function",
                    line: i + 1,
                    signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
                });
            }
            continue;
        }

        if (!line.startsWith(" ") && !line.startsWith("\t")) {
            currentClass = null;
        }
    }

    return symbols;
}

function extractRustSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("//")) continue;

        const pubMatch = trimmed.match(/^pub\s+(fn|struct|enum|trait|type|const)\s+(\w+)/);
        if (pubMatch) {
            const [, kind, name] = pubMatch;
            let symbolType: FileSymbol["type"] = "const";
            if (kind === "fn") symbolType = "function";
            else if (kind === "struct") symbolType = "class";
            else if (kind === "enum") symbolType = "enum";
            else if (kind === "trait") symbolType = "interface";
            else if (kind === "type") symbolType = "type";
            else if (kind === "const") symbolType = "const";

            symbols.push({
                name,
                type: symbolType,
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const fnMatch = trimmed.match(/^fn\s+(\w+)/);
        if (fnMatch) {
            symbols.push({
                name: fnMatch[1],
                type: "function",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const structMatch = trimmed.match(/^struct\s+(\w+)/);
        if (structMatch) {
            symbols.push({
                name: structMatch[1],
                type: "class",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }
    }

    return symbols;
}

function extractGoSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("//")) continue;

        const funcMatch = trimmed.match(/^func\s+(\w+)/);
        if (funcMatch) {
            symbols.push({
                name: funcMatch[1],
                type: "function",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)/);
        if (typeMatch) {
            symbols.push({
                name: typeMatch[1],
                type: typeMatch[2] === "interface" ? "interface" : "class",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }
    }

    return symbols;
}

function extractJavaSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

        const classMatch = trimmed.match(
            /^(public|private|protected)?\s*(abstract|final)?\s*(class|interface|enum)\s+(\w+)/
        );
        if (classMatch) {
            const kind = classMatch[3];
            const name = classMatch[4];
            let symbolType: FileSymbol["type"] = "class";
            if (kind === "interface") symbolType = "interface";
            else if (kind === "enum") symbolType = "enum";

            symbols.push({
                name,
                type: symbolType,
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }

        const methodMatch = trimmed.match(
            /^(public|private|protected)?\s*(static)?\s*\w+\s+(\w+)\s*\(/
        );
        if (methodMatch && !trimmed.includes("=")) {
            symbols.push({
                name: methodMatch[3],
                type: "method",
                line: i + 1,
                signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
            });
            continue;
        }
    }

    return symbols;
}

export const getFileSymbolsTool: ToolDefinition<GetFileSymbolsInput, GetFileSymbolsOutput> = {
    name: "get_file_symbols",
    description:
        "Extract symbols (functions, classes, types, interfaces) from a file WITHOUT reading the entire content. Use this to quickly understand what's defined in a file or to locate where a symbol is defined. For TypeScript/JavaScript: finds export function, class, interface, type, const. For Python: finds class, def. For Rust: finds pub fn, struct, enum. For Go: finds func, type. For Java: finds class, interface, enum, methods.",
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
        args: GetFileSymbolsInput,
        ctx: ToolContext
    ): Promise<ToolResult<GetFileSymbolsOutput>> {
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
        let symbols: FileSymbol[] = [];

        if (language === "typescript" || language === "javascript") {
            symbols = extractTypeScriptSymbols(content);
        } else if (language === "python") {
            symbols = extractPythonSymbols(content);
        } else if (language === "rust") {
            symbols = extractRustSymbols(content);
        } else if (language === "go") {
            symbols = extractGoSymbols(content);
        } else if (language === "java") {
            symbols = extractJavaSymbols(content);
        }

        return {
            ok: true,
            data: {
                path: args.path,
                language,
                symbols,
            },
        };
    },
};
