# Fix Cross-Filesystem Atomic Write Failure

## Severity: Major

## Location
`src/utils/editing.ts` (lines 170-206, `applyEditsAtomically`)

## Problem
`renameSync(tempPath, finalPath)` will throw `EXDEV` if tmpdir and repo are on different filesystems (common in Docker, NFS mounts, or macOS with external drives). This silently fails the entire batch and could cause data loss.

## Solution
1. Catch `EXDEV` error specifically in the rename operation
2. Fall back to copy + unlink when cross-filesystem rename fails
3. Alternatively, use a temp directory inside the repo root instead of system tmpdir

## Implementation Notes
```typescript
try {
    renameSync(tempPath, finalPath);
} catch (err: any) {
    if (err.code === 'EXDEV') {
        copyFileSync(tempPath, finalPath);
        unlinkSync(tempPath);
    } else {
        throw err;
    }
}
```

---

**When complete, delete this file: `rm todo/01-cross-filesystem-atomic-write.md`**

