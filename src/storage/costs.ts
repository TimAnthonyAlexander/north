import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface CostData {
    allTimeCostUsd: number;
    lastUpdated: number;
}

function getHomeDir(): string {
    return process.env.HOME || homedir();
}

function getNorthDir(): string {
    if (process.env.NORTH_DATA_DIR) {
        return process.env.NORTH_DATA_DIR;
    }
    return join(getHomeDir(), ".north");
}

function getCostsPath(): string {
    return join(getNorthDir(), "costs.json");
}

function ensureNorthDir(): void {
    const dir = getNorthDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function loadCostData(): CostData {
    const path = getCostsPath();
    if (!existsSync(path)) {
        return { allTimeCostUsd: 0, lastUpdated: Date.now() };
    }
    try {
        const content = readFileSync(path, "utf-8");
        const data = JSON.parse(content);
        return {
            allTimeCostUsd: data.allTimeCostUsd ?? 0,
            lastUpdated: data.lastUpdated ?? Date.now(),
        };
    } catch {
        return { allTimeCostUsd: 0, lastUpdated: Date.now() };
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

export function addCost(costUsd: number): number {
    const data = loadCostData();
    data.allTimeCostUsd += costUsd;
    data.lastUpdated = Date.now();
    saveCostData(data);
    return data.allTimeCostUsd;
}

export function resetAllTimeCost(): void {
    saveCostData({ allTimeCostUsd: 0, lastUpdated: Date.now() });
}

