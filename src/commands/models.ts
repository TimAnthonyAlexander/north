export interface ModelInfo {
    alias: string;
    pinned: string;
    display: string;
    contextLimitTokens: number;
}

export const MODELS: readonly ModelInfo[] = [
    {
        alias: "sonnet-4",
        pinned: "claude-sonnet-4-20250514",
        display: "Claude Sonnet 4",
        contextLimitTokens: 200_000,
    },
    {
        alias: "opus-4",
        pinned: "claude-opus-4-20250514",
        display: "Claude Opus 4",
        contextLimitTokens: 200_000,
    },
    {
        alias: "opus-4-1",
        pinned: "claude-opus-4-1-20250805",
        display: "Claude Opus 4.1",
        contextLimitTokens: 200_000,
    },
    {
        alias: "sonnet-4-5",
        pinned: "claude-sonnet-4-5-20250929",
        display: "Claude Sonnet 4.5",
        contextLimitTokens: 200_000,
    },
    {
        alias: "haiku-4-5",
        pinned: "claude-haiku-4-5-20251001",
        display: "Claude Haiku 4.5",
        contextLimitTokens: 200_000,
    },
    {
        alias: "opus-4-5",
        pinned: "claude-opus-4-5-20251101",
        display: "Claude Opus 4.5",
        contextLimitTokens: 200_000,
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

    return null;
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
