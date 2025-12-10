import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    EditReplaceExactInput,
    EditPrepareResult,
} from "./types";
import { readFileContent, computeUnifiedDiff, preserveTrailingNewline } from "../utils/editing";

interface SimilarMatch {
    line: number;
    preview: string;
    similarity: string;
}

function findSimilarLines(
    lines: string[],
    searchText: string,
    maxResults: number = 5
): SimilarMatch[] {
    const searchLower = searchText.toLowerCase().trim();
    const searchWords = searchLower.split(/\s+/).filter((w) => w.length > 2);
    const matches: SimilarMatch[] = [];

    if (searchWords.length === 0) return [];

    for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        const matchingWords = searchWords.filter((word) => lineLower.includes(word));

        if (matchingWords.length >= Math.ceil(searchWords.length * 0.5)) {
            const preview = lines[i].length > 60 ? lines[i].slice(0, 60) + "..." : lines[i];
            matches.push({
                line: i + 1,
                preview,
                similarity: `${matchingWords.length}/${searchWords.length} words match`,
            });
        }

        if (matches.length >= maxResults) break;
    }

    return matches;
}

function findPartialMatches(
    content: string,
    searchText: string,
    maxResults: number = 3
): SimilarMatch[] {
    const lines = content.split("\n");
    const searchLines = searchText.split("\n");
    const matches: SimilarMatch[] = [];

    if (searchLines.length === 0) return [];

    const firstLine = searchLines[0].trim();
    if (firstLine.length < 5) return [];

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstLine) || lines[i].trim() === firstLine) {
            const preview = lines[i].length > 60 ? lines[i].slice(0, 60) + "..." : lines[i];
            matches.push({
                line: i + 1,
                preview,
                similarity: "first line matches",
            });
        }

        if (matches.length >= maxResults) break;
    }

    return matches;
}

export const editReplaceExactTool: ToolDefinition<EditReplaceExactInput, EditPrepareResult> = {
    name: "edit_replace_exact",
    description:
        "Replace exact text in a file. The 'old' text must match exactly (including whitespace). " +
        "Use read_file first to get the exact content. " +
        "Consider using anchor-based tools (edit_after_anchor, edit_before_anchor, edit_replace_block) for more reliable edits.",
    approvalPolicy: "write",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Path to the file (relative to repo root or absolute)",
            },
            old: {
                type: "string",
                description:
                    "Exact text to find and replace (must match exactly including whitespace)",
            },
            new: {
                type: "string",
                description: "Text to replace with",
            },
            expectedOccurrences: {
                type: "number",
                description:
                    "Expected number of occurrences. If provided, must match exactly or the operation fails.",
            },
        },
        required: ["path", "old", "new"],
    },

    async execute(
        args: EditReplaceExactInput,
        ctx: ToolContext
    ): Promise<ToolResult<EditPrepareResult>> {
        const result = readFileContent(ctx.repoRoot, args.path);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const original = result.content;
        const occurrences = original.split(args.old).length - 1;

        if (occurrences === 0) {
            const lines = original.split("\n");
            const similarLines = findSimilarLines(lines, args.old);
            const partialMatches = findPartialMatches(original, args.old);

            let errorMsg = `Text not found in file.`;

            if (partialMatches.length > 0) {
                errorMsg += ` Similar content found at:\n`;
                for (const match of partialMatches) {
                    errorMsg += `  - Line ${match.line}: "${match.preview}" (${match.similarity})\n`;
                }
                errorMsg += `Use read_file with aroundMatch to see the exact content, or use anchor-based editing.`;
            } else if (similarLines.length > 0) {
                errorMsg += ` Lines with similar words found at:\n`;
                for (const match of similarLines) {
                    errorMsg += `  - Line ${match.line}: "${match.preview}" (${match.similarity})\n`;
                }
                errorMsg += `Use read_file to verify the exact content you want to replace.`;
            } else {
                errorMsg += ` Use read_file to verify the exact content, or search_text to find similar content.`;
            }

            return { ok: false, error: errorMsg };
        }

        if (args.expectedOccurrences !== undefined && occurrences !== args.expectedOccurrences) {
            return {
                ok: false,
                error: `Expected ${args.expectedOccurrences} occurrence(s) but found ${occurrences}. Use read_file to verify the content.`,
            };
        }

        const rawModified = original.split(args.old).join(args.new);
        const modified = preserveTrailingNewline(original, rawModified);
        const fileDiff = computeUnifiedDiff(original, modified, args.path);

        return {
            ok: true,
            data: {
                diffsByFile: [fileDiff],
                applyPayload: [
                    {
                        type: "replace",
                        path: args.path,
                        content: modified,
                        originalContent: original,
                    },
                ],
                stats: {
                    filesChanged: 1,
                    totalLinesAdded: fileDiff.linesAdded,
                    totalLinesRemoved: fileDiff.linesRemoved,
                },
            },
        };
    },
};
