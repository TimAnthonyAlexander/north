# Add Retry with Backoff to Anthropic API Calls

## Severity: Major

## Location
`src/provider/anthropic.ts` (lines 118-186)

## Problem
Anthropic API rate limits and transient errors (429, 503, 529) will crash the conversation loop. Users will see cryptic errors and lose conversation context. No retry logic exists.

## Solution
1. Wrap the streaming call in retry logic with exponential backoff
2. Handle specific error codes appropriately:
   - 429 (rate limit): Wait and retry with backoff
   - 503/529 (overloaded): Wait and retry
   - 400/401 (bad request/auth): Don't retry, surface error
3. Surface rate-limit errors gracefully to the UI
4. Add configurable max retries (default: 3)

## Implementation Notes
```typescript
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function streamWithRetry(/* params */): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // existing streaming logic
            return;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            
            const status = (err as any)?.status;
            if (status === 429 || status === 503 || status === 529) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            
            // Non-retryable error
            throw err;
        }
    }
    
    throw lastError;
}
```

---

**When complete, delete this file: `rm todo/04-api-retry-backoff.md`**


