import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";
import { getModelThinkingConfig } from "../models";

export const thinkingCommand: CommandDefinition = {
    name: "thinking",
    description: "Toggle extended thinking on/off",
    usage: "/thinking [on|off]",

    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        const currentModel = ctx.getModel();
        const modelSupportsThinking = getModelThinkingConfig(currentModel) !== undefined;

        if (!modelSupportsThinking) {
            return {
                ok: false,
                error: `Current model does not support extended thinking`,
            };
        }

        if (args.positional.length > 0) {
            const arg = args.positional[0].toLowerCase();
            if (arg === "on" || arg === "true" || arg === "1") {
                ctx.setThinking(true);
                return { ok: true, message: "Extended thinking enabled" };
            } else if (arg === "off" || arg === "false" || arg === "0") {
                ctx.setThinking(false);
                return { ok: true, message: "Extended thinking disabled" };
            } else {
                return {
                    ok: false,
                    error: `Invalid argument: ${arg}. Use 'on' or 'off'`,
                };
            }
        }

        const current = ctx.isThinkingEnabled();
        ctx.setThinking(!current);
        return {
            ok: true,
            message: `Extended thinking ${!current ? "enabled" : "disabled"}`,
        };
    },
};
