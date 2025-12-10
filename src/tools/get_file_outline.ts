import { existsSync, statSync, readFileSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    GetFileOutlineInput,
    GetFileOutlineOutput,
    OutlineSection,
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
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".scss": "scss",
        ".sass": "scss",
        ".less": "less",
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

function buildHtmlOutline(content: string): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const lines = content.split("\n");

    const majorTags = [
        "head",
        "body",
        "header",
        "nav",
        "main",
        "section",
        "article",
        "aside",
        "footer",
        "script",
        "style",
    ];
    const tagStack: Array<{ tag: string; startLine: number; id?: string; className?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const openTagMatch = line.match(
            /<(head|body|header|nav|main|section|article|aside|footer|script|style)([^>]*)>/i
        );
        if (openTagMatch) {
            const tag = openTagMatch[1].toLowerCase();
            const attrs = openTagMatch[2];
            const idMatch = attrs.match(/id=["']([^"']+)["']/i);
            const classMatch = attrs.match(/class=["']([^"']+)["']/i);

            tagStack.push({
                tag,
                startLine: i + 1,
                id: idMatch?.[1],
                className: classMatch?.[1],
            });
        }

        for (const majorTag of majorTags) {
            const closeMatch = line.match(new RegExp(`</${majorTag}>`, "i"));
            if (closeMatch) {
                const lastOpenIndex = tagStack.findLastIndex((t) => t.tag === majorTag);
                if (lastOpenIndex >= 0) {
                    const openTag = tagStack[lastOpenIndex];
                    let name = `<${majorTag}>`;
                    if (openTag.id) {
                        name = `<${majorTag} id="${openTag.id}">`;
                    } else if (openTag.className) {
                        const firstClass = openTag.className.split(/\s+/)[0];
                        name = `<${majorTag} class="${firstClass}">`;
                    }
                    sections.push({
                        type: "symbol",
                        name,
                        startLine: openTag.startLine,
                        endLine: i + 1,
                    });
                    tagStack.splice(lastOpenIndex, 1);
                }
            }
        }

        const idMatch = line.match(/<(\w+)[^>]*id=["']([^"']+)["'][^>]*>/i);
        if (idMatch && !majorTags.includes(idMatch[1].toLowerCase())) {
            const tag = idMatch[1].toLowerCase();
            const id = idMatch[2];
            sections.push({
                type: "symbol",
                name: `<${tag} id="${id}">`,
                startLine: i + 1,
                endLine: i + 1,
            });
        }
    }

    sections.sort((a, b) => a.startLine - b.startLine);
    return sections;
}

function buildCssOutline(content: string): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const lines = content.split("\n");

    let currentSelector: { name: string; startLine: number } | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const atRuleMatch = line.match(/^(@media|@keyframes|@supports|@font-face|@import)\s*/);
        if (atRuleMatch && braceDepth === 0) {
            const atRule = atRuleMatch[1];
            const restOfLine = line.slice(atRuleMatch[0].length).trim();
            let name = atRule;

            if (atRule === "@media") {
                const mediaQuery = restOfLine.replace(/\s*\{.*$/, "").trim();
                name = `@media ${mediaQuery.slice(0, 30)}${mediaQuery.length > 30 ? "..." : ""}`;
            } else if (atRule === "@keyframes") {
                const animName = restOfLine.match(/^(\w+)/)?.[1] || "unknown";
                name = `@keyframes ${animName}`;
            } else if (atRule === "@import") {
                name = `@import ${restOfLine.slice(0, 40)}${restOfLine.length > 40 ? "..." : ""}`;
            }

            currentSelector = { name, startLine: i + 1 };
        }

        if (!atRuleMatch && braceDepth === 0 && line.includes("{")) {
            const selector = line.replace(/\s*\{.*$/, "").trim();
            if (selector && !selector.startsWith("//") && !selector.startsWith("/*")) {
                const displayName = selector.length > 50 ? selector.slice(0, 50) + "..." : selector;
                currentSelector = { name: displayName, startLine: i + 1 };
            }
        }

        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;

        if (braceDepth === 0 && currentSelector) {
            sections.push({
                type: "symbol",
                name: currentSelector.name,
                startLine: currentSelector.startLine,
                endLine: i + 1,
            });
            currentSelector = null;
        }
    }

    return sections;
}

function buildGenericOutline(content: string, _language: string | null): OutlineSection[] {
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
        "Get a hierarchical outline of a file's structure with line numbers. " +
        "Shows imports, symbols (functions, classes, etc.), and exports with their line ranges. " +
        "Supports TypeScript/JavaScript, Python, HTML (major sections, IDs), and CSS (selectors, media queries). " +
        "Use this to understand the overall structure of a large file before reading specific sections.",
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
        } else if (language === "html") {
            sections = buildHtmlOutline(content);
        } else if (language === "css" || language === "scss" || language === "less") {
            sections = buildCssOutline(content);
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
