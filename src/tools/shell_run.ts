import type { ToolDefinition, ToolContext, ToolResult, ShellRunInput, ShellRunOutput } from "./types";

export const shellRunTool: ToolDefinition<ShellRunInput, ShellRunOutput> = {
    name: "shell_run",
    description: "Execute a shell command in a persistent PTY session. The session maintains state (working directory, environment) across calls. Commands that require user interaction or run indefinitely should be avoided. Note: stderr is merged into stdout in the PTY output.",
    inputSchema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute",
            },
            cwd: {
                type: "string",
                description: "Working directory override for this command (optional, defaults to repo root). Can be null.",
            },
            timeoutMs: {
                type: "number",
                description: "Timeout in milliseconds (optional, defaults to 60000). On timeout, the PTY session is destroyed and recreated.",
            },
        },
        required: ["command"],
    },
    approvalPolicy: "shell",

    async execute(_args: ShellRunInput, _ctx: ToolContext): Promise<ToolResult<ShellRunOutput>> {
        return {
            ok: false,
            error: "shell_run must be executed through the orchestrator's approval flow",
        };
    },
};
