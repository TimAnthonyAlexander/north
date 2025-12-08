import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, basename } from "path";

const CURSOR_RULES_DIR = ".cursor/rules";
const MAX_TOTAL_SIZE = 30 * 1024;

export interface CursorRule {
    name: string;
    relativePath: string;
    body: string;
}

export interface LoadedCursorRules {
    rules: CursorRule[];
    text: string;
    truncated: boolean;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fmMatch) {
        return { frontmatter: {}, body: content };
    }

    const fmLines = fmMatch[1].split("\n");
    const frontmatter: Record<string, string> = {};

    for (const line of fmLines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            frontmatter[key] = value;
        }
    }

    return { frontmatter, body: fmMatch[2] };
}

function collectMdcFiles(dir: string, rulesRoot: string): string[] {
    const results: string[] = [];

    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return results;
    }

    for (const name of entries) {
        const fullPath = join(dir, name);
        let stat;
        try {
            stat = statSync(fullPath);
        } catch {
            continue;
        }

        if (stat.isDirectory()) {
            results.push(...collectMdcFiles(fullPath, rulesRoot));
        } else if (name.endsWith(".mdc")) {
            results.push(relative(rulesRoot, fullPath));
        }
    }

    return results;
}

export async function loadCursorRules(repoRoot: string): Promise<LoadedCursorRules | null> {
    const rulesDir = join(repoRoot, CURSOR_RULES_DIR);
    if (!existsSync(rulesDir)) {
        return null;
    }

    const mdcFiles = collectMdcFiles(rulesDir, rulesDir).sort();
    if (mdcFiles.length === 0) {
        return null;
    }

    const rules: CursorRule[] = [];
    let totalSize = 0;
    let truncated = false;

    for (const relPath of mdcFiles) {
        const fullPath = join(rulesDir, relPath);
        let content: string;
        try {
            content = readFileSync(fullPath, "utf-8");
        } catch {
            continue;
        }

        const { body } = parseFrontmatter(content);
        const name = basename(relPath, ".mdc");
        const pathInRulesDir = relPath;

        const ruleEntry = `## ${pathInRulesDir}\n\n${body.trim()}`;
        const entrySize = Buffer.byteLength(ruleEntry, "utf-8");

        if (totalSize + entrySize > MAX_TOTAL_SIZE) {
            truncated = true;
            break;
        }

        rules.push({ name, relativePath: pathInRulesDir, body: body.trim() });
        totalSize += entrySize;
    }

    if (rules.length === 0) {
        return null;
    }

    const parts = ["# Cursor Project Rules (.cursor/rules)", ""];
    for (const rule of rules) {
        parts.push(`## ${rule.relativePath}`);
        parts.push("");
        parts.push(rule.body);
        parts.push("");
    }

    if (truncated) {
        parts.push("[truncated]");
    }

    return {
        rules,
        text: parts.join("\n"),
        truncated,
    };
}

