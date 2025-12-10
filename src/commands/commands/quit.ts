import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const quitCommand: CommandDefinition = {
    name: "quit",
    description: "Exit North",
    usage: "/quit",

    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        const conversationId = ctx.getConversationId();
        ctx.requestExit();
        return {
            ok: true,
            message: `Exiting...\nTo resume this conversation: north resume ${conversationId}`,
        };
    },
};
