<!-- 2a8c28cc-b44f-45aa-9cfe-38d899296ee2 80336b79-7a54-4661-bbe9-1aa091055a46 -->
# Slash Command System Implementation

## Architecture Overview

Registry-driven command system with span-based parsing, discriminated union transcript entries, and cursor-aware autocomplete.

**Files to Create:**

- [`src/commands/types.ts`](src/commands/types.ts) - Types + discriminated entry union
- [`src/commands/models.ts`](src/commands/models.ts) - Shared model list (used by registry + Composer)
- [`src/commands/registry.ts`](src/commands/registry.ts) - Command registry
- [`src/commands/parse.ts`](src/commands/parse.ts) - Span-based tokenizer
- [`src/commands/commands/quit.ts`](src/commands/commands/quit.ts)
- [`src/commands/commands/new.ts`](src/commands/commands/new.ts)
- [`src/commands/commands/model.ts`](src/commands/commands/model.ts)
- [`src/commands/commands/summarize.ts`](src/commands/commands/summarize.ts)
- [`src/commands/commands/help.ts`](src/commands/commands/help.ts)
- [`src/commands/index.ts`](src/commands/index.ts) - Exports
- [`src/ui/CommandReview.tsx`](src/ui/CommandReview.tsx) - Picker UI

**Files to Modify:**

- [`src/orchestrator/index.ts`](src/orchestrator/index.ts) - Rolling summary, model switching, command preprocessing
- [`src/provider/anthropic.ts`](src/provider/anthropic.ts) - Per-request model, tools-disabled mode
- [`src/ui/Composer.tsx`](src/ui/Composer.tsx) - Cursor-aware autocomplete
- [`src/ui/Transcript.tsx`](src/ui/Transcript.tsx) - Render command entries
- [`src/ui/App.tsx`](src/ui/App.tsx) - Wire command callbacks

---

## 1. Discriminated Union Transcript Entries

New entry types alongside existing `diff_review` and `shell_review`:

```typescript
interface CommandReviewEntry {
    type: "command_review";
    id: string;
    ts: number;
    commandName: string;
    prompt: string;
    options: Array<{ id: string; label: string; hint?: string }>;
    status: "pending" | "selected" | "cancelled";
    selectedId?: string;
}

interface CommandExecutedEntry {
    type: "command_executed";
    id: string;
    ts: number;
    commandName: string;
    summary: string;
}
```

Every command produces a `command_executed` entry for timeline clarity.

---

## 2. Span-Based Parser (`src/commands/parse.ts`)

Returns exact character spans for clean removal:

```typescript
interface ParsedCommand {
    name: string;
    args: ParsedArgs;
    span: { start: number; end: number };
    nameSpan: { start: number; end: number };
    argsSpan?: { start: number; end: number };
}

parseCommandInvocations(input: string, registry: CommandRegistry): {
    invocations: ParsedCommand[];
    remainingText: string;
}
```

**Parsing rules:**

- `/name` preceded by start-of-line or whitespace
- Args stop at next `/name` token (unless inside quotes)
- `remainingText` computed by slicing out spans in reverse order

Example: `"please /summarize then /model opus"`:

- `/summarize` span: `[7, 17]`, args: none
- `/model` span: `[23, 35]`, args: `["opus"]`
- `remainingText`: `"please  then "`

---

## 3. Model List (`src/commands/models.ts`)

Shared constant used by `/model` command and Composer autocomplete:

```typescript
export const MODELS = [
    { alias: "sonnet-4", pinned: "claude-sonnet-4-20250514", display: "Claude Sonnet 4" },
    { alias: "opus-4", pinned: "claude-opus-4-20250514", display: "Claude Opus 4" },
    { alias: "opus-4-1", pinned: "claude-opus-4-1-20250805", display: "Claude Opus 4.1" },
    { alias: "sonnet-4-5", pinned: "claude-sonnet-4-5-20250929", display: "Claude Sonnet 4.5" },
    { alias: "haiku-4-5", pinned: "claude-haiku-4-5-20251001", display: "Claude Haiku 4.5" },
    { alias: "opus-4-5", pinned: "claude-opus-4-5-20251101", display: "Claude Opus 4.5" },
] as const;

export function resolveModelId(input: string): string | null;
```

Picker shows display name, selection uses pinned ID. `/model opus-4-5` maps via alias.

---

## 4. Provider Changes

**Do not recreate provider on model switch.** Pass model per request:

```typescript
interface StreamOptions {
    tools?: ToolSchema[];
    model?: string;
}

stream(messages, callbacks, { tools, model }): Promise<void>
```

For `/summarize`, pass `tools: []` and append "Do not request tools" to system prompt.

---

## 5. Orchestrator Changes

### New state:

```typescript
let rollingSummary: StructuredSummary | null = null;
let currentModel: string = "claude-sonnet-4-20250514";
let pendingCommandReview: PendingCommandReview | null = null;
```

### `sendMessage(content)` flow:

1. `parseCommandInvocations(content, commandRegistry)`
2. Execute each invocation sequentially (blocking if picker needed)
3. Add `command_executed` entry for each
4. If `remainingText.trim()` non-empty, proceed with model request

### `buildMessagesForClaude()`:

Prepend `rollingSummary` as structured block if present.

### `resetChat()` behavior (`/new`):

- Clear transcript
- Clear rolling summary
- Clear pending review state
- Keep PTY session alive (per-project, not per-chat)
- Keep allowlist intact

### New methods:

- `setModel(modelId)` - Updates `currentModel`
- `resetChat()` - As above
- `resolveCommandReview(id, selection | "cancel")`

---

## 6. Structured Summary Format

`/summarize` produces structured text, not free-form:

```typescript
interface StructuredSummary {
    goal: string;
    decisions: string[];
    constraints: string[];
    openTasks: string[];
    importantFiles: string[];
}
```

Prompt instructs Claude to produce JSON matching this shape. Stored as-is, serialized to readable block for context injection.

**Transcript trimming rule:** Keep last N user+assistant entries, but preserve `diff_review` and `shell_review` outcomes (status != pending) to avoid re-proposing accepted changes.

---

## 7. Cursor-Aware Autocomplete

Composer tracks cursor position (already does). On keystroke:

```typescript
interface TokenAtCursor {
    token: string;
    tokenStart: number;
    tokenEnd: number;
    prefix: string;
}

getTokenAtCursor(value: string, cursorPos: number): TokenAtCursor | null
```

If token starts with `/`, query registry for suggestions. Tab replaces `[tokenStart, cursorPos]` with selected suggestion.

**Key bindings:**

- `Tab`: Insert suggestion at cursor position
- `Up/Down`: Navigate (only when suggestions visible)
- `Esc`: Close suggestions
- `Enter`: Send message (closes suggestions first)

---

## 8. CommandReview Component

Same pattern as `ShellReview`:

```tsx
<CommandReview
    commandName="model"
    prompt="Select model"
    options={[{ id, label, hint }]}
    status="pending" | "selected" | "cancelled"
    selectedId={string | undefined}
    onSelect={(id) => void}
    onCancel={() => void}
    isActive={boolean}
/>
```

Keyboard: Up/Down navigate, Enter select, Esc cancel.

---

## Implementation Order

1. Command registry + span-based parser + orchestrator preprocessing (no UI)
2. `/quit`, `/new`, `/help` (fast wins, no picker needed)
3. `/model` with argument only (no picker)
4. Composer autocomplete for command names
5. `CommandReview` picker UI + `/model` without args
6. `/summarize` + structured summary + context injection
7. Composer autocomplete for model arguments

### To-dos

- [ ] Create src/commands/types.ts with CommandDefinition, CommandContext, etc.
- [ ] Create src/commands/registry.ts with createCommandRegistry factory
- [ ] Create src/commands/parse.ts with tokenizer and parseCommandInvocations
- [ ] Implement /quit command
- [ ] Implement /new command
- [ ] Implement /model command with picker support
- [ ] Implement /summarize command with rolling summary
- [ ] Implement /help command
- [ ] Modify orchestrator for rolling summary, model switching, command preprocessing
- [ ] Modify provider to support dynamic model and tools-disabled mode
- [ ] Create CommandReview.tsx for interactive pickers
- [ ] Update Transcript.tsx to render command_review entries
- [ ] Add autocomplete dropdown to Composer.tsx
- [ ] Wire command callbacks in App.tsx