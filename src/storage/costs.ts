import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getNorthDir, ensureDir } from "../utils/paths";

export interface ModelCost {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}

interface CostData {
    allTimeCostUsd: number;
    byModel: Record<string, ModelCost>;
    lastUpdated: number;
}

export interface CostBreakdown {
    allTimeCostUsd: number;
    byModel: Record<string, ModelCost>;
}

function getCostsPath(): string {
    return join(getNorthDir(), "costs.json");
}

function ensureNorthDir(): void {
    ensureDir(getNorthDir());
}

function loadCostData(): CostData {
    const path = getCostsPath();
    if (!existsSync(path)) {
        return { allTimeCostUsd: 0, byModel: {}, lastUpdated: Date.now() };
    }
    try {
        const content = readFileSync(path, "utf-8");
        const data = JSON.parse(content);
        return {
            allTimeCostUsd: data.allTimeCostUsd ?? 0,
            byModel: data.byModel ?? {},
            lastUpdated: data.lastUpdated ?? Date.now(),
        };
    } catch {
        return { allTimeCostUsd: 0, byModel: {}, lastUpdated: Date.now() };
    }
}

function saveCostData(data: CostData): void {
    ensureNorthDir();
    const path = getCostsPath();
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getAllTimeCost(): number {
    const data = loadCostData();
    return data.allTimeCostUsd;
}

export function getCostBreakdown(): CostBreakdown {
    const data = loadCostData();
    return {
        allTimeCostUsd: data.allTimeCostUsd,
        byModel: data.byModel,
    };
}

export function addCost(costUsd: number): number {
    const data = loadCostData();
    data.allTimeCostUsd += costUsd;
    data.lastUpdated = Date.now();
    saveCostData(data);
    return data.allTimeCostUsd;
}

export function addCostByModel(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number
): number {
    const data = loadCostData();

    if (!data.byModel[modelId]) {
        data.byModel[modelId] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }

    data.byModel[modelId].inputTokens += inputTokens;
    data.byModel[modelId].outputTokens += outputTokens;
    data.byModel[modelId].costUsd += costUsd;
    data.allTimeCostUsd += costUsd;
    data.lastUpdated = Date.now();

    saveCostData(data);
    return data.allTimeCostUsd;
}

export function resetAllTimeCost(): void {
    saveCostData({ allTimeCostUsd: 0, byModel: {}, lastUpdated: Date.now() });
}
