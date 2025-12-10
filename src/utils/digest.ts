export interface ToolOutputCache {
    outputId: string;
    fullOutput: unknown;
    toolName: string;
    timestamp: number;
}

export interface DigestResult {
    digestedResult: { ok: boolean; data?: unknown; error?: string };
    outputId: string;
    wasDigested: boolean;
}

const outputCache = new Map<string, ToolOutputCache>();
let outputIdCounter = 0;

function generateOutputId(): string {
    outputIdCounter++;
    return `out_${Date.now().toString(36)}_${outputIdCounter.toString(36)}`;
}

export function clearOutputCache(): void {
    outputCache.clear();
}

export function getCachedOutput(outputId: string): ToolOutputCache | undefined {
    return outputCache.get(outputId);
}

export function getCachedOutputRange(
    outputId: string,
    startLine?: number,
    endLine?: number
): string | null {
    const cached = outputCache.get(outputId);
    if (!cached) return null;

    const fullStr = JSON.stringify(cached.fullOutput, null, 2);
    if (startLine === undefined && endLine === undefined) {
        return fullStr;
    }

    const lines = fullStr.split("\n");
    const start = Math.max(0, (startLine ?? 1) - 1);
    const end = Math.min(lines.length, endLine ?? lines.length);
    return lines.slice(start, end).join("\n");
}

function digestReadFileOutput(data: {
    content: string;
    path: string;
    startLine: number;
    endLine: number;
    truncated: boolean;
    totalLines?: number;
}): DigestResult {
    const lines = data.content.split("\n");
    const totalLines = data.totalLines ?? lines.length;

    if (lines.length <= 60) {
        return {
            digestedResult: { ok: true, data },
            outputId: "",
            wasDigested: false,
        };
    }

    const outputId = generateOutputId();
    outputCache.set(outputId, {
        outputId,
        fullOutput: data,
        toolName: "read_file",
        timestamp: Date.now(),
    });

    const headLines = lines.slice(0, 50);
    const tailLines = lines.slice(-10);
    const omitted = lines.length - 60;

    const digestContent = [
        `[Lines ${data.startLine}-${data.startLine + 49} of ${totalLines}]`,
        ...headLines,
        "",
        `[... ${omitted} lines omitted ...]`,
        "",
        `[Lines ${data.endLine - 9}-${data.endLine}]`,
        ...tailLines,
    ].join("\n");

    return {
        digestedResult: {
            ok: true,
            data: {
                ...data,
                content: digestContent,
                truncated: true,
                totalLines,
                outputId,
                digestNote: `Full output cached. Use expand_output with outputId "${outputId}" to retrieve specific ranges.`,
            },
        },
        outputId,
        wasDigested: true,
    };
}

function digestSearchTextOutput(data: {
    matches: Array<{ path: string; line: number; column: number; preview: string }>;
    truncated: boolean;
}): DigestResult {
    if (data.matches.length <= 10) {
        return {
            digestedResult: { ok: true, data },
            outputId: "",
            wasDigested: false,
        };
    }

    const outputId = generateOutputId();
    outputCache.set(outputId, {
        outputId,
        fullOutput: data,
        toolName: "search_text",
        timestamp: Date.now(),
    });

    const digestedMatches = data.matches.slice(0, 10);

    return {
        digestedResult: {
            ok: true,
            data: {
                matches: digestedMatches,
                truncated: true,
                totalMatches: data.matches.length,
                outputId,
                digestNote: `Showing first 10 of ${data.matches.length} matches. Use expand_output with outputId "${outputId}" to see all.`,
            },
        },
        outputId,
        wasDigested: true,
    };
}

function digestFindFilesOutput(data: { files: string[]; truncated: boolean }): DigestResult {
    if (data.files.length <= 20) {
        return {
            digestedResult: { ok: true, data },
            outputId: "",
            wasDigested: false,
        };
    }

    const outputId = generateOutputId();
    outputCache.set(outputId, {
        outputId,
        fullOutput: data,
        toolName: "find_files",
        timestamp: Date.now(),
    });

    const digestedFiles = data.files.slice(0, 20);

    return {
        digestedResult: {
            ok: true,
            data: {
                files: digestedFiles,
                truncated: true,
                totalFiles: data.files.length,
                outputId,
                digestNote: `Showing first 20 of ${data.files.length} files. Use expand_output with outputId "${outputId}" to see all.`,
            },
        },
        outputId,
        wasDigested: true,
    };
}

function digestShellRunOutput(data: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
}): DigestResult {
    const stdoutLines = data.stdout.split("\n");
    const stderrLines = data.stderr.split("\n");
    const totalLines = stdoutLines.length + stderrLines.length;

    if (totalLines <= 40) {
        return {
            digestedResult: { ok: true, data },
            outputId: "",
            wasDigested: false,
        };
    }

    const outputId = generateOutputId();
    outputCache.set(outputId, {
        outputId,
        fullOutput: data,
        toolName: "shell_run",
        timestamp: Date.now(),
    });

    let digestedStdout = data.stdout;
    if (stdoutLines.length > 30) {
        const headStdout = stdoutLines.slice(0, 20);
        const tailStdout = stdoutLines.slice(-10);
        const omittedStdout = stdoutLines.length - 30;
        digestedStdout = [
            ...headStdout,
            "",
            `[... ${omittedStdout} lines omitted from stdout ...]`,
            "",
            ...tailStdout,
        ].join("\n");
    }

    let digestedStderr = data.stderr;
    if (stderrLines.length > 10) {
        const tailStderr = stderrLines.slice(-10);
        const omittedStderr = stderrLines.length - 10;
        digestedStderr = [
            `[... ${omittedStderr} lines omitted from stderr ...]`,
            "",
            ...tailStderr,
        ].join("\n");
    }

    return {
        digestedResult: {
            ok: true,
            data: {
                stdout: digestedStdout,
                stderr: digestedStderr,
                exitCode: data.exitCode,
                durationMs: data.durationMs,
                outputId,
                digestNote: `Output truncated. Use expand_output with outputId "${outputId}" to see full output.`,
            },
        },
        outputId,
        wasDigested: true,
    };
}

export function digestToolOutput(
    toolName: string,
    result: { ok: boolean; data?: unknown; error?: string }
): DigestResult {
    if (!result.ok || !result.data) {
        return {
            digestedResult: result,
            outputId: "",
            wasDigested: false,
        };
    }

    switch (toolName) {
        case "read_file":
            return digestReadFileOutput(
                result.data as {
                    content: string;
                    path: string;
                    startLine: number;
                    endLine: number;
                    truncated: boolean;
                    totalLines?: number;
                }
            );

        case "search_text":
            return digestSearchTextOutput(
                result.data as {
                    matches: Array<{ path: string; line: number; column: number; preview: string }>;
                    truncated: boolean;
                }
            );

        case "find_files":
            return digestFindFilesOutput(result.data as { files: string[]; truncated: boolean });

        case "shell_run": {
            const shellData = result.data as {
                stdout?: string;
                stderr?: string;
                exitCode?: number;
                durationMs?: number;
            };
            if (
                shellData.stdout !== undefined &&
                shellData.stderr !== undefined &&
                shellData.exitCode !== undefined &&
                shellData.durationMs !== undefined
            ) {
                return digestShellRunOutput(
                    shellData as {
                        stdout: string;
                        stderr: string;
                        exitCode: number;
                        durationMs: number;
                    }
                );
            }
            break;
        }
    }

    return {
        digestedResult: result,
        outputId: "",
        wasDigested: false,
    };
}
