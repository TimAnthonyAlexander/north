# Consolidate Duplicate Path Resolution Functions

## Severity: Trivial

## Location
- `src/utils/editing.ts` (`resolveSafePath`)
- `src/tools/read_file.ts` (`resolvePath`)

## Problem
Nearly identical implementations exist in two places. This is a DRY violation and makes it harder to apply security fixes consistently.

## Solution
1. Keep `resolveSafePath` in `src/utils/editing.ts` as the canonical implementation
2. Export it for use by other modules
3. Remove the duplicate `resolvePath` from `read_file.ts` and import the shared one

## Implementation Notes
In `src/utils/editing.ts`, ensure it's exported:
```typescript
export function resolveSafePath(repoRoot: string, filePath: string): string | null {
    // ... implementation
}
```

In `src/tools/read_file.ts`:
```typescript
import { resolveSafePath } from "../utils/editing";

// Remove local resolvePath function

// Update usage:
const resolvedPath = resolveSafePath(ctx.repoRoot, args.path);
```

This also ensures that when we fix the symlink vulnerability, it's fixed in one place.

---

**When complete, delete this file: `rm todo/13-consolidate-path-resolution.md`**

