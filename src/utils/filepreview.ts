import { existsSync, readFileSync } from "fs";
import { join, isAbsolute, extname, basename } from "path";

interface FileSymbol {
    name: string;
    type: "function" | "class" | "interface" | "type" | "const" | "enum" | "method";
    line: number;
}

export interface FilePreviewResult {
    path: string;
    preview: string;
    outline: string;
    error?: string;
}

const MAX_PREVIEW_LINES = 30;
const MAX_PREVIEW_BYTES = 2048;

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
        ".json": "json",
        ".md": "markdown",
        ".css": "css",
        ".scss": "scss",
        ".html": "html",
        ".yml": "yaml",
        ".yaml": "yaml",
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

            symbols.push({ name, type: symbolType, line: i + 1 });
            continue;
        }

        const interfaceMatch = trimmed.match(/^interface\s+(\w+)/);
        if (interfaceMatch) {
            symbols.push({ name: interfaceMatch[1], type: "interface", line: i + 1 });
            continue;
        }

        const typeMatch = trimmed.match(/^type\s+(\w+)/);
        if (typeMatch) {
            symbols.push({ name: typeMatch[1], type: "type", line: i + 1 });
            continue;
        }

        const classMatch = trimmed.match(/^class\s+(\w+)/);
        if (classMatch) {
            symbols.push({ name: classMatch[1], type: "class", line: i + 1 });
            continue;
        }

        const functionMatch = trimmed.match(/^(async\s+)?function\s+(\w+)/);
        if (functionMatch) {
            symbols.push({ name: functionMatch[2], type: "function", line: i + 1 });
            continue;
        }

        const arrowFunctionMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=.*=>/);
        if (arrowFunctionMatch) {
            symbols.push({ name: arrowFunctionMatch[1], type: "function", line: i + 1 });
            continue;
        }
    }

    return symbols;
}

function extractPythonSymbols(content: string): FileSymbol[] {
    const symbols: FileSymbol[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const classMatch = line.match(/^class\s+(\w+)/);
        if (classMatch) {
            symbols.push({ name: classMatch[1], type: "class", line: i + 1 });
            continue;
        }

        const functionMatch = line.match(/^(async\s+)?def\s+(\w+)/);
        if (functionMatch) {
            symbols.push({ name: functionMatch[2], type: "function", line: i + 1 });
            continue;
        }
    }

    return symbols;
}

function extractSymbols(content: string, language: string | null): FileSymbol[] {
    if (language === "typescript" || language === "javascript") {
        return extractTypeScriptSymbols(content);
    }
    if (language === "python") {
        return extractPythonSymbols(content);
    }
    return [];
}

function formatOutline(symbols: FileSymbol[]): string {
    if (symbols.length === 0) return "";

    const limited = symbols.slice(0, 15);
    const lines = limited.map((s) => `- ${s.type} ${s.name} (line ${s.line})`);

    if (symbols.length > 15) {
        lines.push(`- ... and ${symbols.length - 15} more symbols`);
    }

    return lines.join("\n");
}

export function generateFilePreview(repoRoot: string, filePath: string): FilePreviewResult {
    const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);

    if (!existsSync(resolved)) {
        return { path: filePath, preview: "", outline: "", error: "File not found" };
    }

    let content: string;
    try {
        content = readFileSync(resolved, "utf-8");
    } catch {
        return { path: filePath, preview: "", outline: "", error: "Cannot read file" };
    }

    const lines = content.split("\n");
    const previewLines = lines.slice(0, MAX_PREVIEW_LINES);
    let preview = previewLines.join("\n");

    if (preview.length > MAX_PREVIEW_BYTES) {
        preview = preview.slice(0, MAX_PREVIEW_BYTES) + "\n... [truncated]";
    } else if (lines.length > MAX_PREVIEW_LINES) {
        preview += `\n... [${lines.length - MAX_PREVIEW_LINES} more lines]`;
    }

    const language = detectLanguage(filePath);
    const symbols = extractSymbols(content, language);
    const outline = formatOutline(symbols);

    return { path: filePath, preview, outline };
}

export function formatAttachedFilesContext(repoRoot: string, filePaths: string[]): string {
    if (filePaths.length === 0) return "";

    const sections: string[] = ["# Attached Files"];

    for (const filePath of filePaths) {
        const result = generateFilePreview(repoRoot, filePath);
        const fileName = basename(filePath);
        const language = detectLanguage(filePath) || "";

        sections.push(`\n## ${filePath}`);

        if (result.error) {
            sections.push(`\nError: ${result.error}`);
        } else {
            sections.push(`\n\`\`\`${language}\n${result.preview}\n\`\`\``);

            if (result.outline) {
                sections.push(`\n**Outline (${fileName}):**\n${result.outline}`);
            }
        }
    }

    return sections.join("\n");
}
