# Type toolCallId and shellResult Properly in TranscriptEntry

## Severity: Trivial

## Location
`src/orchestrator/index.ts` (lines 259, 284, 372, etc.)

## Problem
Multiple `(entry as any).toolCallId` and `(entry as any).shellResult` casts bypass TypeScript's type safety. This could hide bugs and makes the code harder to maintain.

## Solution
Extend the `TranscriptEntry` interface to include these optional properties properly typed.

## Implementation Notes
In the TranscriptEntry interface, add:
```typescript
export interface TranscriptEntry {
    id: string;
    role: "user" | "assistant" | "tool" | "diff_review" | "shell_review" | "command_review" | "command_executed";
    content: string;
    ts: number;
    isStreaming?: boolean;
    toolResult?: { ok: boolean; data?: unknown; error?: string };
    diffContent?: FileDiff[];
    filesCount?: number;
    toolName?: string;
    reviewStatus?: ReviewStatus | CommandReviewStatus;
    applyPayload?: unknown;
    shellCommand?: string;
    shellCwd?: string | null;
    shellTimeoutMs?: number | null;
    commandName?: string;
    commandPrompt?: string;
    commandOptions?: PickerOption[];
    commandSelectedId?: string;
    
    // Add these:
    toolCallId?: string;
    shellResult?: { ok: boolean; data?: unknown; error?: string };
}
```

Then remove all `as any` casts and use proper property access:
```typescript
// Before
(reviewEntry as any).toolCallId = toolCall.id;

// After
reviewEntry.toolCallId = toolCall.id;
```

---

**When complete, delete this file: `rm todo/10-type-transcript-entry-properly.md`**

