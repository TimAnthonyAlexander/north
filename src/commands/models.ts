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

export const MODELS: readonly ModelInfo[] = [
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
    {
        alias: "or-gpt-5.1",
        pinned: "openai/gpt-5.1",
        display: "OpenRouter (GPT-5.1)",
        contextLimitTokens: 1_000_000,
        provider: "openrouter",
    },
    {
        alias: "or-claude-sonnet-4-5",
        pinned: "anthropic/claude-sonnet-4-5-20250929",
        display: "OpenRouter (Claude Sonnet 4.5)",
        contextLimitTokens: 200_000,
        provider: "openrouter",
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

    if (normalized.includes("/")) {
        return input;
    }

    return null;
}

export function getBaseModelId(modelId: string): string {
    // Remove -thinking suffix to get the base model ID
    if (modelId.endsWith("-thinking")) {
        return modelId.slice(0, -9);
    }
    return modelId;
}

export function isThinkingModel(modelId: string): boolean {
    return modelId.endsWith("-thinking");
}

export function getModelProvider(modelId: string): ProviderType {
    for (const model of MODELS) {
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

export function getAssistantName(modelId: string): string {
    const provider = getModelProvider(modelId);
    if (provider === "openai") {
        return "GPT";
    }
    if (provider === "openrouter") {
        const baseModel = modelId.includes("/") ? modelId.split("/")[1] : modelId;
        return baseModel.startsWith("gpt-") ? "GPT" : "Claude";
    }
    return "Claude";
}

export function getModelThinkingConfig(
    modelId: string
): { type: "enabled"; budget_tokens: number } | undefined {
    for (const model of MODELS) {
        if (model.pinned === modelId && model.supportsThinking && model.thinkingBudget) {
            return {
                type: "enabled",
                budget_tokens: model.thinkingBudget,
            };
        }
    }
    return undefined;
}
