import type {
    CommandDefinition,
    CommandContext,
    CommandResult,
    ParsedArgs,
    PickerOption,
} from "../types";

const MODE_OPTIONS: PickerOption[] = [
    { id: "ask", label: "Ask", hint: "Read-only mode - no edits or commands" },
    { id: "agent", label: "Agent", hint: "Full mode with all tools" },
];

export const modeCommand: CommandDefinition = {
    name: "mode",
    description: "Switch conversation mode (ask/agent)",
    usage: "/mode [ask|agent]",
    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        const modeArg = args.positional[0]?.toLowerCase();

        if (modeArg) {
            if (!["ask", "agent"].includes(modeArg)) {
                return {
                    ok: false,
                    error: "Invalid mode. Use: ask or agent",
                };
            }

            return {
                ok: true,
                message: `Mode set to ${modeArg} for next message`,
            };
        }

        const selectedId = await ctx.showPicker("mode", "Select mode:", MODE_OPTIONS);

        if (!selectedId) {
            return {
                ok: false,
                error: "Mode selection cancelled",
            };
        }

        return {
            ok: true,
            message: `Mode set to ${selectedId} for next message`,
        };
    },
};
