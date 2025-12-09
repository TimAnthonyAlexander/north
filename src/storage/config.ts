import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface GlobalConfig {
    selectedModel?: string;
}

function getHomeDir(): string {
    return process.env.HOME || homedir();
}

function getConfigDir(): string {
    if (process.env.NORTH_CONFIG_DIR) {
        return process.env.NORTH_CONFIG_DIR;
    }
    return join(getHomeDir(), ".config", "north");
}

function getConfigPath(): string {
    return join(getConfigDir(), "config.json");
}

function ensureConfigDir(): void {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function loadConfig(): GlobalConfig {
    const path = getConfigPath();
    if (!existsSync(path)) {
        return {};
    }

    try {
        const content = readFileSync(path, "utf-8");
        return JSON.parse(content);
    } catch (err) {
        console.error(`[config] Failed to load ${path}:`, err);
        return {};
    }
}

function saveConfig(config: GlobalConfig): void {
    try {
        ensureConfigDir();
        const path = getConfigPath();
        writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
    } catch (err) {
        console.error(`[config] Failed to save config:`, err);
    }
}

export function getSavedModel(): string | null {
    const config = loadConfig();
    const model = config.selectedModel || null;
    if (process.env.DEBUG) {
        console.error(`[config] getSavedModel from ${getConfigPath()}: ${model}`);
    }
    return model;
}

export function saveSelectedModel(modelId: string): void {
    if (process.env.DEBUG) {
        console.error(`[config] saveSelectedModel to ${getConfigPath()}: ${modelId}`);
    }
    const config = loadConfig();
    config.selectedModel = modelId;
    saveConfig(config);
}
