import type { ToolDefinition, ToolContext, ToolResult, FindFilesInput, FindFilesOutput } from "./types";
import { createIgnoreChecker, walkDirectory } from "../utils/ignore";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function patternToRegex(pattern: string): RegExp {
  let regexStr = "";

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        regexStr += ".*";
        i++;
      } else {
        regexStr += "[^/]*";
      }
    } else if (char === "?") {
      regexStr += "[^/]";
    } else if (char === "[") {
      const closeIdx = pattern.indexOf("]", i);
      if (closeIdx !== -1) {
        regexStr += pattern.slice(i, closeIdx + 1);
        i = closeIdx;
      } else {
        regexStr += "\\[";
      }
    } else if (".^$+{}|()\\".includes(char)) {
      regexStr += "\\" + char;
    } else {
      regexStr += char;
    }
  }

  return new RegExp(regexStr, "i");
}

export const findFilesTool: ToolDefinition<FindFilesInput, FindFilesOutput> = {
  name: "find_files",
  description:
    "Find files matching a glob-like pattern. Supports * (any chars except /), ** (any chars including /), and ? (single char). Case-insensitive.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description:
          "Glob pattern to match file paths. Examples: '*.ts', 'src/**/*.tsx', 'README*', '**/test/**'",
      },
      limit: {
        type: "number",
        description: `Maximum number of files to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
      },
    },
    required: ["pattern"],
  },
  async execute(args: FindFilesInput, ctx: ToolContext): Promise<ToolResult<FindFilesOutput>> {
    if (!args.pattern) {
      return { ok: false, error: "Pattern is required" };
    }

    const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);
    const checker = createIgnoreChecker(ctx.repoRoot);
    const entries = walkDirectory(ctx.repoRoot, checker, { maxFiles: 10000, maxDepth: 12 });

    const regex = patternToRegex(args.pattern);
    const matchedFiles: string[] = [];
    let truncated = false;

    for (const entry of entries) {
      if (entry.isDir) continue;

      if (regex.test(entry.relativePath)) {
        if (matchedFiles.length >= limit) {
          truncated = true;
          break;
        }
        matchedFiles.push(entry.relativePath);
      }
    }

    return {
      ok: true,
      data: {
        files: matchedFiles,
        truncated,
      },
    };
  },
};

