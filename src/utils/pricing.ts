export type ProviderType = "anthropic" | "openai";

export interface ModelPricing {
    inputPerMillion: number;
    outputPerMillion: number;
    cachedInputPerMillion?: number;
    cacheWritePerMillion?: number;
    cacheHitPerMillion?: number;
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
    "claude-sonnet-4-20250514": {
        inputPerMillion: 3.0,
        outputPerMillion: 15.0,
        cacheWritePerMillion: 3.75,
        cacheHitPerMillion: 0.3,
    },
    "claude-opus-4-20250514": {
        inputPerMillion: 15.0,
        outputPerMillion: 75.0,
        cacheWritePerMillion: 18.75,
        cacheHitPerMillion: 1.5,
    },
    "claude-opus-4-1-20250805": {
        inputPerMillion: 15.0,
        outputPerMillion: 75.0,
        cacheWritePerMillion: 18.75,
        cacheHitPerMillion: 1.5,
    },
    "claude-sonnet-4-5-20250929": {
        inputPerMillion: 3.0,
        outputPerMillion: 15.0,
        cacheWritePerMillion: 3.75,
        cacheHitPerMillion: 0.3,
    },
    "claude-haiku-4-5-20251001": {
        inputPerMillion: 1.0,
        outputPerMillion: 5.0,
        cacheWritePerMillion: 1.25,
        cacheHitPerMillion: 0.1,
    },
    "claude-opus-4-5-20251101": {
        inputPerMillion: 5.0,
        outputPerMillion: 25.0,
        cacheWritePerMillion: 6.25,
        cacheHitPerMillion: 0.5,
    },
};

const OPENAI_PRICING: Record<string, ModelPricing> = {
    "gpt-5.1": {
        inputPerMillion: 1.25,
        outputPerMillion: 10.0,
        cachedInputPerMillion: 0.125,
    },
    "gpt-5.1-codex": {
        inputPerMillion: 1.25,
        outputPerMillion: 10.0,
        cachedInputPerMillion: 0.125,
    },
    "gpt-5.1-codex-mini": {
        inputPerMillion: 0.25,
        outputPerMillion: 2.0,
        cachedInputPerMillion: 0.025,
    },
    "gpt-5.1-codex-max": {
        inputPerMillion: 1.25,
        outputPerMillion: 10.0,
        cachedInputPerMillion: 0.125,
    },
    "gpt-5": {
        inputPerMillion: 1.25,
        outputPerMillion: 10.0,
        cachedInputPerMillion: 0.125,
    },
    "gpt-5-mini": {
        inputPerMillion: 0.25,
        outputPerMillion: 2.0,
        cachedInputPerMillion: 0.025,
    },
    "gpt-5-nano": {
        inputPerMillion: 0.05,
        outputPerMillion: 0.4,
        cachedInputPerMillion: 0.005,
    },
};

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
}

export function getModelPricing(modelId: string): ModelPricing | null {
    if (ANTHROPIC_PRICING[modelId]) {
        return ANTHROPIC_PRICING[modelId];
    }
    if (OPENAI_PRICING[modelId]) {
        return OPENAI_PRICING[modelId];
    }
    if (modelId.startsWith("claude-")) {
        return ANTHROPIC_PRICING["claude-sonnet-4-20250514"];
    }
    if (modelId.startsWith("gpt-")) {
        return OPENAI_PRICING["gpt-5.1"];
    }
    return null;
}

export function calculateCost(modelId: string, usage: TokenUsage): number {
    const pricing = getModelPricing(modelId);
    if (!pricing) return 0;

    let cost = 0;

    if (usage.cachedInputTokens !== undefined && pricing.cachedInputPerMillion) {
        const nonCachedInput = usage.inputTokens - usage.cachedInputTokens;
        cost += (nonCachedInput / 1_000_000) * pricing.inputPerMillion;
        cost += (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion;
    } else {
        cost += (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
    }

    cost += (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;

    if (usage.cacheWriteTokens && pricing.cacheWritePerMillion) {
        cost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
    }

    if (usage.cacheReadTokens && pricing.cacheHitPerMillion) {
        cost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheHitPerMillion;
    }

    return cost;
}

export function formatCost(cost: number): string {
    if (cost < 0.01) {
        return `$${cost.toFixed(4)}`;
    }
    if (cost < 1) {
        return `$${cost.toFixed(3)}`;
    }
    return `$${cost.toFixed(2)}`;
}
