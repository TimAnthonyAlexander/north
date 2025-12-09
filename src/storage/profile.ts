import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

interface DeclinedMarker {
    declined: boolean;
}

function getHomeDir(): string {
    return process.env.HOME || homedir();
}

function getProjectsDir(): string {
    return join(getHomeDir(), ".north", "projects");
}

export function getProjectHash(repoRoot: string): string {
    return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

function getProjectDir(repoRoot: string): string {
    const hash = getProjectHash(repoRoot);
    return join(getProjectsDir(), hash);
}

export function getProfilePath(repoRoot: string): string {
    return join(getProjectDir(repoRoot), "profile.md");
}

function getDeclinedPath(repoRoot: string): string {
    return join(getProjectDir(repoRoot), "declined.json");
}

function ensureProjectDir(repoRoot: string): void {
    const dir = getProjectDir(repoRoot);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

export function hasProfile(repoRoot: string): boolean {
    return existsSync(getProfilePath(repoRoot));
}

export function loadProfile(repoRoot: string): string | null {
    const path = getProfilePath(repoRoot);
    if (!existsSync(path)) {
        return null;
    }

    try {
        return readFileSync(path, "utf-8");
    } catch (err) {
        console.error(`[profile] Failed to load ${path}:`, err);
        return null;
    }
}

export function saveProfile(repoRoot: string, content: string): void {
    try {
        ensureProjectDir(repoRoot);
        const path = getProfilePath(repoRoot);
        writeFileSync(path, content, "utf-8");
    } catch (err) {
        console.error(`[profile] Failed to save profile:`, err);
    }
}

export function hasDeclined(repoRoot: string): boolean {
    const path = getDeclinedPath(repoRoot);
    if (!existsSync(path)) {
        return false;
    }

    try {
        const content = readFileSync(path, "utf-8");
        const marker: DeclinedMarker = JSON.parse(content);
        return marker.declined === true;
    } catch (err) {
        console.error(`[profile] Failed to read declined marker:`, err);
        return false;
    }
}

export function markDeclined(repoRoot: string): void {
    try {
        ensureProjectDir(repoRoot);
        const path = getDeclinedPath(repoRoot);
        const marker: DeclinedMarker = { declined: true };
        writeFileSync(path, JSON.stringify(marker, null, 2) + "\n", "utf-8");
    } catch (err) {
        console.error(`[profile] Failed to mark declined:`, err);
    }
}

export function clearDeclined(repoRoot: string): void {
    const path = getDeclinedPath(repoRoot);
    if (existsSync(path)) {
        try {
            unlinkSync(path);
        } catch (err) {
            console.error(`[profile] Failed to clear declined marker:`, err);
        }
    }
}

