# North Implementation Details

This document describes the current implementation state and module architecture.

## Milestone Status

| Milestone | Status |
|-----------|--------|
| 1: Chat UI + streaming | ✅ Complete |
| 2: Read/search tools | Not started |
| 3: Deterministic edits + diff review | Not started |
| 4: Persistent PTY shell + approvals | Not started |
| 5: Memory + project card cache | Not started |
| 6: UX polish | Not started |

## Project Structure

```
src/
├── index.ts              # CLI entry point, arg parsing, app bootstrap
├── logging/
│   └── index.ts          # Append-only JSON-lines logger
├── orchestrator/
│   └── index.ts          # Conversation state, message flow, streaming coordination
├── provider/
│   └── anthropic.ts      # Claude streaming client
├── ui/
│   ├── App.tsx           # Root Ink component, SIGINT handling
│   ├── Composer.tsx      # Multiline input with Ctrl+J newline
│   ├── StatusLine.tsx    # Model name, project path display
│   └── Transcript.tsx    # User/assistant message rendering
└── utils/
    └── repo.ts           # Repo root detection (walks up to filesystem root)
```

## Module Responsibilities

### index.ts (Entry Point)

- Parses CLI args (`--path`, `--log-level`)
- Detects repo root from start directory
- Initializes logger
- Renders Ink app
- Handles clean exit via `waitUntilExit()`

### logging/index.ts

- Writes to `~/.local/state/north/north.log`
- JSON-lines format (one JSON object per line)
- Events: `app_start`, `user_prompt`, `model_request_start`, `model_request_complete`, `app_exit`
- Silent fail on write errors (logging must not crash the app)

### orchestrator/index.ts

- Owns `transcript` (array of `TranscriptEntry`)
- Owns `isProcessing` flag
- Builds message history for API calls (excludes streaming entries)
- Throttles streaming updates (~32ms) to prevent UI thrashing
- Emits state changes via callback

### provider/anthropic.ts

- Wraps `@anthropic-ai/sdk`
- Default model: `claude-sonnet-4-20250514`
- Streaming via `client.messages.stream()`
- Callbacks: `onChunk`, `onComplete`, `onError`

### ui/App.tsx

- Root component
- Creates orchestrator on mount
- Handles SIGINT (calls Ink's `exit()`)
- Wires callbacks between orchestrator and logger

### ui/Composer.tsx

- Multiline text input
- Enter: send message (if non-empty after trim)
- Ctrl+J: insert newline (reliable across terminals)
- Shift+Enter: insert newline (fallback, terminal-dependent)
- Arrow keys, backspace for editing
- Disabled state while processing

### ui/Transcript.tsx

- Renders conversation history
- User messages: cyan label
- Assistant messages: magenta label
- Streaming indicator (●) while assistant is typing

### ui/StatusLine.tsx

- Shows project name (basename of path)
- Shows current model

### utils/repo.ts

- `detectRepoRoot(startPath)`: walks up directory tree
- Looks for markers: `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`
- Falls back to start directory if no marker found

## Data Flow

```
User Input
    │
    ▼
Composer.onSubmit(content)
    │
    ▼
App.handleSubmit(content)
    │
    ├──► logger.info("user_prompt", { length })
    │
    ▼
orchestrator.sendMessage(content)
    │
    ├──► Push user entry to transcript
    ├──► Push assistant entry (streaming: true)
    ├──► Build messages array
    ▼
provider.stream(messages)
    │
    ├──► onChunk: buffer chunks, throttled emit
    ├──► onComplete: flush buffer, finalize entry
    ▼
Transcript re-renders with updated content
```

## Key Implementation Details

### Streaming Throttle

Chunks arrive rapidly during streaming. To avoid excessive re-renders:

1. Chunks are buffered in `streamBuffer`
2. `emitStateThrottled()` schedules a flush every 32ms
3. On `onComplete`, pending timeout is cleared and buffer is flushed immediately

### Message Duplication Prevention

The orchestrator builds the messages array *before* pushing the user entry to the transcript, then pushes the entry. This ensures the user message appears exactly once in the API call.

### Repo Root Detection

Walks from start directory up to filesystem root (where `dirname(path) === path`), checking for repo markers at each level. Returns the first directory containing a marker, or the start directory if none found.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API client |
| `ink` | ^5.1.0 | Terminal UI framework |
| `react` | ^18.3.1 | UI component model |

## Running

```bash
# Development
bun run dev

# With options
bun run dev --path /some/repo --log-level debug

# Build
bun run build
```

## Environment

Requires `ANTHROPIC_API_KEY` environment variable.

## Logs

Location: `~/.local/state/north/north.log`

Example entries:
```json
{"timestamp":"2025-12-08T10:00:00.000Z","level":"info","event":"app_start","data":{"version":"0.1.0","projectPath":"/path/to/repo","cwd":"/path/to/repo"}}
{"timestamp":"2025-12-08T10:00:05.000Z","level":"info","event":"user_prompt","data":{"length":42}}
{"timestamp":"2025-12-08T10:00:05.001Z","level":"info","event":"model_request_start","data":{"requestId":"req-123-abc","model":"claude-sonnet-4-20250514"}}
{"timestamp":"2025-12-08T10:00:08.500Z","level":"info","event":"model_request_complete","data":{"requestId":"req-123-abc","durationMs":3499}}
```

