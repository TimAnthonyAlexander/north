import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface GlobalConfig {
    selectedModel?: string;
}

function getConfigDir(): string {
    return join(homedir(), ".config", "north");
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
    } catch {
        return {};
    }
}

function saveConfig(config: GlobalConfig): void {
    ensureConfigDir();
    const path = getConfigPath();
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getSavedModel(): string | null {
    const config = loadConfig();
    return config.selectedModel || null;
}

export function saveSelectedModel(modelId: string): void {
    const config = loadConfig();
    config.selectedModel = modelId;
    saveConfig(config);
}
