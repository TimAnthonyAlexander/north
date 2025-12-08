# Centralize Magic Numbers as Constants

## Severity: Trivial

## Location
Various files throughout codebase:
- `src/tools/read_file.ts` (`MAX_FILE_SIZE = 100_000`, `MAX_LINES = 500`)
- `src/shell/index.ts` (`timeoutMs ?? 60000`)
- `src/tools/search_text.ts` (`DEFAULT_LIMIT = 50`, `MAX_LIMIT = 200`, `PREVIEW_LENGTH = 120`)
- `src/ui/DiffReview.tsx` (`MAX_DIFF_LINES = 100`)
- `src/rules/cursor.ts` (`MAX_TOTAL_SIZE = 30 * 1024`)

## Problem
Magic numbers scattered across files make it hard to:
- Discover what limits exist
- Change them consistently
- Understand the system's constraints

## Solution
Create a centralized constants file with all configurable limits.

## Implementation Notes
Create `src/constants.ts`:
```typescript
// File reading limits
export const MAX_FILE_SIZE_BYTES = 100_000;
export const MAX_FILE_LINES = 500;

// Search limits
export const SEARCH_DEFAULT_LIMIT = 50;
export const SEARCH_MAX_LIMIT = 200;
export const SEARCH_PREVIEW_LENGTH = 120;

// Shell limits
export const SHELL_DEFAULT_TIMEOUT_MS = 60_000;

// UI limits
export const DIFF_REVIEW_MAX_LINES = 100;

// Rules limits
export const CURSOR_RULES_MAX_SIZE_BYTES = 30 * 1024;
```

Then import and use these constants in respective files:
```typescript
import { MAX_FILE_SIZE_BYTES, MAX_FILE_LINES } from "../constants";
```

---

**When complete, delete this file: `rm todo/14-centralize-magic-numbers.md`**

