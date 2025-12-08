import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const newCommand: CommandDefinition = {
    name: "new",
    description: "Start a new chat (clears transcript and summary)",
    usage: "/new",
    
    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        ctx.resetChat();
        return { ok: true, message: "Started new chat" };
    },
};

