# Add Overlap Detection in Batch Edits

## Severity: Minor

## Location
`src/tools/edit_apply_batch.ts` (lines 49-68)

## Problem
Multiple edits to the same file are validated independently against the original file content, but may conflict. For example, two `edit_replace_exact` calls that both match the same text will both succeed validation, but only the first would work in practice. The second edit sees stale content assumptions.

## Solution
1. Track per-file content state through the batch
2. Apply edits sequentially to an in-memory buffer
3. Validate each subsequent edit against the modified content, not the original

## Implementation Notes
```typescript
async execute(args: EditBatchInput, ctx: ToolContext): Promise<ToolResult<EditPrepareResult>> {
    if (!args.edits || args.edits.length === 0) {
        return { ok: false, error: "No edits provided" };
    }

    // Track modified content per file
    const fileContents = new Map<string, string>();
    const allDiffs: FileDiff[] = [];
    const allOperations: EditOperation[] = [];
    const errors: string[] = [];

    for (let i = 0; i < args.edits.length; i++) {
        const edit = args.edits[i];
        const tool = EDIT_TOOLS[edit.toolName];

        if (!tool) {
            errors.push(`Edit ${i + 1}: Unknown tool "${edit.toolName}"`);
            continue;
        }

        // Create a modified context that uses our tracked content
        const modifiedCtx = {
            ...ctx,
            // Override file reading to use tracked content if available
            getFileContent: (path: string) => fileContents.get(path),
        };

        const result = await tool.execute(edit.args, modifiedCtx);

        if (!result.ok) {
            errors.push(`Edit ${i + 1} (${edit.toolName}): ${result.error}`);
            continue;
        }

        const data = result.data as EditPrepareResult;
        
        // Update tracked content for subsequent edits
        for (const op of data.applyPayload) {
            fileContents.set(op.path, op.content);
        }
        
        allDiffs.push(...data.diffsByFile);
        allOperations.push(...data.applyPayload);
    }

    // ... rest of implementation
}
```

Note: This requires refactoring the individual edit tools to optionally accept pre-loaded content.

---

**When complete, delete this file: `rm todo/11-batch-edit-overlap-detection.md`**


