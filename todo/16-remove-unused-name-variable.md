# Remove Unused Variable in cursor.ts

## Severity: Trivial

## Location
`src/rules/cursor.ts` (line 94)

## Problem
The `name` variable is computed but never used. Only `pathInRulesDir` is actually used.

## Solution
Remove the unused assignment to clean up the code.

## Implementation Notes
```typescript
// Before
const { body } = parseFrontmatter(content);
const name = basename(relPath, ".mdc");  // <-- unused
const pathInRulesDir = relPath;

// After
const { body } = parseFrontmatter(content);
const pathInRulesDir = relPath;
```

If `name` was intended for future use in the `CursorRule` interface, either:
1. Remove it from the interface too, or
2. Keep it but add a comment explaining future intent

---

**When complete, delete this file: `rm todo/16-remove-unused-name-variable.md`**


