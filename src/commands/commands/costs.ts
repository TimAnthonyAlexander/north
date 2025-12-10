import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const costsCommand: CommandDefinition = {
    name: "costs",
    description: "Show cost breakdown by model",
    usage: "/costs",

    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        ctx.showCostsDialog();
        return { ok: true };
    },
};
