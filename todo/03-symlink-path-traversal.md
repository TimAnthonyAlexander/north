# Fix Symlink Path Traversal Vulnerability

## Severity: Major

## Location
- `src/utils/editing.ts` (`resolveSafePath`)
- `src/tools/read_file.ts` (`resolvePath`)

## Problem
The path security check uses `normalize()` which doesn't resolve symlinks. A symlink inside the repo pointing to `/etc/passwd` or other sensitive files would pass validation, allowing reads/writes outside the repo boundary.

## Solution
1. Use `fs.realpathSync()` after normalization to resolve symlinks
2. Verify the resolved real path is still within the repo root
3. Optionally add an `lstatSync` check to detect and reject symlinks entirely

## Implementation Notes
```typescript
export function resolveSafePath(repoRoot: string, filePath: string): string | null {
    const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
    const normalized = normalize(resolved);
    const normalizedRoot = normalize(repoRoot);

    if (!normalized.startsWith(normalizedRoot)) {
        return null;
    }

    // Resolve symlinks and verify again
    try {
        const realPath = realpathSync(normalized);
        const realRoot = realpathSync(normalizedRoot);
        if (!realPath.startsWith(realRoot)) {
            return null;
        }
        return realPath;
    } catch {
        // File doesn't exist yet (for create), use normalized path
        // but verify parent directory is safe
        const parentDir = dirname(normalized);
        try {
            const realParent = realpathSync(parentDir);
            const realRoot = realpathSync(normalizedRoot);
            if (!realParent.startsWith(realRoot)) {
                return null;
            }
        } catch {
            // Parent doesn't exist, will be created - check its parent recursively
        }
        return normalized;
    }
}
```

---

**When complete, delete this file: `rm todo/03-symlink-path-traversal.md`**


