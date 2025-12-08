import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface AllowlistData {
    allowedCommands: string[];
}

const NORTH_DIR = ".north";
const ALLOWLIST_FILE = "allowlist.json";

function getAllowlistPath(repoRoot: string): string {
    return join(repoRoot, NORTH_DIR, ALLOWLIST_FILE);
}

function ensureNorthDir(repoRoot: string): void {
    const dir = join(repoRoot, NORTH_DIR);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function loadAllowlistData(repoRoot: string): AllowlistData {
    const path = getAllowlistPath(repoRoot);
    if (!existsSync(path)) {
        return { allowedCommands: [] };
    }

    try {
        const content = readFileSync(path, "utf-8");
        const data = JSON.parse(content);
        if (Array.isArray(data.allowedCommands)) {
            return { allowedCommands: data.allowedCommands };
        }
        return { allowedCommands: [] };
    } catch {
        return { allowedCommands: [] };
    }
}

function saveAllowlistData(repoRoot: string, data: AllowlistData): void {
    ensureNorthDir(repoRoot);
    const path = getAllowlistPath(repoRoot);
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function isCommandAllowed(repoRoot: string, command: string): boolean {
    const data = loadAllowlistData(repoRoot);
    const trimmed = command.trim();
    return data.allowedCommands.includes(trimmed);
}

export function allowCommand(repoRoot: string, command: string): void {
    const data = loadAllowlistData(repoRoot);
    const trimmed = command.trim();
    if (!data.allowedCommands.includes(trimmed)) {
        data.allowedCommands.push(trimmed);
        saveAllowlistData(repoRoot, data);
    }
}

export function getAllowedCommands(repoRoot: string): string[] {
    const data = loadAllowlistData(repoRoot);
    return [...data.allowedCommands];
}

