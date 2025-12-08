# Add Error Handling to sendMessage Call in UI

## Severity: Minor

## Location
`src/ui/App.tsx` (line 121)

## Problem
`void orchestrator.sendMessage(content)` discards the promise. If `sendMessage` throws asynchronously, it becomes an unhandled rejection which could crash the process or leave the app in a bad state.

## Solution
Add a `.catch()` handler to log or handle errors gracefully.

## Implementation Notes
```typescript
function handleSubmit(content: string) {
    if (!orchestrator) return;
    onUserPrompt(content.length);
    orchestrator.sendMessage(content).catch((err) => {
        // Log error but don't crash - orchestrator already handles most errors internally
        console.error("sendMessage error:", err);
    });
}
```

Or use an async IIFE if you prefer:
```typescript
function handleSubmit(content: string) {
    if (!orchestrator) return;
    onUserPrompt(content.length);
    (async () => {
        try {
            await orchestrator.sendMessage(content);
        } catch (err) {
            // Handle gracefully
        }
    })();
}
```

---

**When complete, delete this file: `rm todo/07-catch-sendmessage-promise.md`**


