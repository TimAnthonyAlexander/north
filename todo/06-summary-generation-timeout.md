# Add Timeout to Summary Generation

## Severity: Minor

## Location
`src/orchestrator/index.ts` (lines 644-684, `generateSummary`)

## Problem
The summarization API call has no timeout or abort signal. If the API hangs or is slow, the summarize command blocks indefinitely with no way to cancel.

## Solution
1. Create an AbortController with a timeout
2. Pass the signal to the provider stream call
3. Clean up on timeout or completion

## Implementation Notes
```typescript
async generateSummary(): Promise<StructuredSummary | null> {
    const SUMMARY_TIMEOUT_MS = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
    
    try {
        // ... existing logic ...
        
        provider.stream(
            [{ role: "user", content: summaryPrompt }],
            { /* callbacks */ },
            { 
                tools: [],
                model: currentModel,
                systemOverride: SUMMARY_SYSTEM,
                signal: controller.signal,  // Add this
            }
        );
        
        // ... rest of logic ...
    } finally {
        clearTimeout(timeoutId);
    }
}
```

---

**When complete, delete this file: `rm todo/06-summary-generation-timeout.md`**


