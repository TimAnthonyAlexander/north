import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";
import { clearDeclined } from "../../storage/profile";

export const learnCommand: CommandDefinition = {
    name: "learn",
    description: "Learn or relearn the project codebase",
    usage: "/learn",

    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        clearDeclined(ctx.repoRoot);
        ctx.triggerLearning();

        return {
            ok: true,
            message: "Starting learning session...",
        };
    },
};

