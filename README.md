# North

A Claude-powered terminal assistant for codebases. Chat, search, edit, and run commands—all from your terminal.

![North in action](screenshot.png)

## What is North?

North is a minimalist CLI for pair programming with Claude. It runs entirely in your terminal using an Ink-based TUI, providing:

- **Streaming conversation** — Claude's responses appear token-by-token
- **Codebase navigation** — Search, read, and explore your repo through natural language
- **Deterministic file edits** — All changes shown as diffs for review before writing
- **Persistent shell session** — Run commands in a PTY that maintains state across calls
- **Local-first design** — Your code stays on your machine; only prompts go to the API

North is opinionated: Claude proposes, you approve. Every file change requires explicit acceptance. Every shell command requires permission.

## Key Features

| Feature | Description |
|---------|-------------|
| **Streaming responses** | Token-by-token output with no UI freezing |
| **Smart codebase tools** | Find files, search text, detect languages, identify hotfiles |
| **Inline diff review** | See exactly what changes before they're written |
| **Persistent PTY** | Shell state preserved across commands (`cd`, env vars, etc.) |
| **Per-project allowlist** | Approve commands once, run automatically thereafter |
| **Gitignore-aware** | All operations respect your `.gitignore` patterns |

## Safety Model

North gates all side effects behind explicit approvals:

### File Edits
Every file modification displays an inline diff. You must explicitly **accept** or **reject** before any bytes are written. Rejections inform Claude so it can adjust its approach.

### Shell Commands
Every command triggers an approval prompt with three options:
- **Run** (`r`) — Execute once, ask again next time
- **Always** (`a`) — Add to allowlist and execute; auto-approve future identical commands
- **Deny** (`d`) — Block execution, inform Claude the command was denied

### Allowlist
Approved commands are stored in `.north/allowlist.json` per project. This file contains exact command strings—no patterns or wildcards.

```json
{
  "allowedCommands": [
    "bun test",
    "npm run build",
    "git status"
  ]
}
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        You type                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator sends to Claude                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Claude streams response + tool requests            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   Read tools: execute    │    │  Write/Shell tools:      │
│   immediately, return    │    │  show approval prompt    │
│   results to Claude      │    │  → wait for decision     │
└──────────────────────────┘    └──────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Loop continues until Claude finishes                │
└─────────────────────────────────────────────────────────────┘
```

**Mental model**: North is the host. Claude is the guest. The guest can ask to do things, but the host decides what actually happens.

## Install

### Prerequisites
- [Bun](https://bun.sh) runtime (v1.0+)
- macOS or Linux
- Anthropic API key

### From Source

```bash
git clone https://github.com/yourusername/north.git
cd north
bun install
bun run build
```

### Build Self-Contained Binary

```bash
# For your current platform
bun run build:binary

# Cross-compile
bun run build:binary:mac-arm    # Apple Silicon
bun run build:binary:mac-x64    # Intel Mac
bun run build:binary:linux      # Linux x64
```

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Run in current directory
bun run dev

# Or run in a specific repo
bun run dev --path /path/to/your/repo
```

## Usage

### CLI Options

```bash
north [options]

Options:
  --path <dir>        Override repo root detection (default: current directory)
  --log-level <level> Set log verbosity: info | debug (default: info)
```

### Multiline Input

| Action | Key |
|--------|-----|
| Send message | `Enter` |
| Insert newline | `Shift+Enter` or `Ctrl+J` |
| Navigate cursor | Arrow keys |

### Keyboard Shortcuts

| Context | Key | Action |
|---------|-----|--------|
| Diff review | `a` | Accept changes |
| Diff review | `r` | Reject changes |
| Shell approval | `r` | Run this time |
| Shell approval | `a` | Always allow (add to allowlist) |
| Shell approval | `d` | Deny execution |
| Global | `Ctrl+C` | Exit North |

## Tools Overview

North exposes these tools to Claude:

### Navigation & Search (no approval needed)

| Tool | Purpose |
|------|---------|
| `list_root` | List repo root entries, respecting `.gitignore` |
| `find_files` | Glob pattern file search (case-insensitive) |
| `search_text` | Text/regex search using ripgrep or fallback |
| `read_file` | Read file content with optional line ranges |
| `read_readme` | Find and read README.* files |
| `detect_languages` | Analyze language composition by extension |
| `hotfiles` | Identify frequently modified files via git history |

### File Editing (requires approval)

| Tool | Purpose |
|------|---------|
| `edit_replace_exact` | Replace exact text matches (whitespace-sensitive) |
| `edit_insert_at_line` | Insert content at a specific line number |
| `edit_create_file` | Create new files or overwrite existing |
| `edit_apply_batch` | Atomic batch of edits (all-or-nothing) |

### Shell (requires approval)

| Tool | Purpose |
|------|---------|
| `shell_run` | Execute commands in persistent PTY session |

### Output Limits

Tools enforce limits to prevent context overflow:
- `read_file`: 500 lines or 100KB
- `search_text`: 50 matches (max 200)
- `find_files`: 50 files (max 500)
- `read_readme`: 8KB
- `hotfiles`: 10 files (max 50)

## Configuration & Storage

### Project-Local (`.north/`)

Created in your repo root when needed:

| File | Purpose |
|------|---------|
| `allowlist.json` | Shell commands approved with "Always" |
| `memory.json` | Project-specific memory *(planned)* |
| `cache.json` | Project card cache *(planned)* |
| `project.json` | Project settings *(planned)* |

### Global Locations

| Path | Purpose |
|------|---------|
| `~/.config/north/config.json` | Global configuration *(planned)* |
| `~/.local/share/north/memory.json` | Global memory *(planned)* |
| `~/.local/state/north/north.log` | Append-only session logs |

## Approvals

### File Edit Review

When Claude proposes file changes, you'll see an inline diff:

```diff
 src/App.tsx
 ──────────────────────────────────
   function App() {
-    return <div>Hello</div>
+    return <div>Hello, World!</div>
   }
 ──────────────────────────────────
 +1 -1 │ [a]ccept [r]eject
```

- Press `a` to apply changes atomically
- Press `r` to discard; Claude receives a rejection notice

### Shell Command Review

```
┌─────────────────────────────────────────┐
│ Command: npm run build                  │
│                                         │
│ [r]un  [a]lways  [d]eny                 │
└─────────────────────────────────────────┘
```

- `r` — Run once, prompt again next time
- `a` — Add to `.north/allowlist.json`, run now and auto-approve future calls
- `d` — Block execution, Claude is informed

### Allowlist Format

```json
{
  "allowedCommands": [
    "bun test",
    "npm run build",
    "git status"
  ]
}
```

Commands must match exactly (including arguments). No glob patterns.

## Supported Platforms

| Platform | Status |
|----------|--------|
| macOS (Apple Silicon) | ✅ Supported |
| macOS (Intel) | ✅ Supported |
| Linux (x64) | ✅ Supported |
| Windows | ❌ Not supported |

### Requirements

- **Runtime**: Bun 1.0+
- **Environment**: `ANTHROPIC_API_KEY` must be set
- **Shell**: Uses `/bin/bash` for PTY sessions
- **Optional**: `ripgrep` (`rg`) for faster search (falls back to JS implementation)

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Export your API key before running:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Tool search is slow
Install ripgrep for significantly faster text search:
```bash
# macOS
brew install ripgrep

# Linux
apt install ripgrep
```

### Shell command seems stuck
Commands have a default timeout. If a command hangs, the PTY session is destroyed and recreated to prevent poisoned state.

### Diff shows unexpected changes
Edit tools require exact text matches including whitespace. If anchors aren't found, Claude receives an error prompting it to re-read the file.

### Logs location
Check `~/.local/state/north/north.log` for detailed session logs in JSON-lines format.

## Development

### Run in Development

```bash
bun run dev
bun run dev --path /some/repo --log-level debug
```

### Build

```bash
# JavaScript output
bun run build

# Self-contained binary
bun run build:binary
```

### Type Check

```bash
bun run typecheck
```

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── logging/              # JSON-lines logger
├── orchestrator/         # Conversation state, tool loop
├── provider/             # Anthropic streaming client
├── shell/                # Persistent PTY service
├── storage/              # Allowlist persistence
├── tools/                # Tool implementations
├── ui/                   # Ink components
└── utils/                # Repo detection, ignore parsing, editing
```

See `docs/implementation.md` for detailed architecture documentation.

## Privacy & Logging

### What's logged locally
- App lifecycle events (start, exit)
- User prompt lengths (not content)
- Model requests (request ID, model name, duration)
- Tool calls (name, argument summaries, duration, success/failure)
- Approval decisions

### What's NOT logged
- Full file contents
- API keys
- Exact user prompts

### What's sent to Anthropic
- Your prompts and conversation history
- Tool results (file contents, search results, command output)
- System context about your project

Logs are append-only at `~/.local/state/north/north.log`. Delete anytime.

## Roadmap

| Milestone | Status | Description |
|-----------|--------|-------------|
| 1. Chat UI + streaming | ✅ Complete | Ink TUI, multiline input, streaming |
| 2. Read/search tools | ✅ Complete | Navigation and search capabilities |
| 3. Deterministic edits | ✅ Complete | Inline diff review, atomic writes |
| 4. Persistent PTY | ✅ Complete | Shell approvals, allowlist |
| 5. Memory + cache | 🔲 Planned | Project card cache, memory stores |
| 6. UX polish | 🔲 Planned | Slash commands, better formatting |

## Contributing

North is intentionally spec-driven. Before contributing:

1. Read `SPEC.md` for design philosophy
2. Read `MILESTONES.md` for current priorities
3. Read `docs/implementation.md` for architecture details

When in doubt, default to:
- The simplest approach that meets acceptance criteria
- Deterministic behavior over "smart" behavior
- Fewer files and fewer dependencies

## License

MIT
