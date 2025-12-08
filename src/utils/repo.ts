import { existsSync } from "fs";
import { join, dirname, resolve } from "path";

const REPO_MARKERS = [".git", "package.json", "Cargo.toml", "go.mod", "pyproject.toml"];

export function detectRepoRoot(startPath: string): string {
    let current = resolve(startPath);

    while (true) {
        for (const marker of REPO_MARKERS) {
            if (existsSync(join(current, marker))) {
                return current;
            }
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }

    return resolve(startPath);
}
