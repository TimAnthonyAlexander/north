import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { ToolDefinition, ToolContext, ToolResult, ReadReadmeOutput } from "./types";

const MAX_CONTENT_LENGTH = 8000;
const README_PATTERNS = [
    /^readme\.md$/i,
    /^readme\.txt$/i,
    /^readme$/i,
    /^readme\.rst$/i,
    /^readme\.markdown$/i,
];

function findReadme(repoRoot: string): string | null {
    let entries: string[];
    try {
        entries = readdirSync(repoRoot);
    } catch {
        return null;
    }

    for (const pattern of README_PATTERNS) {
        for (const entry of entries) {
            if (pattern.test(entry)) {
                const fullPath = join(repoRoot, entry);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isFile()) {
                        return entry;
                    }
                } catch { }
            }
        }
    }

    return null;
}

export const readReadmeTool: ToolDefinition<void, ReadReadmeOutput> = {
    name: "read_readme",
    description:
        "Find and read the README file from the repository root. Looks for README.md, README.txt, README, etc.",
    inputSchema: {
        type: "object",
        properties: {},
    },
    async execute(_args: void, ctx: ToolContext): Promise<ToolResult<ReadReadmeOutput>> {
        const readmeName = findReadme(ctx.repoRoot);

        if (!readmeName) {
            return { ok: false, error: "No README file found in repository root" };
        }

        const fullPath = join(ctx.repoRoot, readmeName);
        let content: string;

        try {
            content = readFileSync(fullPath, "utf-8");
        } catch (err) {
            return { ok: false, error: `Cannot read README: ${readmeName}` };
        }

        let truncated = false;
        if (content.length > MAX_CONTENT_LENGTH) {
            content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[... content truncated ...]";
            truncated = true;
        }

        return {
            ok: true,
            data: {
                path: readmeName,
                content,
                truncated,
            },
        };
    },
};

