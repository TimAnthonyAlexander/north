# Fix useEffect Dependency Array in App.tsx

## Severity: Minor

## Location
`src/ui/App.tsx` (lines 61-100)

## Problem
The `useEffect` creating the orchestrator has an empty `[]` dependency array but captures callback props (`onRequestStart`, `onRequestComplete`, etc.). If the parent component re-renders with new callback functions, the orchestrator will continue using the stale callbacks from the initial render.

## Solution
Options:
1. Use `useRef` to store callbacks and update refs on each render
2. Include callbacks in the dependency array (but this would recreate orchestrator on every render)
3. Use a stable callback pattern with `useCallback` in the parent

## Implementation Notes
Recommended approach using refs:
```typescript
const callbacksRef = useRef({
    onRequestStart,
    onRequestComplete,
    onToolCallStart,
    onToolCallComplete,
    onWriteReviewShown,
    onWriteReviewDecision,
    onWriteApplyStart,
    onWriteApplyComplete,
    onShellReviewShown,
    onShellReviewDecision,
    onShellRunStart,
    onShellRunComplete,
});

useEffect(() => {
    callbacksRef.current = {
        onRequestStart,
        onRequestComplete,
        // ... etc
    };
});

useEffect(() => {
    const orch = createOrchestratorWithTools(
        {
            onStateChange(state: OrchestratorState) {
                setTranscript(state.transcript);
                setIsProcessing(state.isProcessing);
                setPendingReviewId(state.pendingReviewId);
                setCurrentModel(state.currentModel);
            },
            onRequestStart: (...args) => callbacksRef.current.onRequestStart(...args),
            onRequestComplete: (...args) => callbacksRef.current.onRequestComplete(...args),
            // ... etc
        },
        { repoRoot: projectPath, logger, cursorRulesText }
    );
    // ... rest
}, [projectPath, logger, cursorRulesText]); // Only recreate on these changes
```

---

**When complete, delete this file: `rm todo/12-useeffect-dependency-array.md`**

