import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";

export interface FindBlocksInput {
    path: string;
    kind?: "html_section" | "css_rule" | "js_ts_symbol" | "all";
}

export interface BlockEntry {
    id: string;
    label: string;
    startLine: number;
    endLine: number;
}

export interface FindBlocksOutput {
    path: string;
    totalLines: number;
    blocks: BlockEntry[];
}

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

function detectLanguageKind(filePath: string): "html" | "css" | "js_ts" | "python" | "unknown" {
    const ext = extname(filePath).toLowerCase();
    const htmlExts = [".html", ".htm", ".vue", ".svelte"];
    const cssExts = [".css", ".scss", ".sass", ".less"];
    const jsExts = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
    const pyExts = [".py"];

    if (htmlExts.includes(ext)) return "html";
    if (cssExts.includes(ext)) return "css";
    if (jsExts.includes(ext)) return "js_ts";
    if (pyExts.includes(ext)) return "python";
    return "unknown";
}

function findHtmlSections(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    const sectionTags = ["section", "article", "nav", "header", "footer", "main", "aside", "div"];
    const tagStack: Array<{ tag: string; id?: string; className?: string; startLine: number }> = [];
    let blockId = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const tag of sectionTags) {
            const openPattern = new RegExp(`<${tag}([^>]*)>`, "gi");
            let match;
            while ((match = openPattern.exec(line)) !== null) {
                const attrs = match[1];
                const idMatch = attrs.match(/id=["']([^"']+)["']/i);
                const classMatch = attrs.match(/class=["']([^"']+)["']/i);

                if (tag === "div" && !idMatch && !classMatch) continue;

                tagStack.push({
                    tag,
                    id: idMatch?.[1],
                    className: classMatch?.[1]?.split(/\s+/)[0],
                    startLine: i + 1,
                });
            }

            const closePattern = new RegExp(`</${tag}>`, "gi");
            while (closePattern.exec(line) !== null) {
                const lastOpenIndex = tagStack.findLastIndex((t) => t.tag === tag);
                if (lastOpenIndex >= 0) {
                    const openTag = tagStack[lastOpenIndex];
                    let label = `<${tag}>`;
                    if (openTag.id) {
                        label = `<${tag}#${openTag.id}>`;
                    } else if (openTag.className) {
                        label = `<${tag}.${openTag.className}>`;
                    }

                    blocks.push({
                        id: `html-${blockId++}`,
                        label,
                        startLine: openTag.startLine,
                        endLine: i + 1,
                    });
                    tagStack.splice(lastOpenIndex, 1);
                }
            }
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

function findCssRules(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;
    let currentSelector: { label: string; startLine: number } | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const atRuleMatch = line.match(/^(@media|@keyframes|@supports|@font-face)\s*/);
        if (atRuleMatch && braceDepth === 0) {
            const atRule = atRuleMatch[1];
            const restOfLine = line.slice(atRuleMatch[0].length).trim();
            let label = atRule;

            if (atRule === "@media") {
                const mediaQuery = restOfLine.replace(/\s*\{.*$/, "").trim();
                label = `@media ${mediaQuery.slice(0, 40)}${mediaQuery.length > 40 ? "..." : ""}`;
            } else if (atRule === "@keyframes") {
                const animName = restOfLine.match(/^([\w-]+)/)?.[1] || "unknown";
                label = `@keyframes ${animName}`;
            }

            currentSelector = { label, startLine: i + 1 };
        }

        if (!atRuleMatch && braceDepth === 0 && line.includes("{")) {
            const selector = line.replace(/\s*\{.*$/, "").trim();
            if (selector && !selector.startsWith("//") && !selector.startsWith("/*")) {
                const displayLabel =
                    selector.length > 50 ? selector.slice(0, 50) + "..." : selector;
                currentSelector = { label: displayLabel, startLine: i + 1 };
            }
        }

        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;

        if (braceDepth === 0 && currentSelector) {
            blocks.push({
                id: `css-${blockId++}`,
                label: currentSelector.label,
                startLine: currentSelector.startLine,
                endLine: i + 1,
            });
            currentSelector = null;
        }
    }

    return blocks;
}

function findJsTsSymbols(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const functionPattern =
        /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)|^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>/;
    const interfacePattern = /^(\s*)(export\s+)?interface\s+(\w+)/;
    const typePattern = /^(\s*)(export\s+)?type\s+(\w+)/;
    const enumPattern = /^(\s*)(export\s+)?enum\s+(\w+)/;
    const reactComponentPattern = /^(\s*)(export\s+)?(const|function)\s+([A-Z]\w*)\s*[=:]/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `js-${blockId++}`,
                label: `class ${classMatch[4]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const interfaceMatch = line.match(interfacePattern);
        if (interfaceMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `js-${blockId++}`,
                label: `interface ${interfaceMatch[3]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const typeMatch = line.match(typePattern);
        if (typeMatch) {
            let endLine = i + 1;
            if (line.includes("{") && !line.includes("}")) {
                endLine = findBraceBlockEnd(lines, i);
            } else {
                for (let j = i; j < lines.length; j++) {
                    if (lines[j].includes(";") || (j > i && !lines[j].trim().startsWith("|"))) {
                        endLine = j + 1;
                        break;
                    }
                }
            }
            blocks.push({
                id: `js-${blockId++}`,
                label: `type ${typeMatch[3]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const enumMatch = line.match(enumPattern);
        if (enumMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `js-${blockId++}`,
                label: `enum ${enumMatch[3]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const reactMatch = line.match(reactComponentPattern);
        if (reactMatch && !classMatch) {
            const name = reactMatch[4];
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `js-${blockId++}`,
                label: `component ${name}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const funcMatch = line.match(functionPattern);
        if (funcMatch) {
            const name = funcMatch[4] || funcMatch[8];
            if (name) {
                const endLine = findBraceBlockEnd(lines, i);
                blocks.push({
                    id: `js-${blockId++}`,
                    label: `function ${name}`,
                    startLine: i + 1,
                    endLine,
                });
            }
            continue;
        }

        const exportDefaultMatch = line.match(/^(\s*)export\s+default\s+(function|class)\s*(\w*)/);
        if (exportDefaultMatch) {
            const kind = exportDefaultMatch[2];
            const name = exportDefaultMatch[3] || "default";
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `js-${blockId++}`,
                label: `${kind} ${name}`,
                startLine: i + 1,
                endLine,
            });
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

function findPythonSymbols(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(/^class\s+(\w+)/);
        if (classMatch) {
            const indent = line.search(/\S/);
            const endLine = findPythonBlockEnd(lines, i, indent);
            blocks.push({
                id: `py-${blockId++}`,
                label: `class ${classMatch[1]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const funcMatch = line.match(/^(async\s+)?def\s+(\w+)/);
        if (funcMatch) {
            const indent = line.search(/\S/);
            const endLine = findPythonBlockEnd(lines, i, indent);
            blocks.push({
                id: `py-${blockId++}`,
                label: `def ${funcMatch[2]}`,
                startLine: i + 1,
                endLine,
            });
        }
    }

    return blocks;
}

function findBraceBlockEnd(lines: string[], startIndex: number): number {
    let braceDepth = 0;
    let foundOpen = false;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
            if (char === "{") {
                braceDepth++;
                foundOpen = true;
            } else if (char === "}") {
                braceDepth--;
                if (foundOpen && braceDepth === 0) {
                    return i + 1;
                }
            }
        }
    }

    return lines.length;
}

function findPythonBlockEnd(lines: string[], startIndex: number, baseIndent: number): number {
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;

        const currentIndent = line.search(/\S/);
        if (currentIndent !== -1 && currentIndent <= baseIndent) {
            return i;
        }
    }
    return lines.length;
}

export const findBlocksTool: ToolDefinition<FindBlocksInput, FindBlocksOutput> = {
    name: "find_blocks",
    description:
        "Get a structural map of a file with line ranges but no content. " +
        "Returns block coordinates for navigation. Filter by kind: " +
        "html_section (sections, articles, IDs), css_rule (selectors, @media), " +
        "js_ts_symbol (functions, classes, interfaces, components), or all.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            kind: {
                type: "string",
                description:
                    "Filter blocks by kind: 'html_section', 'css_rule', 'js_ts_symbol', or 'all' (default: auto-detect from file extension)",
            },
        },
        required: ["path"],
    },
    async execute(args: FindBlocksInput, ctx: ToolContext): Promise<ToolResult<FindBlocksOutput>> {
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
        const totalLines = lines.length;
        const langKind = detectLanguageKind(args.path);
        const requestedKind = args.kind || "all";

        let blocks: BlockEntry[] = [];

        if (requestedKind === "all") {
            if (langKind === "html") {
                blocks = findHtmlSections(lines);
            } else if (langKind === "css") {
                blocks = findCssRules(lines);
            } else if (langKind === "js_ts") {
                blocks = findJsTsSymbols(lines);
            } else if (langKind === "python") {
                blocks = findPythonSymbols(lines);
            } else {
                blocks = findJsTsSymbols(lines);
            }
        } else if (requestedKind === "html_section") {
            blocks = findHtmlSections(lines);
        } else if (requestedKind === "css_rule") {
            blocks = findCssRules(lines);
        } else if (requestedKind === "js_ts_symbol") {
            blocks = findJsTsSymbols(lines);
        }

        return {
            ok: true,
            data: {
                path: args.path,
                totalLines,
                blocks,
            },
        };
    },
};
