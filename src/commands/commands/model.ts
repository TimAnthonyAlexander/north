import type {
    CommandDefinition,
    CommandContext,
    ParsedArgs,
    CommandResult,
    PickerOption,
} from "../types";
import {
    getModels,
    resolveModelId,
    getModelDisplay,
    getBaseModelId,
    refreshOpenRouterModelsIfStale,
} from "../models";
import { saveSelectedModel } from "../../storage/config";
import { getModelPricing } from "../../utils/pricing";

const PROVIDER_ORDER: Record<string, number> = {
    anthropic: 0, // Claude first
    openai: 1, // GPT next
    openrouter: 2, // OpenRouter after
};

function formatPrice(value: number): string {
    return Number(value.toFixed(3)).toString();
}

export const modelCommand: CommandDefinition = {
    name: "model",
    description: "Switch model (persisted globally)",
    usage: "/model [modelId]",

    async execute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
        await refreshOpenRouterModelsIfStale();

        if (args.positional.length > 0) {
            const input = args.positional[0];
            const resolvedId = resolveModelId(input);

            if (!resolvedId) {
                const aliases = getModels()
                    .map((m) => m.alias)
                    .join(", ");
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

        const models = getModels();
        const optionsWithPricing = models.map((m) => {
            const baseModelId = getBaseModelId(m.pinned);
            const pricing = getModelPricing(baseModelId);
            const totalCost = pricing ? pricing.inputPerMillion + pricing.outputPerMillion : 0;
            const pricingHint = pricing
                ? `[PRICE]$${formatPrice(pricing.inputPerMillion)}/${formatPrice(
                      pricing.outputPerMillion
                  )} per 1M[/PRICE]`
                : "";
            const hint = pricingHint ? `${m.alias} ${pricingHint}` : m.alias;
            return {
                id: m.pinned,
                label: m.display,
                hint,
                totalCost,
                providerOrder: PROVIDER_ORDER[m.provider] ?? 99,
            };
        });

        // Order: Claude (anthropic) first, GPT (openai) next, OpenRouter after, each group by price desc
        optionsWithPricing.sort((a, b) => {
            if (a.providerOrder !== b.providerOrder) {
                return a.providerOrder - b.providerOrder;
            }
            return b.totalCost - a.totalCost;
        });

        const options: PickerOption[] = optionsWithPricing.map((o) => ({
            id: o.id,
            label: o.label,
            hint: o.hint,
        }));

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
