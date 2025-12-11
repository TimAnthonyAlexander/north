import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureDir, getNorthDir } from "../utils/paths";

export interface OpenRouterPricingInfo {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
}

export interface OpenRouterModelCacheEntry {
    id: string;
    name?: string;
    context_length?: number;
    supported_parameters?: string[];
    pricing?: OpenRouterPricingInfo;
    description?: string;
}

export interface OpenRouterModelCache {
    fetchedAt: number;
    models: OpenRouterModelCacheEntry[];
}

const OPENROUTER_CACHE_FILENAME = "openrouter-models.json";

export function getOpenRouterCachePath(): string {
    return join(getNorthDir(), OPENROUTER_CACHE_FILENAME);
}

export function loadOpenRouterModelCache(): OpenRouterModelCache | null {
    const path = getOpenRouterCachePath();
    if (!existsSync(path)) return null;

    try {
        const content = readFileSync(path, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.models)) {
            return parsed as OpenRouterModelCache;
        }
    } catch {
        // Ignore malformed cache; treat as missing
    }
    return null;
}

export function saveOpenRouterModelCache(cache: OpenRouterModelCache): void {
    ensureDir(getNorthDir());
    const path = getOpenRouterCachePath();
    writeFileSync(path, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}
