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
| 4.6: Conversation save + resume | ✅ Complete |
| 5: Memory + project card cache | Not started |
| 6: UX polish | Not started |

*Last verified: 2025-12-10*

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
│       ├── summarize.ts  # /summarize - summarize and trim transcript
│       ├── learn.ts      # /learn - learn or relearn project codebase
│       ├── conversations.ts # /conversations - picker to switch conversations
│       └── resume.ts     # /resume <id> - switch to conversation by ID
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
│   ├── config.ts         # Global config (~/.config/north/config.json)
│   ├── conversations.ts  # Conversation persistence (event log + index)
│   ├── costs.ts          # Global cost tracking (~/.north/costs.json)
│   └── profile.ts        # Per-project learning profile storage
├── profile/
│   └── learn.ts          # Project learning orchestration and discovery topics
├── tools/
│   ├── index.ts          # Tool exports and registry factory
│   ├── types.ts          # Tool type definitions (including edit and shell types)
│   ├── registry.ts       # Tool registry implementation with approval policy
│   ├── list_root.ts      # List repo root entries
│   ├── find_files.ts     # Glob pattern file search
│   ├── search_text.ts    # Text/regex search (ripgrep or fallback, supports file+range)
│   ├── read_file.ts      # File content reader with ranges and smart context
│   ├── get_line_count.ts # Quick file size checker
│   ├── get_file_symbols.ts # Symbol extraction (functions, classes, types)
│   ├── get_file_outline.ts # Hierarchical file structure outline
│   ├── read_readme.ts    # README finder and reader
│   ├── detect_languages.ts # Language composition detector
│   ├── hotfiles.ts       # Frequently modified files (git or fallback)
│   ├── edit_replace_exact.ts  # Exact text replacement
│   ├── edit_insert_at_line.ts # Insert at line number
│   ├── edit_after_anchor.ts   # Insert after anchor text
│   ├── edit_before_anchor.ts  # Insert before anchor text
│   ├── edit_replace_block.ts  # Replace content between anchors
│   ├── edit_create_file.ts    # Create or overwrite file
│   ├── edit_apply_batch.ts    # Atomic batch edits
│   ├── expand_output.ts       # Retrieve cached digested outputs
│   ├── find_code_block.ts     # Find code blocks containing text
│   ├── read_around.ts         # Context window around anchor
│   ├── find_blocks.ts         # Structural map without content
│   ├── edit_by_anchor.ts      # Unified anchor-based editing
│   └── shell_run.ts      # Shell command execution (requires approval)
├── ui/
│   ├── App.tsx            # Root Ink component, SIGINT handling, review wiring
│   ├── Composer.tsx       # Multiline input with slash command and @ file autocomplete
│   ├── CommandReview.tsx  # Interactive picker for commands (e.g., model selection)
│   ├── DiffReview.tsx     # Inline diff viewer with accept/reject
│   ├── ShellReview.tsx    # Shell command approval with run/always/deny
│   ├── LearningPrompt.tsx # Project learning Y/N prompt
│   ├── LearningProgress.tsx # Learning progress indicator
│   ├── StatusLine.tsx     # Model name, mode indicator, project path display
│   ├── Transcript.tsx     # User/assistant/tool/review/command entry rendering
│   ├── ConversationList.tsx # Conversation list for north conversations
│   └── ConversationPicker.tsx # Conversation picker for north resume
└── utils/
    ├── repo.ts           # Repo root detection
    ├── ignore.ts         # Gitignore parsing and file walking
    ├── editing.ts        # Diff computation and atomic file writes
    ├── tokens.ts         # Token estimation for context tracking
    ├── retry.ts          # Transient error retry with exponential backoff
    ├── fileindex.ts      # File index for @ mention autocomplete
    ├── filepreview.ts    # File preview + outline generation for context
    ├── fileblock.ts      # NORTH_FILE streaming parser with events
    ├── filesession.ts    # Streaming file writer with auto-resume
    ├── digest.ts         # Tool output digesting for context efficiency
    └── pricing.ts        # Model pricing data and cost calculation

tests/
└── openai-provider.test.ts  # OpenAI provider unit tests
```

## Module Responsibilities

### index.ts (Entry Point)

- Parses CLI args and subcommands
- Supported subcommands:
  - `north` - start new conversation
  - `north resume <id>` - resume conversation by ID
  - `north resume` - open conversation picker
  - `north conversations` or `north list` - list recent conversations
- Flags: `--path`, `--log-level`
- Detects repo root from start directory
- Initializes logger
- Renders Ink app (or list/picker components for subcommands)
- Handles clean exit via `waitUntilExit()`
- Wires tool logging callbacks
- Generates conversation ID on new conversations
- Loads conversation state on resume

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
- `MODELS`: array of `{ alias, pinned, display, contextLimitTokens, provider, supportsThinking?, thinkingBudget? }`
- `resolveModelId(input)`: maps alias or pinned ID to pinned ID (supports both Claude and GPT prefixes)
- `getModelDisplay(modelId)`: returns human-readable name
- `getModelContextLimit(modelId)`: returns context limit in tokens
- `getModelProvider(modelId)`: returns provider type for model
- `getModelThinkingConfig(modelId)`: returns thinking config if model supports extended thinking
- `DEFAULT_MODEL`: default pinned model ID (Claude Sonnet 4)

**Extended Thinking Budgets:**
- All Claude 4+ models support extended thinking
- Opus models: 16K token budget
- Sonnet models: 8-10K token budget
- Haiku models: 5K token budget

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
| `/mode` | `/mode [ask\|agent]` | Switch conversation mode (with picker if no arg) |
| `/summarize` | `/summarize [--keep-last N]` | Summarize conversation, trim transcript |
| `/thinking` | `/thinking [on\|off]` | Toggle extended thinking on/off |
| `/costs` | `/costs` | Show cost breakdown dialog by model/provider |
| `/learn` | `/learn` | Learn or relearn project codebase |
| `/conversations` | `/conversations` | Picker to switch conversations |
| `/resume` | `/resume <id>` | Switch to conversation by ID |

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
- Cancellation support: accepts `AbortSignal` option to kill running commands on CTRL+C
- Properly separates stdout and stderr streams
- Per-project service caching for consistent interface
- API: `getShellService(repoRoot, logger)` returns service with `run(command, options)` and `dispose()`
- Run options: `cwd`, `timeoutMs`, `signal` (AbortSignal for cancellation)
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
- **Test isolation**: Respects `NORTH_CONFIG_DIR` environment variable to override config directory for testing (prevents tests from modifying user's actual config)

### storage/autoaccept.ts

- Per-project auto-accept settings at `.north/autoaccept.json`
- JSON format: `{ "editsAutoAccept": boolean, "shellAutoApprove": boolean }`
- Edit API: `isEditsAutoAcceptEnabled(repoRoot)`, `enableEditsAutoAccept(repoRoot)`, `disableEditsAutoAccept(repoRoot)`
- Shell API: `isShellAutoApproveEnabled(repoRoot)`, `enableShellAutoApprove(repoRoot)`, `disableShellAutoApprove(repoRoot)`
- When edits auto-accept enabled, all edit tool results are automatically applied without user confirmation
- When shell auto-approve enabled, all shell commands run automatically without individual approval
- Creates `.north/` directory on first write

### storage/costs.ts

- Global API cost tracking at `~/.north/costs.json`
- JSON format: `{ "allTimeCostUsd": number, "byModel": Record<string, ModelCost>, "lastUpdated": number }`
- `ModelCost`: `{ inputTokens: number, outputTokens: number, costUsd: number }`
- API: `getAllTimeCost()`, `getCostBreakdown()`, `addCostByModel()`, `resetAllTimeCost()`
- `addCostByModel(modelId, inputTokens, outputTokens, costUsd)` accumulates per-model and updates total
- `getCostBreakdown()` returns full breakdown for `/costs` dialog
- Creates `~/.north/` directory on first write
- **Test isolation**: Respects `NORTH_DATA_DIR` environment variable to override data directory

### storage/profile.ts

- Per-project learning profile storage at `~/.north/projects/<hash>/profile.md`
- Hash-based project identification using SHA-256 of repo root path (16 chars)
- Profile stored in markdown format with H2 sections for each discovery topic
- Declined state tracked via `declined.json` marker file
- API: `hasProfile(repoRoot)`, `loadProfile(repoRoot)`, `saveProfile(repoRoot, content)`
- API: `hasDeclined(repoRoot)`, `markDeclined(repoRoot)`, `clearDeclined(repoRoot)`
- `getProjectHash(repoRoot)` generates stable hash for directory identification
- Storage location keeps repos clean (no commits of generated content)

### storage/conversations.ts

- Conversation persistence at `~/.north/conversations/`
- Each conversation identified by 6-char hex ID (e.g., `abc123`)
- Event log format: `<id>.jsonl` (append-only JSONL for crash safety)
- Optional snapshot: `<id>.snapshot.json` (full state for fast resume)
- Index file: `index.json` (conversation metadata for listing)
- Event types: `conversation_started`, `entry_added`, `entry_updated`, `model_changed`, `rolling_summary_set`, `conversation_ended`
- API: `generateConversationId()`, `startConversation()`, `loadConversation()`, `listConversations()`
- API: `logEntryAdded()`, `logEntryUpdated()`, `logModelChanged()`, `logRollingSummarySet()`, `logConversationEnded()`
- Stores both `repoRoot` (path) and `repoHash` (stable ID) for portability
- Resume validates repoRoot exists, warns if missing

### profile/learn.ts

- Project learning orchestration with 10 discovery topics
- Topics: summary, architecture, conventions, vocabulary, data flow, dependencies, workflow, hotspots, playbook, safety
- Runs sequential LLM sessions with read-only tools for each topic
- Uses custom system prompt focused on concise exploration
- Progress callback for UI updates (percent + topic name)
- Tool filtering: only read-only tools available during learning
- Returns complete markdown profile with H2 sections
- Maximum 5 tool use iterations per topic to prevent infinite loops
- Error handling: continues to next topic on failure

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
- Per-request options: `model`, `tools`, `systemOverride`, `signal` (AbortSignal), `thinking` (ThinkingConfig)
- `systemOverride` replaces default system prompt (used for summarization)
- Callbacks: `onChunk`, `onToolCall`, `onThinking`, `onComplete`, `onError`
- Abort support: checks signal during stream loop, returns `stopReason: "cancelled"`
- Helpers for building tool result and assistant messages

**Extended Thinking Support:**
- `ThinkingConfig`: `{ type: "enabled", budget_tokens: number }` enables Claude's thinking mode
- Handles `thinking_delta` and `signature_delta` events during streaming
- `ThinkingBlock`: contains summarized thinking text and signature (for API continuity)
- Thinking blocks must be preserved and passed back unmodified during tool loops
- `buildAssistantMessage()` includes thinking blocks when provided
- `StreamResult` includes `thinkingBlocks` array

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
| `search_text` | Text/regex search | Uses ripgrep if available, supports file+line range scope, optional contextLines (1-5) |
| `read_file` | Read file content | Line ranges, smart context, aroundMatch windowing, head/tail inclusion |
| `get_line_count` | Check file size | Quick stats before reading large files |
| `get_file_symbols` | Extract symbols | Functions, classes, types, interfaces (TS/JS/Py/Rust/Go/Java); redirects to find_blocks for HTML/CSS |
| `get_file_outline` | File structure outline | Hierarchical view with line numbers (TS/JS/Py/HTML/CSS) |
| `read_readme` | Read README | Auto-detect README.* |
| `detect_languages` | Language composition | By extension and size |
| `hotfiles` | Important files | Git history or fallback |
| `find_code_block` | Find code blocks | Locate functions/classes containing text, deduplicates nested HTML blocks |
| `expand_output` | Retrieve full output | Access cached digested tool outputs |
| `edit_replace_exact` | Replace exact text | Requires approval, enhanced failure diagnostics (whitespace, near-miss) |
| `edit_insert_at_line` | Insert at line | 1-based, requires approval |
| `edit_after_anchor` | Insert after anchor | Anchor-based insertion, handles multiple matches |
| `edit_before_anchor` | Insert before anchor | Anchor-based insertion, handles multiple matches |
| `edit_replace_block` | Replace between anchors | Replace content between two text markers |
| `edit_create_file` | Create/overwrite file | Requires approval |
| `edit_apply_batch` | Atomic batch edits | All-or-nothing, requires approval |
| `shell_run` | Execute shell command | Persistent PTY, requires approval or allowlist, stderr merged into stdout |
| `read_around` | Context window | Asymmetric before/after lines around anchor, occurrence handling |
| `find_blocks` | Structural map | Block coordinates without content (html_section, css_rule, js_ts_symbol, csharp_symbol, php_symbol, java_symbol) |
| `edit_by_anchor` | Unified anchor edit | Four modes: insert_before, insert_after, replace_line, replace_between |

#### Tool Output Digesting

North implements a context-efficient digesting layer that stores full tool outputs locally but forwards only condensed summaries to the model:

**Digest Strategies by Tool:**
| Tool | Digest Format |
|------|---------------|
| `read_file` | First 50 lines + "... N more lines" + last 10 lines |
| `search_text` | First 10 matches with context, total count |
| `find_files` | First 20 files + "... N more" |
| `shell_run` | First 20 lines + last 10 lines of stdout |
| Others | Pass through (already compact) |

**Cache Behavior:**
- Full outputs are cached per conversation turn
- Cache is cleared at the start of each `sendMessage()`
- Use `expand_output` tool to retrieve full cached output
- Digested outputs include `outputId` and `digestNote` for retrieval

**Implementation:**
- `src/utils/digest.ts`: `digestToolOutput()` function with per-tool strategies
- `src/tools/expand_output.ts`: Tool to retrieve cached full outputs
- Orchestrator integrates digest layer in `executeToolCall()`

#### Anchor-Based Editing

North provides anchor-based edit tools that address content by text patterns instead of brittle line numbers:

**Tools:**
- `edit_after_anchor`: Insert content after a line containing anchor text
- `edit_before_anchor`: Insert content before a line containing anchor text
- `edit_replace_block`: Replace content between two anchor markers

**Behavior:**
- If anchor appears once: operation proceeds
- If anchor appears multiple times without `occurrence` specified: returns candidates list
- Candidates include line number and preview for disambiguation
- Anchor-based edits are more reliable than line numbers across file changes

**Example:**
```typescript
// Instead of: edit_insert_at_line({ path, line: 42, content })
// Use: edit_after_anchor({ path, anchor: "function setupApp() {", content })
```

#### Edit Failure Diagnostics

`edit_replace_exact` provides enhanced failure diagnostics when text is not found:

**Whitespace Detection:**
- Tab vs space indentation mismatches
- CRLF vs LF line ending differences
- Trailing whitespace mismatches

**Near-Miss Candidates:**
- Uses Levenshtein distance to find lines similar to the search text
- Reports character-level differences (e.g., "differs at position 12: 'a' vs 'e'")
- Shows line numbers for near matches

**Actionable Hints:**
- Suggests `read_file` with `aroundMatch` for verification
- Recommends anchor-based editing as alternative

**Example error output:**
```
Text not found in file.

Possible whitespace issues:
  - Your search uses tabs but file uses spaces for indentation

Near matches found:
  - Line 42: "const myVariable = 1;"
    (differs at position 12: 'a' vs 'e')

Hint: Use read_file with aroundMatch to see exact content, or use anchor-based editing (edit_by_anchor).
```

#### Find Code Block Tool

`find_code_block` enables "jump to place" navigation without multiple search/read cycles:

**Input:**
- `path`: File to search
- `query`: Text to find within blocks
- `kind`: Optional filter - "function", "class", "method", "block", "any"

**Output:**
- `matches`: Array of blocks containing the query
- Each match includes: `startLine`, `endLine`, `snippet` (first 5 lines), `kind`, `name`
- `hint`: Helpful tip when no blocks match but text exists (HTML/CSS files suggest `find_blocks`)

**Supported Languages:**
- TypeScript/JavaScript: functions, classes, methods
- Python: functions, classes (indentation-based)
- CSS/SCSS: selectors, `@media` queries, `@keyframes` animations
- HTML: semantic sections, embedded `<style>` blocks with CSS rules, embedded `<script>` blocks with JS symbols
- Generic: brace-delimited blocks

**Helpful Hints:**
When searching HTML/CSS files and no code blocks contain the query (but the text exists in the file), the tool returns a hint suggesting `find_blocks` for better structural navigation of CSS selectors, `@media` queries, and embedded blocks.

#### Large File Navigation Strategy

The tool system includes specialized tools to efficiently navigate and understand large files without reading entire contents:

**Tool Chain for Large Files:**
1. **Check size first**: Use `get_line_count` to determine file size before reading
2. **Understand structure**: Use `get_file_symbols` or `get_file_outline` to see what's in the file
3. **Find targets**: Use `search_text` with file+lineRange to locate specific content
4. **Read strategically**: Use `read_file` with specific line ranges and optional context

**Symbol Extraction (`get_file_symbols`):**
- Regex-based parsing (fast, no dependencies)
- Supported languages: TypeScript, JavaScript, Python, Rust, Go, Java
- Extracts: functions, classes, interfaces, types, enums, methods
- Returns: symbol name, type, line number, signature preview
- Use case: "Where is function X defined?" or "What classes are in this file?"

**File Outline (`get_file_outline`):**
- Hierarchical structure with line ranges
- TypeScript/JavaScript: imports, symbols, exports
- Python: imports, classes (with methods), functions
- HTML: major sections (head, body, main, section), elements with IDs, **embedded content parsing**
- CSS/SCSS/Less: selectors with line ranges, media queries, keyframes
- Generic fallback: 50-line chunks
- Use case: "Show me the overall structure of this 1000-line file"

**HTML Embedded Block Parsing:**
For HTML files, `get_file_outline` now parses embedded `<style>` and `<script>` blocks:
- `<style>` blocks: Shows CSS rules inside with nested indicator (`└─ .selector`)
- `<script>` blocks: Shows JS symbols (functions, classes) with nested indicator
- Example output includes: `<style>`, `└─ .card`, `└─ @keyframes fadeIn`, `<script>`, `└─ function init`

**Enhanced Search (`search_text`):**
- New `file` parameter: search within a specific file only
- New `lineRange` parameter: search within specific line range
- New `contextLines` parameter: include 1-5 lines of context before/after each match
- Language hints in description: "For TypeScript: search for 'export function'"
- Use case: "Find all uses of X within lines 100-200 of file.ts"
- Context use case: `search_text({ query: "target", contextLines: 2 })` reduces follow-up read_around calls

**Smart Context (`read_file`):**
- `includeContext: "imports"`: automatically includes file imports when reading a range
- `includeContext: "full"`: expands to include full surrounding function/class
- `aroundMatch`: find text and return a window of lines around it
- `windowLines`: number of lines before/after match (default: 20)
- `includeHeadTail`: always include first 10 and last 10 lines for orientation
- Use case: "Read around 'function handleSubmit' with head/tail for context"

**System Prompt Guidance:**
The provider system prompts now explicitly instruct the LLM to:
- Check file size before reading files >200 lines
- Use symbols/outline tools to understand structure first
- Never read entire files when only one section is needed
- Chain tools strategically: outline → search → targeted read

**Expected Impact:**
- 60-80% token reduction when working with large files
- Faster symbol lookups without full reads
- Better targeting: LLM reads only what's needed
- Clearer guidance through concrete strategies

#### read_around Tool

`read_around` provides a focused context window around an anchor string:

**Input:**
- `path`: File to read
- `anchor`: Text to find
- `before`: Lines before match (default: 12)
- `after`: Lines after match (default: 20)
- `occurrence`: Which occurrence (1-based, required if multiple matches)

**Output:**
- `totalLines`: File length
- `matchCount`: How many times anchor appears
- `occurrenceUsed`: Which occurrence was returned
- `matchLine`: Line number of the match
- `content`: Lines with line numbers, match line marked with `>`

**Behavior:**
- 0 matches: error suggesting `search_text`
- Multiple matches without occurrence: error listing candidates with previews
- Single call replaces "search → read range" pattern

#### find_blocks Tool

`find_blocks` returns a structural map with coordinates but no content:

**Input:**
- `path`: File to map
- `kind`: Filter - `html_section`, `css_rule`, `js_ts_symbol`, or `all` (default: auto-detect)

**Output:**
- `totalLines`: File length
- `blocks`: Array of `{ id, label, startLine, endLine }`

**Supported Kinds:**
- `html_section`: `<section>`, `<article>`, `<nav>`, elements with IDs
- `css_rule`: selectors, `@media`, `@keyframes`
- `js_ts_symbol`: functions, classes, interfaces, types, React components
- `csharp_symbol`: namespaces, classes, structs, interfaces, methods, properties, enums
- `php_symbol`: namespaces, classes, interfaces, traits, functions, methods
- `java_symbol`: packages, classes, interfaces, enums, methods

**Mixed HTML Support:**

For HTML files with embedded `<style>` and `<script>` blocks, `find_blocks` automatically detects and parses both:
- Returns the `<style>` block itself with line range
- Parses CSS rules inside the style block (selectors, @media, @keyframes)
- Returns the `<script>` block itself with line range
- Parses JS/TS symbols inside the script block (functions, classes)

**Example output for mixed HTML:**
```
blocks: [
  { id: "html-0", label: "<header>", startLine: 5, endLine: 20 },
  { id: "style-0", label: "<style> (lines 22-45)", startLine: 22, endLine: 45 },
  { id: "style0-css-0", label: ".site-footer", startLine: 24, endLine: 28 },
  { id: "script-0", label: "<script> (lines 50-80)", startLine: 50, endLine: 80 },
  { id: "script0-js-0", label: "function initApp", startLine: 52, endLine: 65 }
]
```

**Use case:** Get coordinates in one call, then use `read_around` for targeted reading. For mixed HTML files, use this to locate specific CSS rules or JS functions before editing.

#### edit_by_anchor Tool

`edit_by_anchor` provides unified anchor-based editing with four modes:

**Input:**
- `path`: File to edit
- `mode`: `insert_before`, `insert_after`, `replace_line`, or `replace_between`
- `anchor`: Primary anchor text
- `anchorEnd`: End anchor (required for `replace_between`)
- `content`: Content to insert/replace
- `occurrence`: Which occurrence (1-based, required if multiple matches)
- `inclusive`: For `replace_between` - replace anchor lines too (default: false)

**Mode Behaviors:**
| Mode | Effect |
|------|--------|
| `insert_before` | Insert content before anchor line |
| `insert_after` | Insert content after anchor line |
| `replace_line` | Replace the anchor line with content |
| `replace_between` | Replace content between two anchors |

**Safety:**
- 0 matches: error
- Multiple matches without occurrence: error listing candidates
- `replace_line` mode is new capability (replaces the anchor line itself)

### utils/ignore.ts

- Parses .gitignore patterns
- Always ignores common directories (node_modules, .git, etc.)
- `createIgnoreChecker()` returns checker with `isIgnored(path, isDir)`
- `walkDirectory()` recursively walks repo respecting ignores
- `listRootEntries()` lists root level entries

### ui/App.tsx

- Root Ink component, wires orchestrator to UI state
- Uses alternate screen buffer via `useAlternateScreen()` hook (like htop/less)
- Tracks terminal dimensions via `useTerminalSize()` hook for viewport calculations
- CTRL+C handling via `useInput`: cancel if processing, exit if idle
- Requires `exitOnCtrlC: false` in render options to prevent Ink's default exit behavior
- Delegates review decisions to orchestrator methods (write, shell, command, plan)
- Tracks `isProcessing`, `pendingReviewId`, `nextMode`, and `scrollOffset` for UI state
- Passes mode to orchestrator on message submission
- Auto-resets scroll to bottom when transcript changes
- Layout: ScrollableTranscript (viewport-height top), Composer (fixed bottom), StatusLine (fixed bottom)

### ui/useAlternateScreen.ts

- Custom hook that switches terminal to alternate screen buffer on mount
- Uses ANSI escape codes: `\x1b[?1049h` (enter) and `\x1b[?1049l` (exit)
- Hides cursor during render, shows on exit
- Alternate screen means transcript is not in terminal scrollback after exit
- Similar behavior to `less`, `htop`, `vim`

### ui/useTerminalSize.ts

- Custom hook that tracks terminal dimensions (rows and columns)
- Listens to stdout "resize" events for dynamic updates
- Returns `{ rows, columns }` object
- Used by App to calculate viewport height for ScrollableTranscript

### ui/StatusLine.tsx

- Full-width status bar using `width="100%"` and `justifyContent="space-between"`
- Left side: project name with truncation for long names (`wrap="truncate"`)
- Right side: scroll indicator, thinking indicator, current model name, context usage, and cost display
- Scroll indicator: yellow [SCROLL] badge when scrollOffset > 0 (not at bottom)
- Thinking indicator: 💭 emoji when extended thinking is enabled
- Context display: color-coded circle (green < 60%, yellow 60-85%, red > 85%) + token count + percentage
- Token count formatted as K/M for readability (e.g., "42.5K (21%)")
- Cost display: session cost (green) / all-time cost (blue) in USD
- Updates in real-time as context fills and costs accumulate

### ui/CostsDialog.tsx

- Centered modal dialog showing cost breakdown
- Triggered by `/costs` command via `showCostsDialog()` context method
- Displays two sections: Session Costs and All-Time Costs
- Groups costs by provider (Anthropic, OpenAI) then by model
- Shows input/output token counts and USD cost per model
- Provider subtotals and section totals displayed
- Press Esc or Q to close dialog
- Reads all-time breakdown from `~/.north/costs.json` via `getCostBreakdown()`
- Session costs passed from orchestrator state

### ui/Composer.tsx

- Multiline input with Ctrl+J or Shift+Enter for newlines
- Paste support: multi-character input and newlines are detected and inserted directly
- Dynamic height: grows as content is added, reports line count to parent
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
- File mention autocomplete with `@`:
  - Detects `@` tokens at cursor position
  - Fuzzy matches against project files (respecting .gitignore)
  - Shows dropdown with filename + full path hint
  - Tab/Enter to attach file, Space/Esc to cancel (treat @ as literal)
  - Attached files tracked in component state
  - Visual indicator shows count of attached files
  - On submit, attached files passed to orchestrator for context injection
- Smart space insertion: only adds space after completion if needed
- Clamps selection index when suggestions change

### ui/ScrollableTranscript.tsx

- Renders conversation history with in-app scrolling (no terminal scrollback dependency)
- Pre-computes wrapped lines with ANSI color codes using `wrap-ansi`
- Renders only visible lines based on viewport height and scroll offset
- User messages: cyan label
- Assistant messages: magenta label  
- Tool messages: yellow ⚡ icon, gray text
- Command executed messages: blue ⚙ icon with result
- Interactive entries (diff_review, shell_review, command_review) rendered at bottom only when pending
- Resolved interactive entries convert to compact text lines that flow with transcript
- Keyboard navigation for scrolling (when composer not active):
  - Up/Down: scroll one line
  - PageUp/PageDown: scroll viewport height
  - G: jump to bottom (follow mode)
- Auto-scrolls to bottom when new content arrives
- Animation hooks disabled when transcript exceeds 100 entries

### ui/Transcript.tsx (legacy)

- Legacy transcript renderer using Ink's `<Static>` component pattern
- Kept for reference but replaced by ScrollableTranscript

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
- Keyboard shortcuts: `r` run, `a` always (adds to allowlist), `y` auto all (approves all future commands), `d` deny
- Status badges: pending (pulsing yellow border), ran/always/auto (green), denied (red)
- Animation: border color pulses when status is pending to draw attention
- "Auto All" option: enables global auto-approve for all future shell commands in this project

### utils/editing.ts

- `resolveSafePath()`: validates paths stay within repo root with symlink resolution
  - First checks normalized path is within repo
  - Resolves symlinks using `realpathSync()` to prevent path traversal attacks
  - Verifies resolved real path is still within repo boundary
  - For non-existent files (during creation), validates parent directory instead
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

### utils/pricing.ts

Model pricing data and cost calculation:
- `ModelPricing`: interface for per-model pricing (input, output, cached input, cache read/write)
- `TokenUsage`: interface for token counts (input, output, cached, cache read/write)
- `getModelPricing(modelId)`: returns pricing data for a model (falls back to defaults for unknown models)
- `calculateCost(modelId, usage)`: computes USD cost from token usage
- `formatCost(cost)`: formats cost as string (e.g., "$0.123", "$1.50")

**Anthropic Pricing (per 1M tokens):**
| Model | Input | Output | Cache Write | Cache Hit |
|-------|-------|--------|-------------|-----------|
| claude-sonnet-4-* | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-opus-4-* | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-opus-4-1-* | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-sonnet-4-5-* | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5-* | $1.00 | $5.00 | $1.25 | $0.10 |
| claude-opus-4-5-* | $5.00 | $25.00 | $6.25 | $0.50 |

**OpenAI Pricing (per 1M tokens):**
| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| gpt-5.1 | $1.25 | $10.00 | $0.125 |
| gpt-5.1-codex | $1.25 | $10.00 | $0.125 |
| gpt-5.1-codex-mini | $0.25 | $2.00 | $0.025 |
| gpt-5.1-codex-max | $1.25 | $10.00 | $0.125 |
| gpt-5 | $1.25 | $10.00 | $0.125 |
| gpt-5-mini | $0.25 | $2.00 | $0.025 |
| gpt-5-nano | $0.05 | $0.40 | $0.005 |

### utils/fileindex.ts

File index for @ mention autocomplete in Composer:
- `getFileIndex(repoRoot)`: returns cached list of all non-ignored files
- Uses `walkDirectory()` from `ignore.ts` with 5000 file cap
- `fuzzyMatchFiles(query, files, limit)`: fuzzy match files against query
- Scoring: exact filename > prefix match > contains > subsequence
- Cache per repoRoot for performance
- `clearFileIndexCache(repoRoot?)`: clear cache when needed

### utils/filepreview.ts

File preview generation for attached file context:
- `generateFilePreview(repoRoot, filePath)`: returns preview + outline
- Preview: first 30 lines or 2KB (whichever is smaller)
- Outline: extracted symbols (functions, classes, types) with line numbers
- Supports TypeScript/JavaScript and Python symbol extraction
- `formatAttachedFilesContext(repoRoot, filePaths)`: formats multiple files for injection
- Output format: markdown with code blocks and symbol outlines
- Limited to 15 symbols per file with "more" indicator

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

### Path Security

All file operations use symlink-aware path validation to prevent path traversal attacks:

**Security layers:**
1. **Normalization**: Resolve `..` and `.` segments in paths
2. **Boundary check**: Verify normalized path is within repo root
3. **Symlink resolution**: Use `realpathSync()` to resolve symlinks
4. **Final verification**: Ensure resolved real path is still within repo boundary

**Implementation sites:**
- `resolveSafePath()` in `utils/editing.ts` - Used by all write operations
- `resolvePath()` in `tools/read_file.ts` - Used by read operations

**Non-existent file handling:**
- When file doesn't exist (e.g., during creation), recursively validates parent directories
- Walks up the directory tree until finding an existing directory, then validates it
- Ensures at least one ancestor directory exists and resolves within repo
- Prevents creating files via symlink directory chains that escape repo
- Supports creating files in deeply nested directories that don't exist yet (e.g., `deep/nested/dir/file.txt`)

**Attack prevented:**
A symlink inside the repo pointing to `/etc/passwd` or other sensitive files would fail validation because the real path would resolve outside the repo boundary.

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
- `<communication>` - Tone, formatting, honesty rules (no lying, no guessing paths). Includes operational workflow: "If you need a file, find it first."
- `<tool_calling>` - Schema adherence, batch-level narration (not per-call), batching etiquette (1-2 info rounds before edits, no re-reading same ranges)
- `<planning>` - Micro-planning for 2+ file tasks (2-5 bullet plan, then execute immediately)
- `<search_and_reading>` - Question-first search methodology, formulation checklist (broad → narrow → minimal reads), bias toward self-discovery, **tool selection by file type** (HTML/CSS → `find_blocks`, JS/TS/Python → `get_file_outline`), **optimal tool chain for HTML/CSS** (`find_blocks` → `search_text` → `read_around` → edit)
- `<making_code_changes>` - Default workflow (locate → confirm → atomic write → verify), read before edit, one edit per turn or atomic batch, no large pastes
- `<verification>` - Mandatory verification after edits, fix duplication/malformed structure immediately
- `<mixed_files>` - Strategy for HTML with embedded style/script: use find_blocks first, target by coordinates, pre-check selectors
- `<tool_churn_limits>` - After 2 reads + 1 write without success, switch to structure-first and atomic edits
- `<debugging>` - Edit only if confident, retry logic (re-read once on mismatch, max 3 lint loops)
- `<calling_external_apis>` - Only when explicitly requested
- `<long_running_commands>` - Never start dev servers or processes needing CTRL+C to stop
- `<conversation>` - Session UX rules (end with "Next I would: ...", acknowledge session resumption)

**Key behaviors enforced:**
- "If you did not read it, do not claim it exists"
- Never guess file paths or symbol names; find files/symbols before describing behavior
- Describe actions in natural language ("I'll search the repo") not tool names
- Before any batch of tool calls, write one sentence explaining the batch goal (not per-call)
- Prefer 1-2 rounds of info gathering before any edits; edit in the same turn when ready
- Plan briefly (2-5 bullets) for 2+ file tasks, then execute immediately
- Phrase search needs as questions first, then translate to exact patterns
- Retry once on edit mismatch, then ask for clarification
- Prefer surgical edits over large rewrites; break large content into chunks
- For new files >200 lines: create skeleton first, then add content in subsequent edits
- Avoid generating >300 lines in a single tool call
- End longer responses with "Next I would: ..." to signal continuation
- **Default workflow:** LOCATE → CONFIRM → ATOMIC WRITE → VERIFY
- **Verification mandatory:** After every edit, read the edited region to confirm
- **Mixed files:** For HTML with embedded CSS/JS, use find_blocks to get structural map first
- **Tool churn limits:** After 2 reads + 1 write on same file, switch to structure-first atomic edits

### Mode System

North supports two conversation modes that control tool availability:

**Mode Types:**
- **Ask Mode**: Read-only - only read tools available (read_file, search_text, find_files, list_root, read_readme, detect_languages, hotfiles, get_line_count, get_file_symbols, get_file_outline, expand_output, find_code_block, read_around, find_blocks)
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

### Cost Tracking

North tracks API costs in real-time, displaying both session and all-time totals.

**How it works:**
1. Providers capture actual token usage from API responses (`usage` field in `StreamResult`)
2. After each successful API request, orchestrator calculates cost using `calculateCost()`
3. Session cost accumulated in memory, all-time cost persisted to `~/.north/costs.json`
4. StatusLine displays both costs: `$session / $all-time`

**Token usage sources:**

*Anthropic:*
- `message_start` and `message_delta` events contain `usage` object
- `input_tokens`: non-cached, non-cache-write input tokens (already excludes cached)
- `output_tokens`: output tokens (includes extended thinking)
- `cache_read_input_tokens`: tokens served from cache (charged at reduced cache hit rate)
- `cache_creation_input_tokens`: tokens written to cache (charged at cache write rate)

*OpenAI:*
- `response.completed` event contains `response.usage` object
- `input_tokens`: total input tokens
- `output_tokens`: output tokens (includes reasoning tokens)
- `input_tokens_details.cached_tokens`: tokens served from prompt cache (charged at reduced rate)

**Cost calculation (additive model):**

*Anthropic (fields are additive, not subtractive):*
- Base input cost = `inputTokens` × inputRate
- Cache hit cost = `cacheReadTokens` × cacheHitRate
- Cache write cost = `cacheWriteTokens` × cacheWriteRate
- Output cost = `outputTokens` × outputRate

*OpenAI (cachedInputTokens subtracted from total):*
- Non-cached input cost = (`inputTokens` - `cachedInputTokens`) × inputRate
- Cached input cost = `cachedInputTokens` × cachedInputRate
- Output cost = `outputTokens` × outputRate

**Note:** Currently only supports 5-minute cache duration pricing for Anthropic. 1-hour cache has higher write rates not yet modeled.

**Display format:**
- Session cost: green color, shows cost since app started
- All-time cost: blue color, shows cumulative cost across all sessions
- Format: `$0.00` to `$0.001` (3 decimals for small), `$0.12` to `$99.99` (2 decimals)

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
- Incomplete streams: "incomplete tool call", "possible timeout" (stream ended mid-tool-generation)

**Non-retryable errors (fail immediately):**
- Authentication errors (401, 403)
- Bad request errors (400)
- Cancellation/abort

**API Request Timeout:**
- Both providers configured with 10-minute timeout for large responses
- Anthropic: `timeout` option passed to SDK client constructor
- OpenAI: `AbortSignal.timeout()` combined with user abort signal via `AbortSignal.any()`

**Incomplete Stream Detection:**
- Anthropic: If `currentToolId` is set when stream ends, throws error (tool was mid-generation)
- OpenAI: If `stopReason === null` and `toolCallsInProgress` has entries, throws error
- These errors are detected by `isRetryableError()` and trigger automatic retry

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

### NORTH_FILE Protocol

File creation uses a streaming-to-disk protocol where the model outputs file contents as plain assistant text. Content is written directly to disk as it streams, with automatic continuation on provider timeouts.

**Format:**
```
<NORTH_FILE path="relative/path/to/file.ts">
...file contents...
</NORTH_FILE>
```

**Continuation format (auto-generated on timeout):**
```
<NORTH_FILE path="relative/path/to/file.ts" mode="append">
...continuation content...
</NORTH_FILE>
```

**Why streaming-to-disk:**
- Provider timeouts (~90s) can interrupt large file generation
- Tool calls buffer in memory and lose all content on timeout
- Direct-to-disk streaming preserves partial content
- Auto-continuation resumes from last written line

**Flow:**
1. Model outputs `<NORTH_FILE path="...">` tag in response
2. `StreamingFileBlockParser` detects open tag, emits `session_start` event
3. `FileWriteSession` created, opens file at final path (creates parent dirs if needed)
4. Content chunks written directly to disk as they stream
5. Session tracks `linesWritten` and maintains 30-line trailing window for context
6. When `</NORTH_FILE>` closes: session finalized, diff review triggered
7. On accept: file already written, nothing more to do
8. On reject: file deleted from disk

**Auto-continuation on timeout:**
1. Stream ends without close tag (provider timeout ~90s)
2. Orchestrator detects incomplete session
3. Sends continuation prompt with trailing window context
4. Model responds with `<NORTH_FILE mode="append">` block
5. Content appended to existing file
6. Repeats until complete or max retries (3) exceeded
7. On max retries: partial file preserved, error surfaced to user

**Implementation (src/utils/):**
- `fileblock.ts`:
  - `StreamingFileBlockParser` - event-based streaming parser
  - Events: `session_start`, `session_content`, `session_complete`, `display_text`
  - Parses `mode="append"` attribute for continuation blocks
- `filesession.ts`:
  - `FileWriteSession` - streaming file writer with line tracking
  - `startSession(repoRoot, path)` - creates new file
  - `appendToSession(...)` - continues from existing state
  - `getResumeInfo()` - returns lines written + trailing window

**Tool Input Size Guard:**
- All tool inputs checked against 50KB limit before execution
- Prevents large payloads from being sent via tools
- Error message directs model to use NORTH_FILE protocol instead

### Shell Approval Flow

When Claude requests `shell_run` (approvalPolicy: "shell"):
1. Orchestrator checks if global auto-approve is enabled (`.north/autoaccept.json`)
2. If auto-approve enabled: execute immediately, status set to "auto", return result
3. If not auto-approved, check if command is in `.north/allowlist.json`
4. If allowed: execute immediately, status set to "always", return result
5. If not allowed: create `shell_review` transcript entry with status "pending"
6. Tool loop blocks, waiting for user decision
7. ShellReview component renders command with Run/Always/Auto All/Deny options
8. User presses `r` (run), `a` (always), `y` (auto all), or `d` (deny)
9. On Run: execute command, status set to "ran"
10. On Always: add to allowlist, execute command, status set to "always"
11. On Auto All: enable global auto-approve, execute command, status set to "auto"
12. On Deny: return `{ denied: true }` to Claude, status set to "denied"
13. Tool result sent to Claude with outcome
14. Claude continues processing

**Approval Priority:** Global auto-approve (step 1) takes precedence over command allowlist (step 3). Once auto-approve is enabled, all commands run automatically without checking the allowlist.

### File Mentions (@ Autocomplete)

North supports `@` file mentions similar to Cursor and Claude Code. Users can attach files to their messages for automatic context injection.

**User Flow:**
1. User types `@` in the Composer
2. Autocomplete shows fuzzy-matched project files (respecting .gitignore)
3. User can:
   - **Tab/Enter**: Accept suggestion, file becomes attached
   - **Space/Escape**: Dismiss autocomplete, `@` treated as literal text
4. Attached files shown as badge in Composer (e.g., "📎 2 files attached")
5. On message submit, attached files passed to orchestrator

**Context Injection:**
1. Orchestrator receives `attachedFiles: string[]` in `sendMessage()`
2. In `buildMessagesForClaude()`, attached files injected as context block
3. Position: after cursor rules, after project profile, before rolling summary
4. Format per file:
   - Markdown header with file path
   - Code block with first 30 lines (or 2KB)
   - Symbol outline (functions, classes, types with line numbers)

**Example Injected Context:**
```
# Attached Files

## src/ui/Composer.tsx

```typescript
import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
... [27 more lines]
```

**Outline (Composer.tsx):**
- interface Suggestion (line 7)
- interface ComposerProps (line 14)
- function Composer (line 197)
```

**File Index:**
- Built lazily on first `@` autocomplete
- Cached per repoRoot for performance
- Respects .gitignore via `walkDirectory()`
- Capped at 5000 files

**Fuzzy Matching:**
- Exact filename matches score highest
- Prefix matches score next
- Subsequence matching for partial queries
- Results sorted by score, limited to 10 suggestions

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

### Project Learning

North can learn a project on first run and store a persistent profile for context in future conversations.

**Startup Flow:**

1. **Profile Detection** (in `index.ts`):
   - Checks if profile exists via `hasProfile(repoRoot)`
   - If profile exists: loads it with `loadProfile(repoRoot)`
   - If no profile and not declined: sets `needsLearningPrompt = true`

2. **Learning Prompt** (first-time projects):
   - App renders `LearningPrompt` component when `learningPromptId` is set
   - User presses `y` (accept) or `n` (decline)
   - On decline: marks project as declined via `markDeclined(repoRoot)`
   - On accept: triggers `orchestrator.startLearningSession()`

3. **Learning Session**:
   - Runs 10 sequential discovery topics via `runLearningSession()`
   - Each topic: focused LLM query with read-only tools
   - Progress updates via callback: `onProgress(percent, topicTitle)`
   - UI shows `LearningProgress` component with percent and current topic
   - Profile saved to `~/.north/projects/<hash>/profile.md`

4. **Profile Injection** (in `buildMessagesForClaude()`):
   - If `projectProfileText` exists, inject after cursor rules
   - Format: markdown with H2 sections for each topic
   - Position: Cursor rules → Project profile → Rolling summary → Transcript

**Discovery Topics:**

1. **Project Summary** - What it is, who it's for, workflows, what it doesn't do
2. **Architecture Map** - Major modules, entry points, structure
3. **Code Style and Conventions** - Naming, layout, formatting, lint rules
4. **Domain Model Vocabulary** - Key concepts, terms, canonical locations
5. **Data Flow and State** - Persistence, caches, data paths
6. **External Dependencies** - Frameworks, libraries, services, config
7. **Build, Run, and Test Workflow** - Commands and workflows
8. **Hot Spots and Change Patterns** - Frequently changed areas
9. **Common Tasks Playbook** - Where to implement common changes
10. **Safety Rails and Footguns** - Known pitfalls and constraints

**Storage:**

- Profile: `~/.north/projects/<hash>/profile.md`
- Declined marker: `~/.north/projects/<hash>/declined.json`
- Hash: SHA-256 of repo root path (first 16 chars)
- Format: Markdown with `# Project Profile` header + H2 sections

**`/learn` Command:**

- Clears declined marker via `clearDeclined(repoRoot)`
- Triggers learning session via `ctx.triggerLearning()`
- Overwrites existing profile if present
- Use case: manually update profile after major project changes

**UI Components:**

- `LearningPrompt`: Y/N prompt with border pulse animation (pending)
- `LearningProgress`: Percent + topic name display during learning

**State Management:**

- Orchestrator tracks: `learningPromptId`, `learningInProgress`, `learningPercent`, `learningTopic`
- Transcript entries: `learning_prompt` (with status), `learning_progress` (with percent/topic)
- Learning entries excluded from `buildMessagesForClaude()` (UI-only)

### Conversation Persistence

North persists conversations for later resumption using an append-only event log.

**Storage Location:**
- `~/.north/conversations/<id>.jsonl` - append-only event log
- `~/.north/conversations/<id>.snapshot.json` - optional full snapshot
- `~/.north/conversations/index.json` - conversation metadata index

**Event Types:**
- `conversation_started`: ID, repoRoot, repoHash, model, timestamp
- `entry_added`: full TranscriptEntry payload
- `entry_updated`: entry ID + partial updates (streaming completion, review decisions)
- `model_changed`: new model ID
- `rolling_summary_set`: StructuredSummary or null
- `conversation_ended`: clean exit marker

**Resume Flow:**
1. `north resume <id>` loads conversation from event log
2. Validates repoRoot exists (warns if missing)
3. Orchestrator initialized with `initialState` (transcript, rollingSummary, model)
4. Conversation continues normally with logging enabled

**Persistence Triggers:**
- `addEntry()` → `logEntryAdded()`
- `updateEntry()` → `logEntryUpdated()`
- `setModel()` → `logModelChanged()`
- `setRollingSummary()` → `logRollingSummarySet()`
- `stop()` → `logConversationEnded()` + resolve pending reviews

**Pending Review Handling:**
- On exit, pending reviews are resolved as cancelled/rejected/denied
- Review status updates are persisted before exit
- Resume never has pending interactive states (deterministic)

**CLI Commands:**
- `north` - new conversation (generates 6-char hex ID)
- `north resume <id>` - resume by ID
- `north resume` - interactive picker of recent conversations
- `north conversations` or `north list` - list conversations with metadata

**Slash Commands:**
- `/conversations` - picker to switch to another conversation
- `/resume <id>` - switch to conversation by ID directly

**Portability:**
- Both `repoRoot` (path) and `repoHash` (SHA-256 prefix) stored
- If repoRoot missing on resume, warns user and continues
- User can provide `--path` to specify new location

### Cancellation Flow (CTRL+C)

The app handles CTRL+C via Ink's `useInput` hook (not process.on SIGINT) contextually:

1. **During processing** (`isProcessing() === true`):
   - Calls `orchestrator.cancel()`
   - Aborts the current AbortController (stops API streaming)
   - Aborts the shell AbortController (kills any running shell command)
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
- `shellAbortController` tracks any running shell command (created per-command)
- `cancelled` flag checked in conversation loop
- Provider stream loop checks `signal.aborted` and exits gracefully
- Shell process killed via `proc.kill()` when abort signal fires
- Pending write/shell/command reviews auto-resolve on cancel

### Tool Display Formatting

The orchestrator formats tool names for better readability in the TUI:
- `list_root` → "Listing project files - N entries"
- `find_files` → "Finding pattern - N files" (with + suffix if truncated)
- `read_file` → "Reading filename.ext"
- `get_line_count` → "Checking size of filename.ext"
- `get_file_symbols` → "Extracting symbols from filename.ext"
- `get_file_outline` → "Outlining filename.ext"
- `edit_replace_exact` → "Editing filename.ext (+X/-Y)" after approval
- `edit_insert_at_line` → "Editing filename.ext (+X/-Y)" after approval
- `edit_create_file` → "Creating filename.ext (+X/-Y)" after approval
- `edit_apply_batch` → "Editing N files (+X/-Y)" after approval
- Other tools: shown as-is

**Edit Stats Display:**
- After an edit is approved (accept/always) or auto-applied, the tool entry is updated to show line statistics
- Format: `+X/-Y` where X is lines added and Y is lines removed
- Stats computed from the diff content using `linesAdded` and `linesRemoved` from FileDiff

Implementation split between:
- `formatToolNameForDisplay()` in orchestrator: extracts display name from tool arguments
- `computeDiffStats()` in orchestrator: calculates total added/removed lines from diffs
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

### Alternate Screen Buffer & In-App Scrolling

North uses an alternate screen buffer (like `htop`, `less`, `vim`) instead of terminal scrollback:

**Why alternate screen?**
- Ink's differential rendering (cursor moves + line clears) conflicts with terminal scrollback
- When Ink redraws while user scrolls, scrollback can become corrupted
- Different terminals (iTerm2, Terminal.app) handle this inconsistently
- Alternate screen provides a stable, controlled viewport

**Architecture:**
```
Terminal (alternate screen)
┌────────────────────────────────────┐
│ ScrollableTranscript               │ ← viewport-height, renders line slice
│   - Pre-wrapped lines with ANSI    │
│   - Only visible lines rendered    │
│   - Scroll offset from bottom      │
├────────────────────────────────────┤
│ Interactive entries (reviews)      │ ← Always visible at bottom
├────────────────────────────────────┤
│ Composer                           │ ← Fixed height
├────────────────────────────────────┤
│ StatusLine                         │ ← Fixed height, shows [SCROLL]
└────────────────────────────────────┘
```

**State:**
- `scrollOffset`: lines from bottom (0 = follow mode)
- `viewportHeight`: terminal rows - composer - status - padding (dynamic based on composer line count)
- `viewportWidth`: terminal columns - padding
- `composerLineCount`: tracked via callback from Composer for dynamic height calculation

**Keyboard:**
- Up/Down: scroll ±1 line (when composer disabled)
- PageUp/PageDown: scroll ±viewportHeight
- G: jump to bottom

**Tradeoff:**
- Transcript is not in terminal scrollback after exit
- Future: add `/export` command to save transcript to file

### Transcript Performance Optimizations

To prevent flickering in large conversations, North implements several Ink-specific optimizations:

1. **Static Rendering with `<Static>`**:
   - Ink's `<Static>` component renders items once and never re-renders them
   - Completed transcript entries (not streaming, not pending review) are rendered inside `<Static>`
   - Only dynamic entries (streaming messages, pending reviews) re-render on state changes
   - This transforms "redraw 2000-line screen 12x/sec" into "redraw small dynamic section"
   - **Entry uniqueness**: Deduplication check prevents same entry ID from appearing in both sections
   - **Review status priority**: For review entries, `reviewStatus` determines static vs dynamic, preventing race conditions during state transitions

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
- `read_file`: 500 lines or 100KB max, optional context modes (imports/full)
- `search_text`: 50 matches default, 200 max, supports file-specific and line range searches
- `find_files`: 50 files default, 500 max
- `get_line_count`: No limits, quick stat check
- `get_file_symbols`: Returns all detected symbols (functions, classes, types, etc.)
- `get_file_outline`: Returns hierarchical structure with line ranges
- `read_readme`: 8KB max
- `hotfiles`: 10 files default, 50 max

Truncation is always explicit with `truncated: true` in results.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API client |
| `ink` | ^5.1.0 | Terminal UI framework |
| `react` | ^18.3.1 | UI component model |
| `wrap-ansi` | ^9.0.2 | ANSI-aware text wrapping for scroll viewport |
| `string-width` | ^8.1.0 | Unicode-aware string width calculation |

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
- `tests/storage.test.ts`: Storage layer tests
  - Allowlist storage (per-project command allowlist)
  - AutoAccept storage (per-project auto-accept settings)
  - Global config storage (user preferences)
- `tests/tools-read.test.ts`: Read tool tests
  - `get_file_outline` HTML embedded block tests (style/script parsing)
  - `get_file_symbols` HTML/CSS redirect hint tests
  - `search_text` contextLines tests
- `tests/tools-edit.test.ts`: Edit tool tests
  - Prepare contract tests
  - Trailing newline preservation
  - Failure diagnostic tests (whitespace, near-miss, hints)
- `tests/tools-find-code-block.test.ts`: Find code block tool tests
  - CSS selector and `@media`/`@keyframes` detection
  - HTML embedded style/script block parsing
  - Helpful hints for HTML/CSS files
  - Nested block deduplication
- `tests/tools-find-blocks.test.ts`: Find blocks tool tests
  - Mixed HTML parsing (embedded style/script)
  - CSS rules inside style blocks
  - JS symbols inside script blocks
  - Kind filtering
  - C#/PHP/Java symbol detection (namespaces, classes, methods, traits)
- `tests/tools-workflow.test.ts`: Integration-style workflow tests
  - Mixed HTML navigation patterns
  - Edit failure diagnostics workflow
  - Structure-first editing patterns
  - CSS selector pre-checking
- `tests/tools-security.test.ts`: Path traversal and symlink security tests
- `tests/tools-shell.test.ts`: Shell service tests
- `tests/rules-cursor.test.ts`: Cursor rules loader tests

**Test Isolation:**

Tests that interact with user storage use environment variable overrides to prevent modifying actual user data:
- **Config tests**: Set `NORTH_CONFIG_DIR` to temporary directory instead of manipulating `HOME`
- **Repo-scoped tests**: Use `createTempRepo()` helper to create isolated temporary repositories
- `afterEach` hooks ensure cleanup of temporary directories and restoration of environment variables

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
