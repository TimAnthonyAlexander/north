# North Implementation Details

This document describes the current implementation state and module architecture.

## Milestone Status

| Milestone | Status |
|-----------|--------|
| 1: Chat UI + streaming | ✅ Complete |
| 2: Read/search tools | ✅ Complete |
| 3: Deterministic edits + diff review | ✅ Complete |
| 4: Persistent PTY shell + approvals | ✅ Complete |
| 4.5: Slash commands + model switching | ✅ Complete |
| 5: Memory + project card cache | Not started |
| 6: UX polish | Not started |

*Last verified: 2025-12-08*

## Project Structure

```
src/
├── index.ts              # CLI entry point, arg parsing, app bootstrap
├── commands/
│   ├── index.ts          # Command exports and registry factory
│   ├── types.ts          # Command type definitions
│   ├── models.ts         # Shared model list (alias, pinned, display)
│   ├── registry.ts       # Command registry implementation
│   ├── parse.ts          # Span-based command tokenizer
│   └── commands/
│       ├── quit.ts       # /quit - exit application
│       ├── new.ts        # /new - reset chat
│       ├── help.ts       # /help - list commands
│       ├── model.ts      # /model - switch Claude model
│       ├── mode.ts       # /mode - switch conversation mode (ask/agent)
│       └── summarize.ts  # /summarize - summarize and trim transcript
├── logging/
│   └── index.ts          # Append-only JSON-lines logger
├── orchestrator/
│   └── index.ts          # Conversation state, message flow, tool loop, commands, reviews
├── provider/
│   ├── index.ts          # Provider factory, selects provider by model
│   ├── anthropic.ts      # Claude streaming client (Anthropic Messages API)
│   └── openai.ts         # GPT streaming client (OpenAI Responses API)
├── rules/
│   ├── index.ts          # Rules module exports
│   └── cursor.ts         # Cursor rules loader (.cursor/rules/*.mdc)
├── shell/
│   └── index.ts          # Persistent PTY service with sentinel-based output parsing
├── storage/
│   ├── allowlist.ts      # Per-project shell command allowlist (.north/allowlist.json)
│   ├── autoaccept.ts     # Per-project edit auto-accept settings
│   └── config.ts         # Global config (~/.config/north/config.json)
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
│   ├── Composer.tsx      # Multiline input with slash command autocomplete
│   ├── CommandReview.tsx # Interactive picker for commands (e.g., model selection)
│   ├── DiffReview.tsx    # Inline diff viewer with accept/reject
│   ├── ShellReview.tsx   # Shell command approval with run/always/deny
│   ├── StatusLine.tsx    # Model name, mode indicator, project path display
│   └── Transcript.tsx    # User/assistant/tool/review/command entry rendering
└── utils/
    ├── repo.ts           # Repo root detection
    ├── ignore.ts         # Gitignore parsing and file walking
    ├── editing.ts        # Diff computation and atomic file writes
    ├── tokens.ts         # Token estimation for context tracking
    └── retry.ts          # Transient error retry with exponential backoff

tests/
└── openai-provider.test.ts  # OpenAI provider unit tests
```

## Module Responsibilities

### index.ts (Entry Point)

- Parses CLI args (`--path`, `--log-level`)
- Detects repo root from start directory
- Initializes logger
- Renders Ink app
- Handles clean exit via `waitUntilExit()`
- Wires tool logging callbacks

### commands/ (Slash Command System)

Registry-driven command system with span-based parsing, cursor-aware autocomplete, and interactive pickers.

#### commands/types.ts

Defines core types:
- `Mode`: "ask" | "agent" - conversation mode type
- `CommandDefinition`: name, description, usage, execute function
- `CommandContext`: orchestrator methods available to commands
- `ParsedArgs`: positional args and flags from parsing
- `PickerOption`: id, label, hint for interactive selection
- `CommandReviewStatus`: "pending" | "selected" | "cancelled"
- `StructuredSummary`: goal, decisions, constraints, openTasks, importantFiles

#### commands/models.ts

Centralized model list shared by `/model` command and Composer autocomplete:
- `ProviderType`: "anthropic" | "openai"
- `MODELS`: array of `{ alias, pinned, display, contextLimitTokens, provider }`
- `resolveModelId(input)`: maps alias or pinned ID to pinned ID (supports both Claude and GPT prefixes)
- `getModelDisplay(modelId)`: returns human-readable name
- `getModelContextLimit(modelId)`: returns context limit in tokens
- `getModelProvider(modelId)`: returns provider type for model
- `DEFAULT_MODEL`: default pinned model ID (Claude Sonnet 4)

**Supported Models:**
- Anthropic: sonnet-4, opus-4, opus-4-1, sonnet-4-5, haiku-4-5, opus-4-5
- OpenAI: gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-mini, gpt-5.1-codex-max, gpt-5, gpt-5-mini, gpt-5-nano

#### commands/registry.ts

- In-process registry mapping command name -> definition
- `register(command)`: add command to registry
- `has(name)`: check if command exists (used by parser)
- `list()`: get all commands (used by /help and autocomplete)
- `execute(name, ctx, args)`: run command with error handling

#### commands/parse.ts

Span-based tokenizer for reliable command extraction:
- `parseCommandInvocations(input, registry)`: returns `{ invocations, remainingText }`
- Each invocation has `name`, `args`, `span` (start/end indices)
- Parsing rules:
  - `/name` must be preceded by start-of-line or whitespace
  - Args stop at next `/name` token (unless inside quotes)
  - Supports `--flag value` and `-f` short flags
  - Quoted strings preserve whitespace
- `remainingText` computed by slicing out spans in reverse order
- `getTokenAtCursor(value, cursorPos)`: for autocomplete

#### commands/commands/*.ts

| Command | Usage | Purpose |
|---------|-------|---------|
| `/quit` | `/quit` | Exit North cleanly |
| `/new` | `/new` | Reset chat (clears transcript + summary, keeps PTY) |
| `/help` | `/help` | List available commands |
| `/model` | `/model [alias]` | Switch model (with picker if no arg) |
| `/summarize` | `/summarize [--keep-last N]` | Summarize conversation, trim transcript |

### logging/index.ts

- Writes to `~/.local/state/north/north.log`
- JSON-lines format (one JSON object per line)
- Events: `app_start`, `user_prompt`, `model_request_start`, `model_request_complete`, `tool_call_start`, `tool_call_complete`, `write_review_shown`, `write_review_decision`, `write_apply_start`, `write_apply_complete`, `shell_review_shown`, `shell_review_decision`, `shell_run_start`, `shell_run_complete`, `app_exit`
- Silent fail on write errors (logging must not crash the app)

### orchestrator/index.ts

- Owns `transcript` (array of `TranscriptEntry`)
- Owns `isProcessing`, `pendingReviewId`, `currentModel`, `rollingSummary`
- Owns `contextUsedTokens`, `contextLimitTokens`, `contextUsage` for context tracking
- Receives `cursorRulesText` in context (loaded once at startup)
- Owns command registry via `createCommandRegistryWithAllCommands()`
- Preprocesses user input for slash commands before sending to Claude
- Accepts mode parameter in `sendMessage(content, mode)` to filter available tools
- In Plan mode only: enforces plan requirement (write tools blocked until plan is accepted)
- Implements tool call loop:
  1. Parse and execute any slash commands in input
  2. Add `command_executed` entry for each command
  3. If `remainingText` non-empty, append user entry to transcript
  4. Create assistant entry with `isStreaming: true`
  5. Build messages and estimate token usage
  6. If context usage >= 92%, auto-summarize conversation
  7. Send messages to Claude with tool schemas and current model
  8. Stream response text (throttled at ~32ms)
  9. If `stopReason === "tool_use"`:
     - Execute each tool via registry
     - For `approvalPolicy: "write"`: create `diff_review` entry, block for user decision
     - For `approvalPolicy: "shell"`: check allowlist, create `shell_review` if not allowed
     - On accept/run: apply edits or execute command, send result to Claude
     - On reject/deny: send rejection/denial to Claude
  10. Continue until Claude stops requesting tools
- Streaming throttle: buffer chunks, flush every 32ms or on complete
- Emits state changes via `onStateChange` callback (includes `currentModel`)
- `buildMessagesForClaude()`: excludes `command_review` and `command_executed` entries
- Prepends `cursorRulesText` as first context block if present
- Prepends `rollingSummary` as second context block if present
- Exposes `resolveWriteReview(reviewId, decision)` for UI to signal accept/reject
- Exposes `resolveShellReview(reviewId, decision)` for UI to signal run/always/deny
- Exposes `resolveCommandReview(reviewId, decision)` for UI to signal selection/cancel
- Exposes `getCommandRegistry()` for Composer autocomplete
- Exposes `cancel()` for interrupting ongoing operations (CTRL+C during processing)
- Exposes `stop()` for clean exit (CTRL+C when idle)
- Exposes `isProcessing()` for checking if an operation is in progress

### rules/cursor.ts

- Loads Cursor project rules from `.cursor/rules/` directory
- Walks directory recursively, collecting all `*.mdc` files
- Parses optional YAML frontmatter, extracts body content
- Returns stable order (sorted by relativePath)
- Hard cap at 30KB total size, truncates with `[truncated]` marker
- API: `loadCursorRules(repoRoot)` returns `LoadedCursorRules | null`
- `LoadedCursorRules`: `{ rules, text, truncated }`
- `CursorRule`: `{ name, relativePath, body }`

### shell/index.ts

- Simple shell command execution using Bun's built-in `Bun.spawn()` API
- No external dependencies - works in standalone compiled binaries
- Each command spawns a fresh bash process (no persistent session)
- Uses `bash -c` for command execution
- Timeout handling: kills process after timeout (default 60s)
- Properly separates stdout and stderr streams
- Per-project service caching for consistent interface
- API: `getShellService(repoRoot, logger)` returns service with `run(command, options)` and `dispose()`
- `disposeAllShellServices()` cleans up all cached services on exit

### storage/allowlist.ts

- Per-project shell command allowlist at `.north/allowlist.json`
- Simple JSON format: `{ "allowedCommands": ["pnpm test", "bun test"] }`

### storage/config.ts

- Global configuration at `~/.config/north/config.json`
- Stores user preferences that persist across sessions
- Currently stores: `selectedModel` (persisted model selection)
- API: `getSavedModel()` returns saved model ID or null, `saveSelectedModel(modelId)` persists selection
- API: `isCommandAllowed(repoRoot, command)`, `allowCommand(repoRoot, command)`, `getAllowedCommands(repoRoot)`
- Exact string matching only (no patterns)
- Creates `.north/` directory on first write

### storage/autoaccept.ts

- Per-project auto-accept setting for edit tools at `.north/autoaccept.json`
- Simple JSON format: `{ "editsAutoAccept": true }`
- API: `isEditsAutoAcceptEnabled(repoRoot)`, `enableEditsAutoAccept(repoRoot)`, `disableEditsAutoAccept(repoRoot)`
- When enabled, all edit tool results are automatically applied without user confirmation
- Creates `.north/` directory on first write

### provider/index.ts (Provider Factory)

- Exports `createProviderForModel(modelId)`: creates correct provider based on model prefix
- `getModelProvider(modelId)`: returns "anthropic" or "openai" based on model
- Re-exports common types: `Provider`, `Message`, `StreamCallbacks`, `ToolCall`, etc.
- Orchestrator uses this to dynamically switch providers when `/model` changes

### provider/anthropic.ts (Anthropic Provider)

- Wraps `@anthropic-ai/sdk`
- Default model: `claude-sonnet-4-20250514`
- Streaming via `client.messages.stream()` (Messages API)
- Supports tool definitions and tool_use blocks
- Per-request options: `model`, `tools`, `systemOverride`, `signal` (AbortSignal)
- `systemOverride` replaces default system prompt (used for summarization)
- Callbacks: `onChunk`, `onToolCall`, `onComplete`, `onError`
- Abort support: checks signal during stream loop, returns `stopReason: "cancelled"`
- Helpers for building tool result and assistant messages

### provider/openai.ts (OpenAI Provider)

- Uses native fetch with SSE streaming (no SDK dependency)
- Endpoint: `https://api.openai.com/v1/responses` (Responses API)
- Default model: `gpt-5.1`
- Streaming via SSE events: `response.output_text.delta`, `response.function_call_arguments.delta`
- Tool format converted to OpenAI function format: `{ type: "function", function: { name, description, parameters } }`
- Tool results sent as `function_call_output` items with matching `call_id`
- Per-request options: same interface as Anthropic provider
- Abort support: passes AbortSignal to fetch, returns `stopReason: "cancelled"`
- Env var: `OPENAI_API_KEY` required

**Supported OpenAI Models:**

| Alias | Model ID | Description |
|-------|----------|-------------|
| gpt-5.1 | gpt-5.1 | GPT-5.1 flagship |
| gpt-5.1-codex | gpt-5.1-codex | Optimized for coding |
| gpt-5.1-codex-mini | gpt-5.1-codex-mini | Faster coding variant |
| gpt-5.1-codex-max | gpt-5.1-codex-max | Maximum capability coding |
| gpt-5 | gpt-5 | GPT-5 flagship |
| gpt-5-mini | gpt-5-mini | Faster GPT-5 variant |
| gpt-5-nano | gpt-5-nano | Fastest/cheapest GPT-5 |

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
| `shell_run` | Execute shell command | Persistent PTY, requires approval or allowlist, stderr merged into stdout |

### utils/ignore.ts

- Parses .gitignore patterns
- Always ignores common directories (node_modules, .git, etc.)
- `createIgnoreChecker()` returns checker with `isIgnored(path, isDir)`
- `walkDirectory()` recursively walks repo respecting ignores
- `listRootEntries()` lists root level entries

### ui/App.tsx

- Root Ink component, wires orchestrator to UI state
- SIGINT handling: cancel if processing, exit if idle
- Delegates review decisions to orchestrator methods (write, shell, command, plan)
- Tracks `isProcessing`, `pendingReviewId`, and `nextMode` for UI state
- Passes mode to orchestrator on message submission
- Layout: Transcript (scrollable top), StatusLine (sticky bottom), Composer (sticky bottom)

### ui/StatusLine.tsx

- Full-width status bar using `width="100%"` and `justifyContent="space-between"`
- Left side: project name with truncation for long names (`wrap="truncate"`)
- Right side: mode indicator, current model name, and context usage meter
- Mode indicator: color-coded badge ([ASK] blue, [AGENT] green)
- Context meter: color-coded circle (green < 60%, yellow 60-85%, red > 85%) + percentage
- Updates in real-time as context fills

### ui/Composer.tsx

- Multiline input with Ctrl+J for newlines
- Shows "Ctrl+C to cancel" hint when disabled/waiting
- Mode cycling with Tab key (when no autocomplete suggestions):
  - Cycles: ask → agent → ask
  - Mode applies to next message only (per-request mode)
  - Visual indicator shows current mode in top-right
- Cursor-aware slash command autocomplete:
  - Detects `/` tokens at cursor position
  - Queries command registry for suggestions
  - Shows dropdown with command name + description
  - Tab to insert (when suggestions present), Up/Down to navigate, Esc to close
- Model argument autocomplete for `/model` command:
  - Detects when cursor follows `/model `
  - Shows model aliases with display names
- Smart space insertion: only adds space after completion if needed
- Clamps selection index when suggestions change

### ui/Transcript.tsx

- Renders conversation history with performance optimizations for large transcripts
- Uses Ink's `<Static>` component for completed entries (render once, never re-render)
- Dynamic section only for actively streaming or pending review entries
- User messages: cyan label
- Assistant messages: magenta label
- Tool messages: yellow ⚡ icon, gray text, human-readable formatting
- Command executed messages: blue ⚙ icon with result
- Diff review entries: bordered box with diff content
- Shell review entries: command approval prompt
- Command review entries: interactive picker
- Error tool results: red text
- Streaming indicator (●) with magenta pulse animation
- Tool execution spinner animation (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
- Animation hooks (all conditional on `active` parameter):
  - `useSpinner(active, interval)`: animated spinner frames for tool execution
  - `usePulse(active, colors, interval)`: color cycling for streaming indicators
- Auto-disables animations when transcript exceeds 100 entries
- All message components memoized with `React.memo`

### ui/CommandReview.tsx

- Renders interactive picker for commands needing selection
- Used by `/model` when no argument provided
- Shows list of options with labels and hints
- Keyboard shortcuts: Up/Down navigate, Enter select, Esc cancel
- Status badges: pending (yellow), selected (green), cancelled (red)

### ui/DiffReview.tsx

- Renders inline diff with syntax highlighting
- Green for additions, red for deletions, cyan for hunk headers
- Truncates diffs over 100 lines with indicator
- Shows file stats (+lines/-lines)
- Keyboard shortcuts: `a` accept, `y` always (auto-accept all future edits), `r` reject
- Status badges: pending (pulsing yellow border), accepted (green), always/auto-applied (cyan), rejected (red)
- Animation: border color pulses when status is pending to draw attention
- "Always" option: enables auto-accept for all future edit operations in this project

### ui/ShellReview.tsx

- Renders shell command approval prompt
- Shows command and optional cwd
- Keyboard shortcuts: `r` run, `a` always (adds to allowlist), `d` deny
- Status badges: pending (pulsing yellow border), ran/always (green), denied (red)
- Animation: border color pulses when status is pending to draw attention

### utils/editing.ts

- `resolveSafePath()`: validates paths stay within repo root
- `readFileContent()`: safe file reading with error handling
- `preserveTrailingNewline()`: ensures trailing newline consistency after edits
- `computeUnifiedDiff()`: generates unified diff format
- `computeCreateFileDiff()`: generates diff for new files
- `applyEditsAtomically()`: writes to temp files then renames for safety; handles cross-filesystem scenarios (EXDEV) via copy+unlink fallback

### utils/tokens.ts

Token estimation for context tracking:
- `estimatePromptTokens(systemPrompt, messages)`: estimates total tokens in request
- Uses character-based heuristic (3.5 chars per token)
- Applies 10% safety margin to reduce overflow risk
- Returns structured breakdown: system, messages, overhead
- Handles both string and structured message content (tool results, etc.)

## Data Flow

### Startup Flow

```
main()
    │
    ├──► parseArgs()
    ├──► detectRepoRoot()
    ├──► initLogger()
    │
    ▼
loadCursorRules(projectPath)
    │
    ├──► Walk .cursor/rules/ for *.mdc files
    ├──► Parse frontmatter, extract body
    ├──► Sort by relativePath
    ├──► Concatenate into single text block
    │
    ▼
render(App, { cursorRulesText, ... })
    │
    ▼
Orchestrator created with cursorRulesText in context
```

### User Input with Commands

```
User Input (may contain /commands)
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
    ▼
parseCommandInvocations(content, commandRegistry)
    │
    ├──► For each command invocation:
    │       │
    │       ├──► Execute command via registry
    │       ├──► If picker needed: create command_review entry, block for selection
    │       └──► Add command_executed entry with result
    │
    ▼
If remainingText.trim() non-empty:
    │
    ├──► Push user entry to transcript
    │
    ▼
┌─► provider.stream(messages, { tools, model })
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

### CTRL+C Signal Flow

```
SIGINT (Ctrl+C)
    │
    ▼
App.handleSigint()
    │
    ├──► If orchestrator.isProcessing():
    │       │
    │       ▼
    │   orchestrator.cancel()
    │       │
    │       ├──► currentAbortController.abort()
    │       ├──► Resolve pending reviews (reject/deny/cancel)
    │       ├──► Set cancelled = true
    │       └──► Return to input
    │
    └──► If not processing:
            │
            ▼
        orchestrator.stop()
            │
            ├──► disposeAllShellServices()
            └──► exit()
```

## Key Implementation Details

### Slash Command Execution

When user input contains slash commands:
1. `parseCommandInvocations()` tokenizes input, finds registered commands
2. Each command has `span` (start/end indices) for clean removal
3. Commands execute sequentially via registry
4. If command needs picker (e.g., `/model` without arg):
   - Creates `command_review` transcript entry
   - Blocks until user selects or cancels
   - Updates entry with selection status
5. After execution, `command_executed` entry added with result message
6. `remainingText` (input with commands removed) sent to Claude if non-empty
7. `command_review` and `command_executed` entries are excluded from `buildMessagesForClaude()`

### Rolling Summary

The `/summarize` command:
1. Calls `generateSummary()` which prompts Claude for structured JSON
2. Uses `systemOverride` with minimal prompt (no tool guidance noise)
3. Returns `StructuredSummary` or null on failure
4. On success: sets rolling summary, trims transcript
5. `trimTranscript(keepLast)` preserves chronological order:
   - Keeps last N user/assistant entries
   - Preserves non-pending diff_review and shell_review outcomes
   - Filters original array (no reordering)
6. Rolling summary prepended to Claude context as structured block

### Model Switching

Model selection via `/model`:
- With argument: `resolveModelId()` maps alias → pinned ID
- Without argument: shows picker with all models (both Anthropic and OpenAI)
- `getModelProvider(modelId)` determines which provider to use
- `createProviderForModel()` creates appropriate provider instance
- Switching between providers (e.g., Claude → GPT) recreates provider
- `currentModel` stored in orchestrator state
- Context limit updates automatically on model change
- **Selection persisted globally** to `~/.config/north/config.json`
- On startup, loads saved model or defaults to Claude Sonnet 4

**Assistant Name Display:**
- `getAssistantName(modelId)` returns "Claude" or "GPT" based on provider
- Transcript displays correct name for current model

**Environment Variables:**
- `ANTHROPIC_API_KEY`: required for Claude models
- `OPENAI_API_KEY`: required for GPT models

### System Prompt Structure

Both providers (`anthropic.ts` and `openai.ts`) use identical system prompts with a Cursor-inspired structured format using XML-like sections:

**Sections:**
- `<communication>` - Tone, formatting, honesty rules (no lying, no guessing paths)
- `<tool_calling>` - Schema adherence, one-sentence justification before each call, never expose tool names
- `<search_and_reading>` - Bias toward self-discovery, gather context before concluding
- `<making_code_changes>` - Read before edit, one edit per turn or atomic batch, no large pastes
- `<debugging>` - Edit only if confident, retry logic (re-read once on mismatch, max 3 lint loops)
- `<calling_external_apis>` - Only when explicitly requested

**Key behaviors enforced:**
- "If you did not read it, do not claim it exists"
- Never guess file paths or symbol names
- Describe actions in natural language ("I'll search the repo") not tool names
- Plan briefly, then execute one coherent edit per turn
- Retry once on edit mismatch, then ask for clarification

### Mode System

North supports two conversation modes that control tool availability:

**Mode Types:**
- **Ask Mode**: Read-only - only read tools available (read_file, search_text, find_files, list_root, read_readme, detect_languages, hotfiles)
- **Agent Mode**: Full access - all tools available including write and shell tools

**Mode Selection:**
- Mode is per-request, not global state
- Set via `/mode` command (with optional argument or interactive picker)
- Cycle with Tab key in Composer: ask → agent → ask
- Tab cycles mode only when no autocomplete suggestions are present
- Current mode shown in Composer badge and StatusLine

**Tool Filtering:**
- Orchestrator's `sendMessage(content, mode)` accepts mode parameter
- Tools filtered via `filterToolsForMode(mode, allSchemas)` before sending to Claude
- Only tools allowed by current mode are included in API request

### Context Tracking & Auto-Summarization

North tracks context usage in real-time to prevent overflow:

1. **Token Estimation** (before each request):
   - Builds outgoing messages payload (system + transcript + injected rules)
   - Estimates tokens using character-based heuristic (3.5 chars/token)
   - Applies 10% safety margin
   - Updates `contextUsedTokens`, `contextLimitTokens`, `contextUsage`

2. **Visual Indicator** (StatusLine):
   - Green circle: < 60% usage
   - Yellow circle: 60-85% usage
   - Red circle: > 85% usage
   - Shows numeric percentage

3. **Auto-Summarization** (at 92% threshold):
   - Automatically calls `generateSummary()` before sending request
   - Replaces older transcript with structured summary
   - Keeps last 10 messages verbatim
   - Preserves injected rules and context
   - Recomputes usage after compaction
   - Proceeds with request normally

4. **Per-Model Limits**:
   - All current Claude models: 200K tokens
   - Limit updates automatically on model switch
   - Usage recalculated with new limit

### Tool Call Loop

When Claude requests tools:
1. Stream completes with `stopReason: "tool_use"`
2. Orchestrator executes each tool via registry
3. Results are JSON-stringified and sent back as `tool_result` blocks
4. Claude processes results and may request more tools or respond

### Tool Result Consistency

The API requires every `tool_use` block to have a corresponding `tool_result`. To ensure this:

1. **Write tool ID tracking**: Tool IDs are only added to `writeToolCallIds` after the tool succeeds and a `diff_review` entry is created. Failed write tools have their results sent via the normal `tool` entry path.

2. **Recovery mechanism**: If the API returns an "orphaned tool_use" error (tool_use without tool_result), the orchestrator:
   - Extracts the orphaned tool ID from the error message
   - Removes it from `writeToolCallIds` and `shellToolCallIds` sets
   - Removes the incomplete assistant entry from transcript
   - Retries the request once
   - Logs the recovery event for debugging

### Transient Error Retry

The orchestrator automatically retries API requests that fail due to transient errors:

**Retryable errors:**
- Network errors: ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENETUNREACH, socket hang up, fetch failed
- Rate limits: HTTP 429, "rate limit", "too many requests"
- Server errors: HTTP 5xx, "overloaded", "service unavailable", "internal server error"

**Non-retryable errors (fail immediately):**
- Authentication errors (401, 403)
- Bad request errors (400)
- Cancellation/abort

**Retry behavior:**
- Maximum 3 retry attempts per conversation turn
- Exponential backoff with jitter: ~1s, ~2s, ~4s (capped at 30s)
- Counter resets after successful request
- Silent retry (no UI change, request resumes after delay)
- Logs `api_retry_attempt` event with attempt count, delay, and error message

### Write Approval Flow

When Claude requests an edit tool (approvalPolicy: "write"):
1. In Plan mode only: Orchestrator checks if `acceptedPlan` exists - if not, returns `PLAN_REQUIRED` error
2. Orchestrator checks if auto-accept is enabled (`.north/autoaccept.json`)
3. **If auto-accept enabled**: edits applied immediately, status set to "always", Claude continues
4. **If auto-accept disabled**:
   - Tool executes in "prepare" mode - computes diff but doesn't write
   - Orchestrator creates a `diff_review` transcript entry with status "pending"
   - Tool loop blocks, waiting for user decision
   - DiffReview component renders inline diff with Accept/Always/Reject options
   - User presses `a` (accept), `y` (always), or `r` (reject)
   - On Accept: edits applied atomically (temp files then rename)
   - On Always: enables auto-accept for future edits, applies current edits
   - On Reject: nothing written, status set to "rejected"
5. Tool result sent to Claude with outcome (applied: true/false)
6. Claude continues processing

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

### Cursor Rules Loading

North automatically loads Cursor project rules at startup:

1. **Loading** (in `index.ts`):
   - Calls `loadCursorRules(projectPath)` once before rendering
   - Walks `.cursor/rules/` recursively for `*.mdc` files
   - Parses YAML frontmatter (if present), keeps body content
   - Sorts by relativePath for deterministic order
   - Enforces 30KB hard cap, truncates if exceeded

2. **Storage** (in orchestrator context):
   - `cursorRulesText` passed through App to orchestrator context
   - Stored as plain string or null

3. **Injection** (in `buildMessagesForClaude()`):
   - If `cursorRulesText` is non-empty, prepends to every request
   - Format: `# Cursor Project Rules (.cursor/rules)` header
   - Each rule: `## relativePath` followed by rule body
   - Injected before rolling summary, ensuring rules always apply

4. **Format of injected rules**:
```
# Cursor Project Rules (.cursor/rules)

## path/to/rule.mdc

<rule body content>

## another-rule.mdc

<rule body content>
```

### Cancellation Flow (CTRL+C)

The app handles CTRL+C (SIGINT) contextually:

1. **During processing** (`isProcessing() === true`):
   - Calls `orchestrator.cancel()`
   - Aborts the current AbortController (stops API streaming)
   - Resolves any pending reviews as rejected/denied/cancelled
   - Appends `[Cancelled]` to the assistant's message
   - Returns control to the input field
   - App remains running

2. **When idle** (`isProcessing() === false`):
   - Calls `orchestrator.stop()`
   - Disposes all shell services
   - Exits the application

Implementation details:
- `currentAbortController` tracks the active API request
- `cancelled` flag checked in conversation loop
- Provider stream loop checks `signal.aborted` and exits gracefully
- Pending write/shell/command reviews auto-resolve on cancel

### Tool Display Formatting

The orchestrator formats tool names for better readability in the TUI:
- `list_root` → "Listing project files - N entries"
- `find_files` → "Finding pattern - N files" (with + suffix if truncated)
- `read_file` → "Reading filename.ext"
- `edit_replace_exact` → "Editing filename.ext"
- `edit_insert_at_line` → "Editing filename.ext"
- `edit_create_file` → "Creating filename.ext"
- `edit_apply_batch` → "Editing N files" (or single file name if batch contains only one edit)
- Other tools: shown as-is

Implementation split between:
- `formatToolNameForDisplay()` in orchestrator: extracts display name from tool arguments
- `getToolResultSuffix()` in Transcript.tsx: appends result counts for file listing tools

### UI Animations

North uses subtle, frame-based animations to enhance feedback without overwhelming the terminal:

1. **Streaming Indicator Pulse** (Assistant & Tool messages):
   - Pulses through magenta shades (magenta → #ff6ec7 → #ff8fd5 → #ffa0dc → back)
   - 500ms interval per color transition
   - Indicates active streaming or processing

2. **Tool Execution Spinner**:
   - Animated spinner frames: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
   - 80ms frame interval for smooth rotation
   - Yellow color to match tool theme
   - Shown when tool is executing (`isStreaming: true`)

3. **Pending Review Border Pulse**:
   - Pulses through yellow shades (yellow → #ffff87 → #ffffaf → back)
   - 600ms interval per color transition
   - Applied to DiffReview, ShellReview, and PlanReview when status is "pending"
   - Draws attention to items requiring user action

**Implementation Details**:
- Custom React hooks (`useSpinner`, `usePulse`, `useBorderPulse`)
- Uses `setInterval` with cleanup on unmount
- Frame rates kept low (12-15 fps) to avoid terminal flicker
- Colors cycle smoothly for breathing effect
- All animations respect terminal color support
- **Conditional timers**: Animation hooks accept an `active` boolean parameter; timers only run when active
- **Auto-disable threshold**: Animations auto-disable when transcript exceeds 100 entries

### Transcript Performance Optimizations

To prevent flickering in large conversations, North implements several Ink-specific optimizations:

1. **Static Rendering with `<Static>`**:
   - Ink's `<Static>` component renders items once and never re-renders them
   - Completed transcript entries (not streaming, not pending review) are rendered inside `<Static>`
   - Only dynamic entries (streaming messages, pending reviews) re-render on state changes
   - This transforms "redraw 2000-line screen 12x/sec" into "redraw small dynamic section"

2. **Conditional Animation Timers**:
   - All animation hooks (`useSpinner`, `usePulse`, `useBorderPulse`) accept an `active` parameter
   - Timers only start when `active === true`
   - Prevents "zombie timers" from completed entries causing unnecessary state updates
   - Example: `useSpinner(entry.isStreaming, 80)` only animates while streaming

3. **Animation Kill Switch**:
   - When transcript exceeds `ANIMATION_DISABLE_THRESHOLD` (100 entries), animations auto-disable
   - `animationsEnabled` boolean passed through component tree
   - Pending reviews still show correct state, just without pulsing animations

4. **Memoized Components**:
   - All message components wrapped in `React.memo`: `UserMessage`, `AssistantMessage`, `ToolMessage`, `CommandExecutedMessage`, `MessageBlock`, `StaticEntry`
   - Review components also memoized: `DiffReview`, `ShellReview`, `CommandReview`
   - Primitive props preferred over object props where possible

5. **Precomputed Render Data**:
   - `DiffContent` precomputes colored line data in `useMemo`
   - Line styling decisions made once per diff, not on every render
   - Reduces CPU work during animation frames

6. **Entry Classification**:
   - `isEntryStatic()` helper determines if an entry can be rendered statically
   - Criteria: not streaming, not the active review, no pending review status
   - Entries graduate from dynamic to static as their state settles

**Architecture**:
```
<Transcript>
  <Static items={staticEntries}>     // Completed entries - render once
    {(entry) => <StaticEntry />}
  </Static>
  {dynamicEntries.map((entry) =>     // Active entries - re-render on changes
    <MessageBlock />
  )}
</Transcript>
```

This architecture ensures that only the actively changing portion of the transcript triggers redraws, keeping the terminal responsive even in very long conversations.

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

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `eslint` | ^9.17.0 | Code linting |
| `typescript-eslint` | ^8.18.1 | TypeScript ESLint support |
| `eslint-plugin-react` | ^7.37.2 | React-specific linting |
| `eslint-plugin-react-hooks` | ^5.1.0 | React Hooks linting |
| `prettier` | ^3.4.2 | Code formatting |
| `typescript` | ^5.7.2 | Type checking |

## Code Quality

The project uses ESLint and Prettier for code quality enforcement.

### Scripts

```bash
bun run lint          # Run ESLint
bun run lint:fix      # Run ESLint with auto-fix
bun run format        # Format code with Prettier
bun run format:check  # Check Prettier formatting
bun run typecheck     # Run TypeScript type checking
bun run check         # Run all checks (typecheck + lint + format:check)
```

### ESLint Configuration

- Uses flat config format (`eslint.config.js`)
- TypeScript support via `typescript-eslint`
- React and React Hooks plugins
- Key rules:
  - `@typescript-eslint/consistent-type-imports`: Enforces `type` imports
  - `@typescript-eslint/no-unused-vars`: Errors on unused variables (allows `_` prefix)
  - `@typescript-eslint/no-explicit-any`: Warns on `any` type usage
  - `react-hooks/exhaustive-deps`: Enforces correct hook dependencies

### Prettier Configuration

- 4-space indentation
- Double quotes
- Semicolons required
- 100 character line width
- ES5 trailing commas

### Git Hooks

Pre-commit hooks are configured in `.githooks/pre-commit`. The hook runs:
1. TypeScript type checking
2. ESLint linting
3. Prettier format verification

To enable hooks after cloning:
```bash
bun run prepare  # or: git config core.hooksPath .githooks
```

The `prepare` script runs automatically on `bun install`.

## Running

```bash
# Development
bun run dev

# With options
bun run dev --path /some/repo --log-level debug

# Build for distribution
bun run build         # builds to dist/
bun run link          # symlinks for global 'north' command

# Build standalone binaries
bun run build:binary       # current platform
bun run build:binary:mac-arm
bun run build:binary:linux
```

## Build Process

Simple and straightforward:

1. **JavaScript bundling**: `bun build` compiles TypeScript to `dist/index.js`
2. **Binary compilation**: `bun build --compile` creates a standalone executable with Bun runtime embedded
3. **No native dependencies**: Uses only Bun's built-in APIs (`Bun.spawn()`) for shell commands

The compiled binary is completely self-contained and can be distributed as a single file with no external dependencies.

## Testing

Uses Bun's built-in test runner:

```bash
bun test                    # run all tests
bun test --watch            # watch mode
bun test tests/openai*.ts   # run specific tests
```

**Test coverage:**
- `tests/openai-provider.test.ts`: OpenAI provider tests
  - Tool schema conversion (verifies Responses API format)
  - Provider factory and message builders
  - SSE streaming event parsing
  - Error handling

## Environment

**Required:**
- `ANTHROPIC_API_KEY`: For Claude models
- `OPENAI_API_KEY`: For GPT models (at least one required)

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

## Todo Backlog

Technical debt and improvements are tracked in the `todo/` folder. Each file represents a single actionable item with:
- Severity level (Major/Minor/Trivial)
- Affected location(s)
- Problem description
- Solution approach
- Implementation notes

Files are numbered by priority (01-xx = Major, 05-xx = Minor, 10-xx+ = Trivial).
Delete each file after completing the task: `rm todo/XX-filename.md`
