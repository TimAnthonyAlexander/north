import {
    loadOpenRouterModelCache,
    saveOpenRouterModelCache,
    type OpenRouterModelCacheEntry,
} from "../storage/openrouterModels";

export type ProviderType = "anthropic" | "openai" | "openrouter";

export interface ModelInfo {
    alias: string;
    pinned: string;
    display: string;
    contextLimitTokens: number;
    provider: ProviderType;
    supportsThinking?: boolean;
    thinkingBudget?: number;
}

const BASE_MODELS: readonly ModelInfo[] = [
    {
        alias: "sonnet-4",
        pinned: "claude-sonnet-4-20250514",
        display: "Claude Sonnet 4",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "sonnet-4-thinking",
        pinned: "claude-sonnet-4-20250514-thinking",
        display: "Claude Sonnet 4 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 8_000,
    },
    {
        alias: "opus-4",
        pinned: "claude-opus-4-20250514",
        display: "Claude Opus 4",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "opus-4-thinking",
        pinned: "claude-opus-4-20250514-thinking",
        display: "Claude Opus 4 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 16_000,
    },
    {
        alias: "opus-4-1",
        pinned: "claude-opus-4-1-20250805",
        display: "Claude Opus 4.1",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "opus-4-1-thinking",
        pinned: "claude-opus-4-1-20250805-thinking",
        display: "Claude Opus 4.1 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 16_000,
    },
    {
        alias: "sonnet-4-5",
        pinned: "claude-sonnet-4-5-20250929",
        display: "Claude Sonnet 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "sonnet-4-5-thinking",
        pinned: "claude-sonnet-4-5-20250929-thinking",
        display: "Claude Sonnet 4.5 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 10_000,
    },
    {
        alias: "haiku-4-5",
        pinned: "claude-haiku-4-5-20251001",
        display: "Claude Haiku 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "haiku-4-5-thinking",
        pinned: "claude-haiku-4-5-20251001-thinking",
        display: "Claude Haiku 4.5 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 5_000,
    },
    {
        alias: "opus-4-5",
        pinned: "claude-opus-4-5-20251101",
        display: "Claude Opus 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: false,
    },
    {
        alias: "opus-4-5-thinking",
        pinned: "claude-opus-4-5-20251101-thinking",
        display: "Claude Opus 4.5 (Thinking)",
        contextLimitTokens: 200_000,
        provider: "anthropic",
        supportsThinking: true,
        thinkingBudget: 16_000,
    },
    {
        alias: "gpt-5.1",
        pinned: "gpt-5.1",
        display: "GPT-5.1",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5.1-codex",
        pinned: "gpt-5.1-codex",
        display: "GPT-5.1 Codex",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5.1-codex-mini",
        pinned: "gpt-5.1-codex-mini",
        display: "GPT-5.1 Codex Mini",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5.1-codex-max",
        pinned: "gpt-5.1-codex-max",
        display: "GPT-5.1 Codex Max",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5",
        pinned: "gpt-5",
        display: "GPT-5",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5-mini",
        pinned: "gpt-5-mini",
        display: "GPT-5 Mini",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
    {
        alias: "gpt-5-nano",
        pinned: "gpt-5-nano",
        display: "GPT-5 Nano",
        contextLimitTokens: 1_000_000,
        provider: "openai",
    },
] as const;

const OPENROUTER_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function toAlias(modelId: string): string {
    const sanitized = modelId.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return `or-${sanitized}`;
}

function mapCacheEntryToModel(entry: OpenRouterModelCacheEntry): ModelInfo | null {
    if (!entry.id) return null;
    const provider = entry.id.split("/", 1)[0];
    const allow =
        provider === "openai" || provider === "anthropic" ? entry.id.endsWith(":free") : true;
    if (!allow) return null;

    return {
        alias: toAlias(entry.id),
        pinned: entry.id,
        display: entry.name || entry.id,
        contextLimitTokens: entry.context_length ?? 200_000,
        provider: "openrouter",
        supportsThinking: false,
    };
}

let openRouterModelsCache: ModelInfo[] = [];

function loadOpenRouterModelsFromCache(): void {
    const cache = loadOpenRouterModelCache();
    if (!cache?.models) {
        openRouterModelsCache = [];
        return;
    }
    openRouterModelsCache = cache.models
        .map(mapCacheEntryToModel)
        .filter((m): m is ModelInfo => m !== null);
}

loadOpenRouterModelsFromCache();

export function getModels(): readonly ModelInfo[] {
    return [...BASE_MODELS, ...openRouterModelsCache];
}

export const DEFAULT_MODEL = BASE_MODELS[0].pinned;

interface OpenRouterApiModel {
    id: string;
    name?: string;
    context_length?: number;
    supported_parameters?: string[];
    pricing?: {
        prompt?: string;
        completion?: string;
        request?: string;
        image?: string;
    };
    description?: string;
}

interface OpenRouterApiResponse {
    data?: OpenRouterApiModel[];
}

function isFreeModel(model: OpenRouterApiModel): boolean {
    const pricing = model.pricing || {};
    return (
        model.id.endsWith(":free") ||
        (pricing.prompt === "0" &&
            pricing.completion === "0" &&
            (pricing.request === undefined || pricing.request === "0"))
    );
}

function shouldInclude(model: OpenRouterApiModel): boolean {
    if (!model.id) return false;
    if (!model.supported_parameters?.includes("tools")) return false;

    const provider = model.id.split("/", 1)[0];
    const free = isFreeModel(model);

    if ((provider === "openai" || provider === "anthropic") && !free) {
        return false;
    }

    return true;
}

function toCacheEntry(model: OpenRouterApiModel): OpenRouterModelCacheEntry {
    return {
        id: model.id,
        name: model.name,
        context_length: model.context_length,
        supported_parameters: model.supported_parameters,
        pricing: model.pricing,
        description: model.description,
    };
}

export async function refreshOpenRouterModelsIfStale(): Promise<void> {
    const existingCache = loadOpenRouterModelCache();
    const now = Date.now();
    const isFresh =
        existingCache && existingCache.fetchedAt && now - existingCache.fetchedAt < OPENROUTER_MAX_AGE_MS;
    if (isFresh) {
        loadOpenRouterModelsFromCache();
        return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        loadOpenRouterModelsFromCache();
        return;
    }

    try {
        const res = await fetch(
            "https://openrouter.ai/api/v1/models?supported_parameters=tools",
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );

        if (!res.ok) {
            loadOpenRouterModelsFromCache();
            return;
        }

        const json = (await res.json()) as OpenRouterApiResponse;
        const filtered = (json.data ?? []).filter(shouldInclude);
        const cacheEntries = filtered.map(toCacheEntry);

        saveOpenRouterModelCache({
            fetchedAt: now,
            models: cacheEntries,
        });

        openRouterModelsCache = cacheEntries
            .map(mapCacheEntryToModel)
            .filter((m): m is ModelInfo => m !== null);
    } catch {
        loadOpenRouterModelsFromCache();
    }
}

export function resolveModelId(input: string): string | null {
    const normalized = input.toLowerCase().trim();

    for (const model of getModels()) {
        if (model.pinned === normalized || model.pinned.toLowerCase() === normalized) {
            return model.pinned;
        }
        if (model.alias === normalized || model.alias.toLowerCase() === normalized) {
            return model.pinned;
        }
        const shortAlias = model.alias.replace(/-/g, "");
        if (shortAlias === normalized.replace(/-/g, "")) {
            return model.pinned;
        }
    }

    if (normalized.startsWith("claude-")) {
        return input;
    }

    if (normalized.startsWith("gpt-")) {
        return input;
    }

    if (normalized.includes("/")) {
        return input;
    }

    return null;
}

export function getBaseModelId(modelId: string): string {
    if (modelId.endsWith("-thinking")) {
        return modelId.slice(0, -9);
    }
    return modelId;
}

export function isThinkingModel(modelId: string): boolean {
    return modelId.endsWith("-thinking");
}

export function getModelProvider(modelId: string): ProviderType {
    for (const model of getModels()) {
        if (model.pinned === modelId) {
            return model.provider;
        }
    }
    if (modelId.includes("/")) {
        return "openrouter";
    }
    if (modelId.startsWith("gpt-")) {
        return "openai";
    }
    return "anthropic";
}

export function getModelDisplay(modelId: string): string {
    for (const model of getModels()) {
        if (model.pinned === modelId) {
            return model.display;
        }
    }
    return modelId;
}

export function getModelAliases(): string[] {
    return getModels().map((m) => m.alias);
}

export function getModelContextLimit(modelId: string): number {
    for (const model of getModels()) {
        if (model.pinned === modelId) {
            return model.contextLimitTokens;
        }
    }
    return 200_000;
}

export function getAssistantName(): string {

    return "Assistant";
}

export function getModelThinkingConfig(
    modelId: string
): { type: "enabled"; budget_tokens: number } | undefined {
    for (const model of getModels()) {
        if (model.pinned === modelId && model.supportsThinking && model.thinkingBudget) {
            return {
                type: "enabled",
                budget_tokens: model.thinkingBudget,
            };
        }
    }
    return undefined;
}
