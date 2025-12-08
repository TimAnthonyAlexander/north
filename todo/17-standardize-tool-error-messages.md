# Standardize Tool Error Messages

## Severity: Minor

## Location
Various tool files in `src/tools/`

## Problem
Error messages are inconsistent across tools:
- Some give actionable guidance: "Use read_file to verify the exact content you want to replace"
- Others are generic: "Cannot read file"

Inconsistent guidance makes it harder for the model to recover from errors.

## Solution
Create a standard error message format with:
1. What went wrong
2. Why it might have happened
3. How to recover

## Implementation Notes
Create error message helpers:
```typescript
// src/tools/errors.ts
export const toolErrors = {
    fileNotFound: (path: string) => 
        `File not found: ${path}. Verify the path exists using find_files or list_root.`,
    
    pathEscapesRepo: (path: string) => 
        `Path escapes repository root: ${path}. Use paths relative to the repo root.`,
    
    textNotFound: (path: string) => 
        `Text not found in ${path}. Use read_file first to get the exact current content.`,
    
    occurrenceMismatch: (expected: number, found: number) => 
        `Expected ${expected} occurrence(s) but found ${found}. Use read_file to verify current content.`,
    
    cannotReadFile: (path: string) => 
        `Cannot read file: ${path}. Check file permissions and encoding.`,
    
    isDirectory: (path: string) => 
        `Path is a directory: ${path}. Use list_root or find_files to explore directories.`,
};
```

Then use consistently:
```typescript
import { toolErrors } from "./errors";

// In tools:
return { ok: false, error: toolErrors.fileNotFound(args.path) };
```

---

**When complete, delete this file: `rm todo/17-standardize-tool-error-messages.md`**

