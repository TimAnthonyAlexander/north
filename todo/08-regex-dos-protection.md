# Protect Against Regex DoS

## Severity: Minor

## Location
`src/tools/search_text.ts` (lines 105, 125-129)

## Problem
User-provided regex patterns (when `regex: true`) are compiled without validation. Patterns like `(a+)+$` can cause catastrophic backtracking on large files, hanging the process.

## Solution
Options (pick one or combine):
1. Add a timeout wrapper around regex execution
2. Use a safe regex library like `re2` for linear-time matching
3. Validate patterns for known dangerous constructs
4. Limit input file size when using regex mode

## Implementation Notes

Option A - Timeout wrapper:
```typescript
function safeRegexTest(regex: RegExp, input: string, timeoutMs = 1000): boolean {
    // Run regex in a worker with timeout
    // Or use a simple heuristic: skip files > 100KB for regex
}
```

Option B - Use safe-regex package to detect dangerous patterns:
```typescript
import safeRegex from 'safe-regex';

if (isRegex && !safeRegex(query)) {
    return { ok: false, error: "Regex pattern appears unsafe (potential catastrophic backtracking)" };
}
```

Option C - Limit scope:
```typescript
if (isRegex && content.length > 100_000) {
    continue; // Skip large files for regex search
}
```

---

**When complete, delete this file: `rm todo/08-regex-dos-protection.md`**


