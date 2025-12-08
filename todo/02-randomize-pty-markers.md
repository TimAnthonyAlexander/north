# Randomize PTY Markers Per Command

## Severity: Major

## Location
`src/shell/index.ts` (lines 26-77)

## Problem
The shell service uses static magic markers (`__NORTH_CMD_START_`, `__NORTH_CMD_END_`) to delimit command output. A malicious or compromised command could print these markers in its output, causing:
- Premature command "completion"
- Incorrect exit codes being reported
- Truncated or manipulated output

## Solution
1. Generate cryptographically random markers per command execution
2. Include sufficient entropy to prevent collision (e.g., 32+ random chars)
3. The command ID already provides some uniqueness but markers should be less predictable

## Implementation Notes
Replace:
```typescript
const START_MARKER = "__NORTH_CMD_START_";
const END_MARKER = "__NORTH_CMD_END_";
```

With per-execution random generation:
```typescript
function generateMarker(prefix: string): string {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
}
```

Then generate fresh markers in the `run()` function for each command.

---

**When complete, delete this file: `rm todo/02-randomize-pty-markers.md`**

