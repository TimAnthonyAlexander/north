import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSafePath } from "../utils/editing";

export function generateAuthToken(bytes = 16): string {
    return randomBytes(bytes).toString("hex");
}

export function isAllowedOrigin(origin: string | null, port: number, extraAllowed: string[] = []): boolean {
    if (!origin) return false;
    if (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`) return true;
    return extraAllowed.includes(origin);
}

export function validateRepoRoot(requested: string | undefined, allowedRepoRoot: string): {
    ok: true;
    repoRoot: string;
} | { ok: false; error: string } {
    if (!requested) {
        return { ok: true, repoRoot: allowedRepoRoot };
    }

    const requestedResolved = resolve(requested);
    const allowedResolved = resolve(allowedRepoRoot);

    let requestedReal: string;
    let allowedReal: string;
    try {
        requestedReal = realpathSync(requestedResolved);
        allowedReal = realpathSync(allowedResolved);
    } catch {
        return { ok: false, error: "Invalid repoRoot (cannot resolve path)" };
    }

    if (requestedReal !== allowedReal) {
        return {
            ok: false,
            error: `repoRoot not allowed (allowed: ${allowedReal})`,
        };
    }

    return { ok: true, repoRoot: requestedReal };
}

export function filterAttachedFiles(repoRoot: string, files: string[] | undefined): string[] {
    if (!files || files.length === 0) return [];
    const safe: string[] = [];
    for (const filePath of files) {
        if (!filePath || typeof filePath !== "string") continue;
        if (filePath.startsWith("/")) continue;
        if (!resolveSafePath(repoRoot, filePath)) continue;
        safe.push(filePath);
    }
    return [...new Set(safe)];
}
