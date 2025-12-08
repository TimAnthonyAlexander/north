import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const helpCommand: CommandDefinition = {
    name: "help",
    description: "List available commands",
    usage: "/help",

    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        const commands = ctx.listCommands();
        const lines = commands.map((cmd) => `  /${cmd.name} - ${cmd.description}`);
        const message = "Available commands:\n" + lines.join("\n");
        return { ok: true, message };
    },
};
