# North

**Vibe coding peak.**

A Claude-powered terminal assistant for codebases.

![North in action](screenshot.png)

## What is North?

North is a CLI for pair programming with Claude. You chat in your terminal, Claude reads your codebase and proposes changes, and you approve or reject everything before it happens. Lowkey the best way to code with AI. It hits different.

All file edits are shown as diffs before writing. All shell commands require permission. Claude proposes, you decide. No cap. You stay in control, AI does the heavy lifting.

## Install

Requires [Bun](https://bun.sh) and an Anthropic API key. Fr.

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

Or point at a specific repo (works anywhere tbh):

```bash
bun run dev --path /path/to/repo
```

## Build for Distribution

For local linking (recommended for development):

```bash
bun run build      # builds JS to dist/
bun run link       # makes 'north' command available globally
```

For standalone binaries:

```bash
bun run build:binary              # current platform
bun run build:binary:mac-arm      # Apple Silicon
bun run build:binary:mac-x64      # Intel Mac
bun run build:binary:linux        # Linux x64
```

The compiled binary is completely self-contained with no external dependencies. Ship it anywhere and it just works.

## Input

`Enter` sends your message. `Shift+Enter` or `Ctrl+J` inserts a newline. Pretty straightforward, ngl.

## Approvals

### File Edits

When Claude wants to change files, you see an inline diff. Press `a` to accept, `r` to reject. Nothing writes until you accept. You're in control, king.

### Shell Commands

When Claude wants to run a command, you get three choices:

- `r` (run) — execute once, ask again next time
- `a` (always) — add to allowlist, auto-approve identical commands in this project (living in 2025 fr)
- `d` (deny) — block it, Claude gets told the command was denied

The allowlist lives at `.north/allowlist.json`:

```json
{
  "allowedCommands": ["bun test", "npm run build"]
}
```

Exact string matching only.

## Tools

Claude has access to:

**Read/search (no approval):** `list_root`, `find_files`, `search_text`, `read_file`, `read_readme`, `detect_languages`, `hotfiles`

**Edit (requires approval):** `edit_replace_exact`, `edit_insert_at_line`, `edit_create_file`, `edit_apply_batch`

**Shell (requires approval):** `shell_run` (persistent PTY session)

All tools respect `.gitignore`. Output is truncated to prevent context overflow. It just works.

## Storage

Project-local config goes in `.north/` at your repo root. Currently just `allowlist.json`. Clean and simple.

Logs are at `~/.local/state/north/north.log` (JSON-lines, append-only). Tbh you probably won't need to look at these.

## Troubleshooting

**Search is slow:** Install ripgrep (`brew install ripgrep` or `apt install ripgrep`). Trust, it makes everything bussin.

**Edit tool fails:** It requires exact text matches including whitespace. Claude will re-read the file and retry. Usually fixes itself.

**Command hangs:** There's a timeout. The PTY session gets recreated if a command times out. North understood the assignment.

## Development

```bash
bun run dev                    # run
bun run dev --log-level debug  # verbose logging
bun run build                  # build JS
bun run typecheck              # type check
```

Architecture details are in `docs/implementation.md`.

## Privacy

Logs record events and metadata (tool names, durations, prompt lengths) but not file contents or exact prompts. Your prompts and tool results go to Anthropic's API. Keeping it transparent, as it should be.

