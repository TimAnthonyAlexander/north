import { spawnSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join, relative } from "path";
import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    HotfilesInput,
    HotfilesOutput,
    HotfileEntry,
} from "./types";
import { createIgnoreChecker, walkDirectory } from "../utils/ignore";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function hasGit(repoRoot: string): boolean {
    return existsSync(join(repoRoot, ".git"));
}

function getGitHotfiles(repoRoot: string, limit: number): HotfileEntry[] {
    const result = spawnSync(
        "git",
        ["log", "--name-only", "--pretty=format:", "--since=6 months ago", "-n", "500"],
        {
            cwd: repoRoot,
            encoding: "utf-8",
            maxBuffer: 5 * 1024 * 1024,
        }
    );

    if (result.status !== 0) {
        return [];
    }

    const fileCounts = new Map<string, number>();
    const lines = (result.stdout || "").split("\n").filter(Boolean);

    for (const line of lines) {
        const filePath = line.trim();
        if (!filePath) continue;

        const fullPath = join(repoRoot, filePath);
        if (!existsSync(fullPath)) continue;

        try {
            const stat = statSync(fullPath);
            if (!stat.isFile()) continue;
        } catch {
            continue;
        }

        fileCounts.set(filePath, (fileCounts.get(filePath) || 0) + 1);
    }

    return Array.from(fileCounts.entries())
        .map(([path, count]) => ({
            path,
            score: count,
            reason: `${count} commits in last 6 months`,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function getFallbackHotfiles(repoRoot: string, limit: number): HotfileEntry[] {
    const checker = createIgnoreChecker(repoRoot);
    const entries = walkDirectory(repoRoot, checker, { maxFiles: 5000, maxDepth: 8 });

    const codeExtensions = new Set([
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".py",
        ".rs",
        ".go",
        ".java",
        ".kt",
        ".swift",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".rb",
        ".php",
    ]);

    const importantPatterns = [
        /^src\//,
        /^lib\//,
        /^app\//,
        /index\.[jt]sx?$/,
        /main\.[jt]sx?$/,
        /mod\.rs$/,
        /main\.go$/,
        /app\.py$/,
    ];

    function getExtension(path: string): string {
        const lastDot = path.lastIndexOf(".");
        return lastDot !== -1 ? path.slice(lastDot).toLowerCase() : "";
    }

    const scoredFiles = entries
        .filter((e) => !e.isDir && codeExtensions.has(getExtension(e.relativePath)))
        .map((entry) => {
            let score = entry.size;

            for (const pattern of importantPatterns) {
                if (pattern.test(entry.relativePath)) {
                    score *= 2;
                    break;
                }
            }

            const depth = entry.relativePath.split("/").length;
            if (depth <= 2) score *= 1.5;

            return {
                path: entry.relativePath,
                score: Math.round(score),
                reason: `${Math.round(entry.size / 1024)}KB, depth ${depth}`,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scoredFiles;
}

export const hotfilesTool: ToolDefinition<HotfilesInput, HotfilesOutput> = {
    name: "hotfiles",
    description:
        "Find the most frequently modified files (using git history if available) or important files based on size and location.",
    inputSchema: {
        type: "object",
        properties: {
            limit: {
                type: "number",
                description: `Maximum number of files to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
            },
        },
    },
    async execute(args: HotfilesInput, ctx: ToolContext): Promise<ToolResult<HotfilesOutput>> {
        const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

        if (hasGit(ctx.repoRoot)) {
            const gitFiles = getGitHotfiles(ctx.repoRoot, limit);
            if (gitFiles.length > 0) {
                return {
                    ok: true,
                    data: {
                        files: gitFiles,
                        method: "git",
                    },
                };
            }
        }

        const fallbackFiles = getFallbackHotfiles(ctx.repoRoot, limit);

        return {
            ok: true,
            data: {
                files: fallbackFiles,
                method: "fallback",
            },
        };
    },
};

