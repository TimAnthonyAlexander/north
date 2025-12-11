import type {
    CommandDefinition,
    CommandContext,
    ParsedArgs,
    CommandResult,
    PickerOption,
} from "../types";
import { MODELS, resolveModelId, getModelDisplay, getBaseModelId } from "../models";
import { saveSelectedModel } from "../../storage/config";
import { getModelPricing } from "../../utils/pricing";

export const modelCommand: CommandDefinition = {
    name: "model",
    description: "Switch model (persisted globally)",
    usage: "/model [modelId]",

    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        if (args.positional.length > 0) {
            const input = args.positional[0];
            const resolvedId = resolveModelId(input);

            if (!resolvedId) {
                const aliases = MODELS.map((m) => m.alias).join(", ");
                return {
                    ok: false,
                    error: `Unknown model: ${input}. Available aliases: ${aliases}`,
                };
            }

            ctx.setModel(resolvedId);
            saveSelectedModel(resolvedId);
            return {
                ok: true,
                message: `Switched to ${getModelDisplay(resolvedId)}`,
            };
        }

        const options: PickerOption[] = MODELS.map((m) => {
            const baseModelId = getBaseModelId(m.pinned);
            const pricing = getModelPricing(baseModelId);
            const pricingHint = pricing
                ? `$${pricing.inputPerMillion}/$${pricing.outputPerMillion} per 1M`
                : "";
            const hint = pricingHint ? `${m.alias} • ${pricingHint}` : m.alias;
            return {
                id: m.pinned,
                label: m.display,
                hint,
            };
        });

        const selected = await ctx.showPicker("model", "Select model", options);

        if (!selected) {
            return { ok: true, message: "Model selection cancelled" };
        }

        ctx.setModel(selected);
        saveSelectedModel(selected);
        return {
            ok: true,
            message: `Switched to ${getModelDisplay(selected)}`,
        };
    },
};
