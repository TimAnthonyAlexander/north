import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

export const resumeCommand: CommandDefinition = {
    name: "resume",
    description: "Switch to another conversation by ID",
    usage: "/resume <conversation-id>",

    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        const targetId = args.positional[0];

        if (!targetId) {
            return { ok: false, error: "Usage: /resume <conversation-id>" };
        }

        const currentId = ctx.getConversationId();
        if (targetId === currentId) {
            return { ok: true, message: "Already in this conversation" };
        }

        const result = await ctx.switchConversation(targetId);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        return { ok: true, message: `Switched to conversation ${targetId}` };
    },
};
