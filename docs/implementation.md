# North Implementation Details

This document describes the current implementation state and module architecture.

## Milestone Status

| Milestone | Status |
|-----------|--------|
| 1: Chat UI + streaming | ✅ Complete |
| 2: Read/search tools | ✅ Complete |
| 3: Deterministic edits + diff review | ✅ Complete |
| 4: Persistent PTY shell + approvals | ✅ Complete |
| 5: Memory + project card cache | Not started |
| 6: UX polish | Not started |

*Last verified: 2025-12-08*

## Project Structure

```
src/
├── index.ts              # CLI entry point, arg parsing, app bootstrap
├── logging/
│   └── index.ts          # Append-only JSON-lines logger
├── orchestrator/
│   └── index.ts          # Conversation state, message flow, tool loop, write/shell approval
├── provider/
│   └── anthropic.ts      # Claude streaming client with tool support
├── shell/
│   └── index.ts          # Persistent PTY service with sentinel-based output parsing
├── storage/
│   └── allowlist.ts      # Per-project shell command allowlist (.north/allowlist.json)
├── tools/
│   ├── index.ts          # Tool exports and registry factory
│   ├── types.ts          # Tool type definitions (including edit and shell types)
│   ├── registry.ts       # Tool registry implementation with approval policy
│   ├── list_root.ts      # List repo root entries
│   ├── find_files.ts     # Glob pattern file search
│   ├── search_text.ts    # Text/regex search (ripgrep or fallback)
│   ├── read_file.ts      # File content reader with ranges
│   ├── read_readme.ts    # README finder and reader
│   ├── detect_languages.ts # Language composition detector
│   ├── hotfiles.ts       # Frequently modified files (git or fallback)
│   ├── edit_replace_exact.ts  # Exact text replacement
│   ├── edit_insert_at_line.ts # Insert at line number
│   ├── edit_create_file.ts    # Create or overwrite file
│   ├── edit_apply_batch.ts    # Atomic batch edits
│   └── shell_run.ts      # Shell command execution (requires approval)
├── ui/
│   ├── App.tsx           # Root Ink component, SIGINT handling, review wiring
│   ├── Composer.tsx      # Multiline input with Ctrl+J newline
│   ├── DiffReview.tsx    # Inline diff viewer with accept/reject
│   ├── ShellReview.tsx   # Shell command approval with run/always/deny
│   ├── StatusLine.tsx    # Model name, project path display
│   └── Transcript.tsx    # User/assistant/tool/diff_review/shell_review rendering
└── utils/
    ├── repo.ts           # Repo root detection
    ├── ignore.ts         # Gitignore parsing and file walking
    └── editing.ts        # Diff computation and atomic file writes
```

## Module Responsibilities

### index.ts (Entry Point)

- Parses CLI args (`--path`, `--log-level`)
- Detects repo root from start directory
- Initializes logger
- Renders Ink app
- Handles clean exit via `waitUntilExit()`
- Wires tool logging callbacks

### logging/index.ts

- Writes to `~/.local/state/north/north.log`
- JSON-lines format (one JSON object per line)
- Events: `app_start`, `user_prompt`, `model_request_start`, `model_request_complete`, `tool_call_start`, `tool_call_complete`, `write_review_shown`, `write_review_decision`, `write_apply_start`, `write_apply_complete`, `shell_review_shown`, `shell_review_decision`, `shell_run_start`, `shell_run_complete`, `app_exit`
- Silent fail on write errors (logging must not crash the app)

### orchestrator/index.ts

- Owns `transcript` (array of `TranscriptEntry`)
- Owns `isProcessing` and `pendingReviewId` flags
- Implements tool call loop:
  1. Append user entry to transcript
  2. Create assistant entry with `isStreaming: true`
  3. Send messages to Claude with tool schemas
  4. Stream response text (throttled at ~32ms)
  5. If `stopReason === "tool_use"`:
     - Execute each tool via registry
     - For `approvalPolicy: "write"`: create `diff_review` entry, block for user decision
     - For `approvalPolicy: "shell"`: check allowlist, create `shell_review` if not allowed
     - On accept/run: apply edits or execute command, send result to Claude
     - On reject/deny: send rejection/denial to Claude
  6. Continue until Claude stops requesting tools
- Streaming throttle: buffer chunks, flush every 32ms or on complete
- Emits state changes via `onStateChange` callback
- Exposes `resolveWriteReview(reviewId, decision)` for UI to signal accept/reject
- Exposes `resolveShellReview(reviewId, decision)` for UI to signal run/always/deny
- Exposes `stop()` for clean SIGINT handling

### shell/index.ts

- Creates and manages one PTY session per project root
- Uses `bun-pty` for cross-platform PTY support
- Sentinel-based output parsing:
  - Wraps commands with `__NORTH_START_{uuid}__` and `__NORTH_END_{uuid}__EXIT__{exitCode}__`
  - Buffers PTY output until end marker detected
  - Extracts command output between markers
- API: `getShellService(repoRoot, logger)` returns service with `run(command, options)` and `dispose()`
- `disposeAllShellServices()` cleans up all sessions on exit

### storage/allowlist.ts

- Per-project shell command allowlist at `.north/allowlist.json`
- Simple JSON format: `{ "allowedCommands": ["pnpm test", "bun test"] }`
- API: `isCommandAllowed(repoRoot, command)`, `allowCommand(repoRoot, command)`, `getAllowedCommands(repoRoot)`
- Exact string matching only (no patterns)
- Creates `.north/` directory on first write

### provider/anthropic.ts

- Wraps `@anthropic-ai/sdk`
- Default model: `claude-sonnet-4-20250514`
- Streaming via `client.messages.stream()`
- Supports tool definitions and tool_use blocks
- Callbacks: `onChunk`, `onToolCall`, `onComplete`, `onError`
- Helpers for building tool result messages

### tools/registry.ts

- In-process registry mapping tool name -> definition
- Each tool has: name, description, inputSchema, approvalPolicy, execute()
- `getSchemas()` returns tool definitions for Claude API
- `getApprovalPolicy()` returns "none", "write", or "shell" for a tool
- `execute()` runs tool and returns structured result

### tools/*.ts (Tool Implementations)

All tools follow the pattern:
- Input validation
- Operation scoped to repoRoot
- Structured result with `ok`, `data`, `error`

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `list_root` | List repo root entries | Respects .gitignore |
| `find_files` | Glob pattern search | Case-insensitive, limit |
| `search_text` | Text/regex search | Uses ripgrep if available |
| `read_file` | Read file content | Line ranges, truncation |
| `read_readme` | Read README | Auto-detect README.* |
| `detect_languages` | Language composition | By extension and size |
| `hotfiles` | Important files | Git history or fallback |
| `edit_replace_exact` | Replace exact text | Requires user approval |
| `edit_insert_at_line` | Insert at line | 1-based, requires approval |
| `edit_create_file` | Create/overwrite file | Requires approval |
| `edit_apply_batch` | Atomic batch edits | All-or-nothing, requires approval |
| `shell_run` | Execute shell command | Persistent PTY, requires approval or allowlist |

### utils/ignore.ts

- Parses .gitignore patterns
- Always ignores common directories (node_modules, .git, etc.)
- `createIgnoreChecker()` returns checker with `isIgnored(path, isDir)`
- `walkDirectory()` recursively walks repo respecting ignores
- `listRootEntries()` lists root level entries

### ui/Transcript.tsx

- Renders conversation history
- User messages: cyan label
- Assistant messages: magenta label
- Tool messages: yellow ⚡ icon, gray text
- Diff review entries: bordered box with diff content
- Error tool results: red text
- Streaming indicator (●)

### ui/DiffReview.tsx

- Renders inline diff with syntax highlighting
- Green for additions, red for deletions, cyan for hunk headers
- Truncates diffs over 100 lines with indicator
- Shows file stats (+lines/-lines)
- Keyboard shortcuts: `a` accept, `r` reject
- Status badges: pending (yellow border), accepted (green), rejected (red)

### ui/ShellReview.tsx

- Renders shell command approval prompt
- Shows command and optional cwd
- Keyboard shortcuts: `r` run, `a` always (adds to allowlist), `d` deny
- Status badges: pending (yellow), ran/always (green), denied (red)

### utils/editing.ts

- `resolveSafePath()`: validates paths stay within repo root
- `readFileContent()`: safe file reading with error handling
- `preserveTrailingNewline()`: ensures trailing newline consistency after edits
- `computeUnifiedDiff()`: generates unified diff format
- `computeCreateFileDiff()`: generates diff for new files
- `applyEditsAtomically()`: writes to temp files then renames for safety

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
    │
    ▼
┌─► provider.stream(messages, { tools })
│       │
│       ├──► onChunk: buffer chunks, throttled emit
│       ├──► onToolCall: add tool intent to transcript
│       │
│       ▼
│   Stream completes
│       │
│       ├──► If tool calls requested:
│       │       │
│       │       ├──► Execute each tool
│       │       ├──► Log tool_call_start/complete
│       │       ├──► Update tool entry with result
│       │       ├──► Build tool result message
│       │       └──► Continue loop ─────────────────┐
│       │                                           │
│       └──► No tools: exit loop                    │
│                                                   │
└───────────────────────────────────────────────────┘
    │
    ▼
Transcript re-renders with all content
```

## Key Implementation Details

### Tool Call Loop

When Claude requests tools:
1. Stream completes with `stopReason: "tool_use"`
2. Orchestrator executes each tool via registry
3. Results are JSON-stringified and sent back as `tool_result` blocks
4. Claude processes results and may request more tools or respond

### Write Approval Flow

When Claude requests an edit tool (approvalPolicy: "write"):
1. Tool executes in "prepare" mode - computes diff but doesn't write
2. Orchestrator creates a `diff_review` transcript entry with status "pending"
3. Tool loop blocks, waiting for user decision
4. DiffReview component renders inline diff with Accept/Reject options
5. User presses `a` (accept) or `r` (reject)
6. On Accept: edits applied atomically (temp files then rename)
7. On Reject: nothing written, status set to "rejected"
8. Tool result sent to Claude with outcome (applied: true/false)
9. Claude continues processing

### Shell Approval Flow

When Claude requests `shell_run` (approvalPolicy: "shell"):
1. Orchestrator checks if command is in `.north/allowlist.json`
2. If allowed: execute immediately in persistent PTY, return result
3. If not allowed: create `shell_review` transcript entry with status "pending"
4. Tool loop blocks, waiting for user decision
5. ShellReview component renders command with Run/Always/Deny options
6. User presses `r` (run), `a` (always), or `d` (deny)
7. On Run: execute command, status set to "ran"
8. On Always: add to allowlist, execute command, status set to "always"
9. On Deny: return `{ denied: true }` to Claude, status set to "denied"
10. Tool result sent to Claude with outcome
11. Claude continues processing

### Gitignore Handling

The ignore checker:
1. Always ignores common directories (node_modules, .git, etc.)
2. Parses .gitignore if present at repo root
3. Supports glob patterns: `*`, `**`, `?`
4. Supports negation patterns: `!important.log`
5. Supports directory-only patterns: `logs/`

### Search Implementation

`search_text` uses ripgrep if available (faster, better output), with fallback to pure JS implementation:
- Ripgrep: spawns `rg --json` for structured output
- Fallback: walks files and searches line by line

### Output Truncation

All tools enforce limits to prevent context overflow:
- `read_file`: 500 lines or 100KB max
- `search_text`: 50 matches default, 200 max
- `find_files`: 50 files default, 500 max
- `read_readme`: 8KB max
- `hotfiles`: 10 files default, 50 max

Truncation is always explicit with `truncated: true` in results.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API client |
| `ink` | ^5.1.0 | Terminal UI framework |
| `react` | ^18.3.1 | UI component model |
| `bun-pty` | ^0.4.2 | Cross-platform PTY for persistent shell |

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
{"timestamp":"2025-12-08T10:00:06.000Z","level":"info","event":"tool_call_start","data":{"toolName":"search_text","argsSummary":{"query":"useState","path":"src"}}}
{"timestamp":"2025-12-08T10:00:06.150Z","level":"info","event":"tool_call_complete","data":{"toolName":"search_text","durationMs":150,"ok":true}}
{"timestamp":"2025-12-08T10:00:08.500Z","level":"info","event":"model_request_complete","data":{"requestId":"req-123-abc","durationMs":3499}}
```
