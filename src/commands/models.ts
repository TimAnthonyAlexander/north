export type ProviderType = "anthropic" | "openai";

export interface ModelInfo {
    alias: string;
    pinned: string;
    display: string;
    contextLimitTokens: number;
    provider: ProviderType;
}

export const MODELS: readonly ModelInfo[] = [
    {
        alias: "sonnet-4",
        pinned: "claude-sonnet-4-20250514",
        display: "Claude Sonnet 4",
        contextLimitTokens: 200_000,
        provider: "anthropic",
    },
    {
        alias: "opus-4",
        pinned: "claude-opus-4-20250514",
        display: "Claude Opus 4",
        contextLimitTokens: 200_000,
        provider: "anthropic",
    },
    {
        alias: "opus-4-1",
        pinned: "claude-opus-4-1-20250805",
        display: "Claude Opus 4.1",
        contextLimitTokens: 200_000,
        provider: "anthropic",
    },
    {
        alias: "sonnet-4-5",
        pinned: "claude-sonnet-4-5-20250929",
        display: "Claude Sonnet 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
    },
    {
        alias: "haiku-4-5",
        pinned: "claude-haiku-4-5-20251001",
        display: "Claude Haiku 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
    },
    {
        alias: "opus-4-5",
        pinned: "claude-opus-4-5-20251101",
        display: "Claude Opus 4.5",
        contextLimitTokens: 200_000,
        provider: "anthropic",
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

export const DEFAULT_MODEL = MODELS[0].pinned;

export function resolveModelId(input: string): string | null {
    const normalized = input.toLowerCase().trim();

    for (const model of MODELS) {
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

    return null;
}

export function getModelProvider(modelId: string): ProviderType {
    for (const model of MODELS) {
        if (model.pinned === modelId) {
            return model.provider;
        }
    }
    if (modelId.startsWith("gpt-")) {
        return "openai";
    }
    return "anthropic";
}

export function getModelDisplay(modelId: string): string {
    for (const model of MODELS) {
        if (model.pinned === modelId) {
            return model.display;
        }
    }
    return modelId;
}

export function getModelAliases(): string[] {
    return MODELS.map((m) => m.alias);
}

export function getModelContextLimit(modelId: string): number {
    for (const model of MODELS) {
        if (model.pinned === modelId) {
            return model.contextLimitTokens;
        }
    }
    return 200_000;
}
