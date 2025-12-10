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

interface WhitespaceDiagnosis {
    issues: string[];
    hint: string | null;
}

function detectWhitespaceMismatch(searchText: string, content: string): WhitespaceDiagnosis {
    const issues: string[] = [];

    const searchHasTabs = searchText.includes("\t");
    const searchHasSpaceIndent = /^ {2,}/m.test(searchText);
    const contentHasTabs = content.includes("\t");
    const contentHasSpaceIndent = /^ {2,}/m.test(content);

    if (searchHasTabs && !contentHasTabs && contentHasSpaceIndent) {
        issues.push("Your search uses tabs but file uses spaces for indentation");
    } else if (searchHasSpaceIndent && !contentHasSpaceIndent && contentHasTabs) {
        issues.push("Your search uses spaces but file uses tabs for indentation");
    }

    const searchHasCRLF = searchText.includes("\r\n");
    const contentHasCRLF = content.includes("\r\n");

    if (searchHasCRLF && !contentHasCRLF) {
        issues.push("Your search uses CRLF (\\r\\n) but file uses LF (\\n) line endings");
    } else if (!searchHasCRLF && contentHasCRLF) {
        issues.push("Your search uses LF (\\n) but file uses CRLF (\\r\\n) line endings");
    }

    const searchHasTrailing = /[ \t]+$/m.test(searchText);
    const searchLines = searchText.split("\n");
    const firstSearchLine = searchLines[0];

    if (searchHasTrailing) {
        const contentLines = content.split("\n");
        const hasMatchingLineWithoutTrailing = contentLines.some(
            (line) => line.trimEnd() === firstSearchLine.trimEnd() && line !== firstSearchLine
        );
        if (hasMatchingLineWithoutTrailing) {
            issues.push("Your search has trailing whitespace that doesn't exist in the file");
        }
    }

    let hint: string | null = null;
    if (issues.length > 0) {
        hint = "Try using read_file with aroundMatch to copy the exact text, including whitespace.";
    }

    return { issues, hint };
}

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    if (a.length > 200 || b.length > 200) {
        return Math.abs(a.length - b.length) + (a === b ? 0 : 1);
    }

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

interface NearMissCandidate {
    line: number;
    preview: string;
    distance: number;
    diffHint: string;
}

function findNearMissCandidates(
    content: string,
    searchText: string,
    maxResults: number = 3
): NearMissCandidate[] {
    const contentLines = content.split("\n");
    const searchLines = searchText.split("\n");
    const candidates: NearMissCandidate[] = [];

    if (searchLines.length === 0) return [];

    const firstSearchLine = searchLines[0].trim();
    if (firstSearchLine.length < 3) return [];

    for (let i = 0; i < contentLines.length; i++) {
        const contentLine = contentLines[i];
        const contentTrimmed = contentLine.trim();

        if (contentTrimmed.length === 0) continue;

        const distance = levenshteinDistance(firstSearchLine, contentTrimmed);
        const threshold = Math.max(5, Math.floor(firstSearchLine.length * 0.3));

        if (distance > 0 && distance <= threshold) {
            let diffHint = "";

            if (contentTrimmed.length !== firstSearchLine.length) {
                diffHint = `length differs: ${firstSearchLine.length} vs ${contentTrimmed.length} chars`;
            } else {
                let diffCount = 0;
                let firstDiffPos = -1;
                for (let j = 0; j < firstSearchLine.length; j++) {
                    if (firstSearchLine[j] !== contentTrimmed[j]) {
                        diffCount++;
                        if (firstDiffPos === -1) firstDiffPos = j;
                    }
                }
                if (diffCount <= 3 && firstDiffPos !== -1) {
                    diffHint = `differs at position ${firstDiffPos + 1}: '${firstSearchLine[firstDiffPos]}' vs '${contentTrimmed[firstDiffPos]}'`;
                } else {
                    diffHint = `${distance} character(s) different`;
                }
            }

            const preview =
                contentLine.length > 60 ? contentLine.slice(0, 60) + "..." : contentLine;
            candidates.push({ line: i + 1, preview, distance, diffHint });
        }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, maxResults);
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
            const wsDiagnosis = detectWhitespaceMismatch(args.old, original);
            const nearMisses = findNearMissCandidates(original, args.old);
            const similarLines = findSimilarLines(lines, args.old);
            const partialMatches = findPartialMatches(original, args.old);

            let errorMsg = `Text not found in file.`;

            if (wsDiagnosis.issues.length > 0) {
                errorMsg += `\n\nPossible whitespace issues:\n`;
                for (const issue of wsDiagnosis.issues) {
                    errorMsg += `  - ${issue}\n`;
                }
            }

            if (nearMisses.length > 0) {
                errorMsg += `\n\nNear matches found:\n`;
                for (const candidate of nearMisses) {
                    errorMsg += `  - Line ${candidate.line}: "${candidate.preview}"\n`;
                    errorMsg += `    (${candidate.diffHint})\n`;
                }
            } else if (partialMatches.length > 0) {
                errorMsg += `\n\nSimilar content found:\n`;
                for (const match of partialMatches) {
                    errorMsg += `  - Line ${match.line}: "${match.preview}" (${match.similarity})\n`;
                }
            } else if (similarLines.length > 0) {
                errorMsg += `\n\nLines with similar words:\n`;
                for (const match of similarLines) {
                    errorMsg += `  - Line ${match.line}: "${match.preview}" (${match.similarity})\n`;
                }
            }

            errorMsg += `\n\nHint: Use read_file with aroundMatch to see exact content, or use anchor-based editing (edit_by_anchor).`;

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
