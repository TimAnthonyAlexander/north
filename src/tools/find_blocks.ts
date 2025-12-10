import { existsSync, readFileSync, statSync, realpathSync } from "fs";
import { join, isAbsolute, normalize, dirname, extname } from "path";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";

export interface FindBlocksInput {
    path: string;
    kind?:
        | "html_section"
        | "css_rule"
        | "js_ts_symbol"
        | "csharp_symbol"
        | "php_symbol"
        | "java_symbol"
        | "all";
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

type LanguageKind = "html" | "css" | "js_ts" | "python" | "csharp" | "php" | "java" | "unknown";

function detectLanguageKind(filePath: string): LanguageKind {
    const ext = extname(filePath).toLowerCase();
    const htmlExts = [".html", ".htm", ".vue", ".svelte"];
    const cssExts = [".css", ".scss", ".sass", ".less"];
    const jsExts = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
    const pyExts = [".py"];
    const csExts = [".cs"];
    const phpExts = [".php"];
    const javaExts = [".java"];

    if (htmlExts.includes(ext)) return "html";
    if (cssExts.includes(ext)) return "css";
    if (jsExts.includes(ext)) return "js_ts";
    if (pyExts.includes(ext)) return "python";
    if (csExts.includes(ext)) return "csharp";
    if (phpExts.includes(ext)) return "php";
    if (javaExts.includes(ext)) return "java";
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

function findCSharpSymbols(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    const namespacePattern = /^\s*namespace\s+([\w.]+)/;
    const classPattern =
        /^\s*(public|private|protected|internal)?\s*(static|sealed|abstract|partial)?\s*(class|struct|record|interface)\s+(\w+)/;
    const methodPattern =
        /^\s*(public|private|protected|internal)?\s*(static|virtual|override|async)?\s*(async\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)/;
    const propertyPattern =
        /^\s*(public|private|protected|internal)?\s*(static|virtual|override)?\s*[\w<>\[\],\s]+\s+(\w+)\s*\{/;
    const enumPattern = /^\s*(public|private|protected|internal)?\s*enum\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (
            !trimmed ||
            trimmed.startsWith("//") ||
            trimmed.startsWith("/*") ||
            trimmed.startsWith("*")
        )
            continue;

        const namespaceMatch = line.match(namespacePattern);
        if (namespaceMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `cs-${blockId++}`,
                label: `namespace ${namespaceMatch[1]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const kind = classMatch[3];
            const name = classMatch[4];
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `cs-${blockId++}`,
                label: `${kind} ${name}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const enumMatch = line.match(enumPattern);
        if (enumMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `cs-${blockId++}`,
                label: `enum ${enumMatch[2]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const methodMatch = line.match(methodPattern);
        if (methodMatch && !trimmed.includes("=") && !trimmed.endsWith(";")) {
            const name = methodMatch[4];
            if (
                !["if", "for", "while", "switch", "catch", "using", "lock", "foreach"].includes(
                    name
                )
            ) {
                const endLine = findBraceBlockEnd(lines, i);
                blocks.push({
                    id: `cs-${blockId++}`,
                    label: `method ${name}`,
                    startLine: i + 1,
                    endLine,
                });
            }
            continue;
        }

        const propertyMatch = line.match(propertyPattern);
        if (propertyMatch && !trimmed.includes("(")) {
            const name = propertyMatch[3];
            if (
                ![
                    "if",
                    "for",
                    "while",
                    "switch",
                    "catch",
                    "using",
                    "lock",
                    "foreach",
                    "get",
                    "set",
                ].includes(name)
            ) {
                const endLine = findBraceBlockEnd(lines, i);
                blocks.push({
                    id: `cs-${blockId++}`,
                    label: `property ${name}`,
                    startLine: i + 1,
                    endLine,
                });
            }
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

function findPhpSymbols(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    const namespacePattern = /^\s*namespace\s+([\w\\]+)/;
    const classPattern = /^\s*(abstract|final)?\s*class\s+(\w+)/;
    const interfacePattern = /^\s*interface\s+(\w+)/;
    const traitPattern = /^\s*trait\s+(\w+)/;
    const functionPattern = /^\s*(public|private|protected)?\s*(static)?\s*function\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (
            !trimmed ||
            trimmed.startsWith("//") ||
            trimmed.startsWith("/*") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith("#")
        )
            continue;

        const namespaceMatch = line.match(namespacePattern);
        if (namespaceMatch) {
            blocks.push({
                id: `php-${blockId++}`,
                label: `namespace ${namespaceMatch[1]}`,
                startLine: i + 1,
                endLine: i + 1,
            });
            continue;
        }

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `php-${blockId++}`,
                label: `class ${classMatch[2]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const interfaceMatch = line.match(interfacePattern);
        if (interfaceMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `php-${blockId++}`,
                label: `interface ${interfaceMatch[1]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const traitMatch = line.match(traitPattern);
        if (traitMatch) {
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `php-${blockId++}`,
                label: `trait ${traitMatch[1]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const functionMatch = line.match(functionPattern);
        if (functionMatch) {
            const name = functionMatch[3];
            const endLine = findBraceBlockEnd(lines, i);
            const isMethod = blocks.some(
                (b) => b.label.startsWith("class ") && b.startLine < i + 1 && b.endLine > i + 1
            );
            blocks.push({
                id: `php-${blockId++}`,
                label: isMethod ? `method ${name}` : `function ${name}`,
                startLine: i + 1,
                endLine,
            });
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

function findJavaSymbols(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    const packagePattern = /^\s*package\s+([\w.]+)/;
    const classPattern =
        /^\s*(public|private|protected)?\s*(static|final|abstract)?\s*(class|interface|enum|record)\s+(\w+)/;
    const methodPattern =
        /^\s*(public|private|protected)?\s*(static|final|synchronized|native|abstract)?\s*[\w<>\[\],\s]+\s+(\w+)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (
            !trimmed ||
            trimmed.startsWith("//") ||
            trimmed.startsWith("/*") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith("@")
        )
            continue;

        const packageMatch = line.match(packagePattern);
        if (packageMatch) {
            blocks.push({
                id: `java-${blockId++}`,
                label: `package ${packageMatch[1]}`,
                startLine: i + 1,
                endLine: i + 1,
            });
            continue;
        }

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const kind = classMatch[3];
            const name = classMatch[4];
            const endLine = findBraceBlockEnd(lines, i);
            blocks.push({
                id: `java-${blockId++}`,
                label: `${kind} ${name}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const methodMatch = line.match(methodPattern);
        if (
            methodMatch &&
            !trimmed.includes("=") &&
            (line.includes("{") || trimmed.endsWith("{"))
        ) {
            const name = methodMatch[3];
            if (!["if", "for", "while", "switch", "catch", "try", "synchronized"].includes(name)) {
                const endLine = findBraceBlockEnd(lines, i);
                blocks.push({
                    id: `java-${blockId++}`,
                    label: `method ${name}`,
                    startLine: i + 1,
                    endLine,
                });
            }
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
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

interface EmbeddedBlock {
    type: "style" | "script";
    startLine: number;
    endLine: number;
    contentStartLine: number;
    contentEndLine: number;
}

function findEmbeddedBlocks(lines: string[]): EmbeddedBlock[] {
    const blocks: EmbeddedBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        const styleOpenMatch = line.match(/<style([^>]*)>/i);
        if (styleOpenMatch) {
            const startLine = i + 1;
            let contentStartLine = startLine;

            if (!line.match(/<style[^>]*>.*<\/style>/i)) {
                if (line.trim().endsWith(">") || line.includes("><")) {
                    contentStartLine = i + 2;
                }

                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/<\/style>/i)) {
                        blocks.push({
                            type: "style",
                            startLine,
                            endLine: j + 1,
                            contentStartLine,
                            contentEndLine: j + 1,
                        });
                        i = j;
                        break;
                    }
                }
            }
        }

        const scriptOpenMatch = line.match(/<script([^>]*)>/i);
        if (scriptOpenMatch) {
            const startLine = i + 1;
            let contentStartLine = startLine;

            if (!line.match(/<script[^>]*>.*<\/script>/i)) {
                if (line.trim().endsWith(">") || line.includes("><")) {
                    contentStartLine = i + 2;
                }

                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/<\/script>/i)) {
                        blocks.push({
                            type: "script",
                            startLine,
                            endLine: j + 1,
                            contentStartLine,
                            contentEndLine: j + 1,
                        });
                        i = j;
                        break;
                    }
                }
            }
        }

        i++;
    }

    return blocks;
}

function findCssRulesInRange(
    lines: string[],
    rangeStart: number,
    rangeEnd: number,
    idPrefix: string
): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;
    let currentSelector: { label: string; startLine: number } | null = null;
    let braceDepth = 0;

    for (let i = rangeStart; i < rangeEnd && i < lines.length; i++) {
        const line = lines[i];

        const atRuleMatch = line.match(/^\s*(@media|@keyframes|@supports|@font-face)\s*/);
        if (atRuleMatch && braceDepth === 0) {
            const atRule = atRuleMatch[1];
            const restOfLine = line.slice(line.indexOf(atRule) + atRule.length).trim();
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
                id: `${idPrefix}-${blockId++}`,
                label: currentSelector.label,
                startLine: currentSelector.startLine,
                endLine: i + 1,
            });
            currentSelector = null;
        }
    }

    return blocks;
}

function findJsTsSymbolsInRange(
    lines: string[],
    rangeStart: number,
    rangeEnd: number,
    idPrefix: string
): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let blockId = 0;

    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const functionPattern =
        /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)|^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>/;
    const constFuncPattern =
        /^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(function|\([^)]*\)\s*=>|\w+\s*=>)/;

    for (let i = rangeStart; i < rangeEnd && i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classPattern);
        if (classMatch) {
            const endLine = Math.min(findBraceBlockEnd(lines, i), rangeEnd);
            blocks.push({
                id: `${idPrefix}-${blockId++}`,
                label: `class ${classMatch[4]}`,
                startLine: i + 1,
                endLine,
            });
            continue;
        }

        const funcMatch = line.match(functionPattern);
        if (funcMatch) {
            const name = funcMatch[4] || funcMatch[8];
            if (name) {
                const endLine = Math.min(findBraceBlockEnd(lines, i), rangeEnd);
                blocks.push({
                    id: `${idPrefix}-${blockId++}`,
                    label: `function ${name}`,
                    startLine: i + 1,
                    endLine,
                });
            }
            continue;
        }

        const constFuncMatch = line.match(constFuncPattern);
        if (constFuncMatch) {
            const name = constFuncMatch[2];
            const endLine = Math.min(findBraceBlockEnd(lines, i), rangeEnd);
            blocks.push({
                id: `${idPrefix}-${blockId++}`,
                label: `function ${name}`,
                startLine: i + 1,
                endLine,
            });
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

function findMixedHtmlBlocks(lines: string[]): BlockEntry[] {
    const blocks: BlockEntry[] = [];
    let styleBlockId = 0;
    let scriptBlockId = 0;

    const htmlSections = findHtmlSections(lines);
    blocks.push(...htmlSections);

    const embeddedBlocks = findEmbeddedBlocks(lines);

    for (const embedded of embeddedBlocks) {
        if (embedded.type === "style") {
            blocks.push({
                id: `style-${styleBlockId}`,
                label: `<style> (lines ${embedded.startLine}-${embedded.endLine})`,
                startLine: embedded.startLine,
                endLine: embedded.endLine,
            });

            const cssRules = findCssRulesInRange(
                lines,
                embedded.contentStartLine - 1,
                embedded.contentEndLine - 1,
                `style${styleBlockId}-css`
            );
            blocks.push(...cssRules);
            styleBlockId++;
        } else if (embedded.type === "script") {
            blocks.push({
                id: `script-${scriptBlockId}`,
                label: `<script> (lines ${embedded.startLine}-${embedded.endLine})`,
                startLine: embedded.startLine,
                endLine: embedded.endLine,
            });

            const jsSymbols = findJsTsSymbolsInRange(
                lines,
                embedded.contentStartLine - 1,
                embedded.contentEndLine - 1,
                `script${scriptBlockId}-js`
            );
            blocks.push(...jsSymbols);
            scriptBlockId++;
        }
    }

    return blocks.sort((a, b) => a.startLine - b.startLine);
}

export const findBlocksTool: ToolDefinition<FindBlocksInput, FindBlocksOutput> = {
    name: "find_blocks",
    description:
        "Get a structural map of a file with line ranges but no content. " +
        "Returns block coordinates for navigation. Supports HTML (with embedded style/script), " +
        "CSS, JS/TS, Python, C#, PHP, and Java. For HTML files, automatically detects " +
        "embedded <style> and <script> blocks with their CSS rules and JS symbols. " +
        "Filter by kind: html_section, css_rule, js_ts_symbol, csharp_symbol, php_symbol, java_symbol, or all (auto-detect).",
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
                    "Filter blocks by kind: 'html_section', 'css_rule', 'js_ts_symbol', 'csharp_symbol', 'php_symbol', 'java_symbol', or 'all' (default: auto-detect from file extension)",
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
                blocks = findMixedHtmlBlocks(lines);
            } else if (langKind === "css") {
                blocks = findCssRules(lines);
            } else if (langKind === "js_ts") {
                blocks = findJsTsSymbols(lines);
            } else if (langKind === "python") {
                blocks = findPythonSymbols(lines);
            } else if (langKind === "csharp") {
                blocks = findCSharpSymbols(lines);
            } else if (langKind === "php") {
                blocks = findPhpSymbols(lines);
            } else if (langKind === "java") {
                blocks = findJavaSymbols(lines);
            } else {
                blocks = findJsTsSymbols(lines);
            }
        } else if (requestedKind === "html_section") {
            blocks = findHtmlSections(lines);
        } else if (requestedKind === "css_rule") {
            blocks = findCssRules(lines);
        } else if (requestedKind === "js_ts_symbol") {
            blocks = findJsTsSymbols(lines);
        } else if (requestedKind === "csharp_symbol") {
            blocks = findCSharpSymbols(lines);
        } else if (requestedKind === "php_symbol") {
            blocks = findPhpSymbols(lines);
        } else if (requestedKind === "java_symbol") {
            blocks = findJavaSymbols(lines);
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
