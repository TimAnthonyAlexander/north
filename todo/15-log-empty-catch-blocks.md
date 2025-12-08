# Add Debug Logging to Empty Catch Blocks

## Severity: Trivial

## Location
Multiple files:
- `src/shell/index.ts` (lines 105-106)
- `src/logging/index.ts` (lines 76-78)
- `src/utils/ignore.ts` (line 134)
- `src/rules/cursor.ts` (lines 89-90)
- Various other locations

## Problem
Empty catch blocks silently swallow errors, making debugging difficult. Even expected failures should be logged at debug level for troubleshooting.

## Solution
Add debug-level logging to catch blocks, even for expected failures.

## Implementation Notes
Pattern to follow:
```typescript
// Before
try {
    session.pty.kill();
} catch {
}

// After
try {
    session.pty.kill();
} catch (err) {
    logger?.debug?.("pty_kill_failed", { error: String(err) });
}
```

For files without logger access, consider:
1. Passing logger as parameter where feasible
2. Using a conditional debug log that's safe when logger is unavailable:
```typescript
catch (err) {
    if (process.env.DEBUG) {
        console.error("[debug] pty kill failed:", err);
    }
}
```

Priority locations to fix:
1. `shell/index.ts` - PTY kill failures
2. `utils/ignore.ts` - gitignore parsing failures
3. `rules/cursor.ts` - rule file read failures

---

**When complete, delete this file: `rm todo/15-log-empty-catch-blocks.md`**

