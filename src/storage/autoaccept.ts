import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface AutoAcceptData {
    editsAutoAccept: boolean;
    shellAutoApprove: boolean;
}

const NORTH_DIR = ".north";
const AUTOACCEPT_FILE = "autoaccept.json";

function getAutoAcceptPath(repoRoot: string): string {
    return join(repoRoot, NORTH_DIR, AUTOACCEPT_FILE);
}

function ensureNorthDir(repoRoot: string): void {
    const dir = join(repoRoot, NORTH_DIR);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function loadAutoAcceptData(repoRoot: string): AutoAcceptData {
    const path = getAutoAcceptPath(repoRoot);
    if (!existsSync(path)) {
        return { editsAutoAccept: false, shellAutoApprove: false };
    }

    try {
        const content = readFileSync(path, "utf-8");
        const data = JSON.parse(content);
        return {
            editsAutoAccept: Boolean(data.editsAutoAccept),
            shellAutoApprove: Boolean(data.shellAutoApprove),
        };
    } catch {
        return { editsAutoAccept: false, shellAutoApprove: false };
    }
}

function saveAutoAcceptData(repoRoot: string, data: AutoAcceptData): void {
    ensureNorthDir(repoRoot);
    const path = getAutoAcceptPath(repoRoot);
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function isEditsAutoAcceptEnabled(repoRoot: string): boolean {
    const data = loadAutoAcceptData(repoRoot);
    return data.editsAutoAccept;
}

export function enableEditsAutoAccept(repoRoot: string): void {
    const data = loadAutoAcceptData(repoRoot);
    saveAutoAcceptData(repoRoot, { ...data, editsAutoAccept: true });
}

export function disableEditsAutoAccept(repoRoot: string): void {
    const data = loadAutoAcceptData(repoRoot);
    saveAutoAcceptData(repoRoot, { ...data, editsAutoAccept: false });
}

export function isShellAutoApproveEnabled(repoRoot: string): boolean {
    const data = loadAutoAcceptData(repoRoot);
    return data.shellAutoApprove;
}

export function enableShellAutoApprove(repoRoot: string): void {
    const data = loadAutoAcceptData(repoRoot);
    saveAutoAcceptData(repoRoot, { ...data, shellAutoApprove: true });
}

export function disableShellAutoApprove(repoRoot: string): void {
    const data = loadAutoAcceptData(repoRoot);
    saveAutoAcceptData(repoRoot, { ...data, shellAutoApprove: false });
}
