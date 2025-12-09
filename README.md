# North

**The terminal-native AI coding assistant that actually ships.**

A Claude-powered pair programmer that lives in your terminal. No IDE lock-in, no subscription tiers, no bloat—just you, Claude, and your codebase.

![North in action](screenshot1.png)
![One Shot Website](screenshot2.png)

## Why North?

<!-- Showcasing North's precise editing capabilities! -->
**99.3% edit success rate.** North's deterministic edit tools with exact-match verification mean edits land correctly the first time. No fuzzy matching, no silent failures.

**One-shots production-ready code.** Complex React components, full API endpoints, beautiful landing pages—North builds them in a single pass. The kind of output that takes other tools 10+ iterations.

**Direct API access.** You bring your own Anthropic key. No middleman pricing, no usage caps, no "you've hit your daily limit." Pay only for what you use at Anthropic's rates.

**200K context that manages itself.** Auto-summarization kicks in at 92% context usage, compressing conversation history into structured summaries. No manual context pruning, no "start a new chat" interruptions.

**Terminal-native speed.** No Electron overhead, no browser tabs, no VS Code plugin lifecycle. North launches instantly and runs lean.

### North vs Claude Code vs Cursor

| | North | Claude Code | Cursor |
|---|---|---|---|
| **Pricing** | Direct API (pay-per-use) | $20/mo subscription | $20/mo + usage caps |
| **Context** | 200K auto-managed | Limited by subscription | Aggressive truncation |
| **Environment** | Any terminal | Web browser | VS Code fork only |
| **Control** | Approve every edit/command | Auto-applies changes | Mixed permissions |
| **Speed** | Instant launch, native | Browser latency | Electron overhead |
| **Transparency** | Full diff review | Black box | Partial visibility |

## Features

### Two Modes, Zero Friction

- **Ask Mode** (`Tab` to toggle): Read-only exploration. Claude can search, read files, and analyze—but can't modify anything. Perfect for understanding unfamiliar codebases.
- **Agent Mode**: Full access to edit and shell tools. Claude proposes, you approve.

### Intelligent Approvals

Every file edit shows an inline diff before writing. Every shell command requires explicit permission. You stay in control.

```
┌─ Editing src/components/Button.tsx ─────────────────────┐
│  - export const Button = ({ label }) => (               │
│  + export const Button = ({ label, variant = "primary" }) => ( │
│      <button className={styles.button}>                 │
│  +     <span className={`badge ${variant}`} />          │
│        {label}                                          │
│      </button>                                          │
│    );                                                   │
├─────────────────────────────────────────────────────────┤
│  [a] Accept  [y] Always  [r] Reject                     │
└─────────────────────────────────────────────────────────┘
```

Press `y` once to auto-accept all future edits in a session. Or build a shell command allowlist so trusted operations (`bun test`, `npm run build`) run without prompts.

### Model Switching

Switch between Claude models on the fly:

```
/model opus-4.5    # Switch to Opus 4.5
/model sonnet-4    # Switch to Sonnet 4 (default)
/model haiku-4.5   # Switch to Haiku 4.5 for speed
```

Available models: Sonnet 4, Opus 4, Opus 4.1, Sonnet 4.5, Haiku 4.5, Opus 4.5

### Cursor Rules Compatible

Drop your `.cursor/rules/*.mdc` files in and North automatically loads them. Same project context, different interface.

### Slash Commands

| Command | Description |
|---------|-------------|
| `/model [name]` | Switch Claude model |
| `/mode [ask\|agent]` | Switch conversation mode |
| `/summarize` | Compress conversation history |
| `/new` | Start fresh conversation |
| `/help` | List all commands |
| `/quit` | Exit North |

## Install

Requires [Bun](https://bun.sh) and an Anthropic API key.

```bash
git clone https://github.com/timanthonyalexander/north.git
cd north
bun install
```

Set your API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Run:

```bash
bun run dev
```

Point at any repo:

```bash
bun run dev --path /path/to/repo
```

## Build

For local linking:

```bash
bun run build      # builds to dist/
bun run link       # makes 'north' command available globally
```

For standalone binaries (zero dependencies, ship anywhere):

```bash
bun run build:binary              # current platform
bun run build:binary:mac-arm      # Apple Silicon
bun run build:binary:mac-x64      # Intel Mac
bun run build:binary:linux        # Linux x64
```

## Input

`Enter` sends your message. `Shift+Enter` or `Ctrl+J` adds a newline. `Tab` cycles modes (when not autocompleting).

## Tools

**Read/search (auto-approved):**
`list_root`, `find_files`, `search_text`, `read_file`, `read_readme`, `detect_languages`, `hotfiles`

**Edit (requires approval):**
`edit_replace_exact`, `edit_insert_at_line`, `edit_create_file`, `edit_apply_batch`

**Shell (requires approval):**
`shell_run`

All tools respect `.gitignore`. Output is automatically truncated to prevent context overflow.

## Storage

Project config lives in `.north/` at your repo root:
- `allowlist.json` — pre-approved shell commands
- `autoaccept.json` — auto-accept edit settings

Logs: `~/.local/state/north/north.log` (JSON-lines format)

## Troubleshooting

**Search is slow?** Install ripgrep: `brew install ripgrep` or `apt install ripgrep`

**Edit tool fails?** It requires exact text matches including whitespace. Claude will re-read and retry—usually self-corrects.

**Command hangs?** There's a 60s timeout. The shell session recreates automatically.

## Development

```bash
bun run dev                    # run
bun run dev --log-level debug  # verbose logging
bun run build                  # build JS
bun run typecheck              # type check
bun run check                  # all checks (typecheck + lint + format)
```

Architecture: [docs/implementation.md](docs/implementation.md)

## Privacy

Logs record events and metadata (tool names, durations, token counts) but not file contents or prompts. Your messages go directly to Anthropic's API—no intermediary servers, no data collection.

---

**North.** Vibe coding peak.
