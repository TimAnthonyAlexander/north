import type { ToolDefinition, ToolContext, ToolResult, ShellRunInput, ShellRunOutput } from "./types";
import { getShellService } from "../shell/index";

export const shellRunTool: ToolDefinition<ShellRunInput, ShellRunOutput> = {
    name: "shell_run",
    description: "Execute a shell command in a persistent PTY session. The session maintains state (working directory, environment) across calls. Commands that require user interaction or run indefinitely should be avoided.",
    inputSchema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute",
            },
            cwd: {
                type: "string",
                description: "Working directory override for this command (optional, defaults to repo root)",
            },
            timeoutMs: {
                type: "number",
                description: "Timeout in milliseconds (optional, defaults to 60000)",
            },
        },
        required: ["command"],
    },
    approvalPolicy: "shell",

    async execute(args: ShellRunInput, ctx: ToolContext): Promise<ToolResult<ShellRunOutput>> {
        const { command, cwd, timeoutMs } = args;

        if (!command || typeof command !== "string") {
            return { ok: false, error: "command is required and must be a string" };
        }

        const trimmedCommand = command.trim();
        if (!trimmedCommand) {
            return { ok: false, error: "command cannot be empty" };
        }

        try {
            const shellService = getShellService(ctx.repoRoot, ctx.logger);
            const result = await shellService.run(trimmedCommand, {
                cwd: cwd || undefined,
                timeoutMs: timeoutMs || undefined,
            });

            return {
                ok: true,
                data: {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
    },
};

