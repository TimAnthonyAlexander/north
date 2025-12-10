import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export function getHomeDir(): string {
    return process.env.HOME || homedir();
}

export function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

export function getNorthDir(): string {
    if (process.env.NORTH_DATA_DIR) {
        return process.env.NORTH_DATA_DIR;
    }
    return join(getHomeDir(), ".north");
}

export function getConfigDir(): string {
    if (process.env.NORTH_CONFIG_DIR) {
        return process.env.NORTH_CONFIG_DIR;
    }
    return join(getHomeDir(), ".config", "north");
}

export function getConversationsDir(): string {
    if (process.env.NORTH_CONVERSATIONS_DIR) {
        return process.env.NORTH_CONVERSATIONS_DIR;
    }
    return join(getNorthDir(), "conversations");
}

export function getProjectsDir(): string {
    return join(getNorthDir(), "projects");
}

export function getLogDir(): string {
    const stateDir = process.env.XDG_STATE_HOME || join(getHomeDir(), ".local", "state");
    return join(stateDir, "north");
}
