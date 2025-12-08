import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const summarizeCommand: CommandDefinition = {
    name: "summarize",
    description: "Summarize conversation and trim transcript",
    usage: "/summarize [--keep-last N]",

    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        let keepLast = 10;

        if (args.flags["keep-last"]) {
            const value = args.flags["keep-last"];
            if (typeof value === "string") {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    keepLast = parsed;
                }
            }
        }

        if (args.positional.length > 0) {
            const parsed = parseInt(args.positional[0], 10);
            if (!isNaN(parsed) && parsed > 0) {
                keepLast = parsed;
            }
        }

        const transcript = ctx.getTranscript() as Array<{ role: string }>;
        const userAssistantCount = transcript.filter(
            (e) => e.role === "user" || e.role === "assistant"
        ).length;

        if (userAssistantCount < 2) {
            return {
                ok: false,
                error: "Not enough conversation to summarize",
            };
        }

        const summary = await ctx.generateSummary();

        if (!summary) {
            return {
                ok: false,
                error: "Failed to generate summary",
            };
        }

        ctx.setRollingSummary(summary);
        ctx.trimTranscript(keepLast);

        const parts: string[] = [];
        if (summary.goal) parts.push(`Goal: ${summary.goal}`);
        if (summary.decisions.length > 0) parts.push(`${summary.decisions.length} decisions`);
        if (summary.openTasks.length > 0) parts.push(`${summary.openTasks.length} open tasks`);
        if (summary.importantFiles.length > 0)
            parts.push(`${summary.importantFiles.length} files tracked`);

        const summaryText = parts.length > 0 ? parts.join(", ") : "Summary created";

        return {
            ok: true,
            message: `Conversation summarized (keeping last ${keepLast}). ${summaryText}`,
        };
    },
};
