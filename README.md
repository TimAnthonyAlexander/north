# North

A Claude-powered terminal assistant for codebases.

![North in action](screenshot.png)

## What is North?

North is a CLI for pair programming with Claude. You chat in your terminal, Claude can read your codebase and propose changes, and you approve or reject everything before it happens.

All file edits are shown as diffs before writing. All shell commands require permission. Claude proposes, you decide.

## Install

Requires [Bun](https://bun.sh) and an Anthropic API key.

```bash
git clone https://github.com/yourusername/north.git
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

Or point at a specific repo:

```bash
bun run dev --path /path/to/repo
```

## Build a Binary

```bash
bun run build:binary              # current platform
bun run build:binary:mac-arm      # Apple Silicon
bun run build:binary:mac-x64      # Intel Mac
bun run build:binary:linux        # Linux x64
```

## Input

`Enter` sends your message. `Shift+Enter` or `Ctrl+J` inserts a newline.

## Approvals

### File Edits

When Claude wants to change files, you see an inline diff. Press `a` to accept, `r` to reject. Nothing writes until you accept.

### Shell Commands

When Claude wants to run a command, you get three choices:

- `r` (run) — execute once, ask again next time
- `a` (always) — add to allowlist, auto-approve identical commands in this project
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

All tools respect `.gitignore`. Output is truncated to prevent context overflow.

## Storage

Project-local config goes in `.north/` at your repo root. Currently just `allowlist.json`.

Logs are at `~/.local/state/north/north.log` (JSON-lines, append-only).

## Troubleshooting

**Search is slow:** Install ripgrep (`brew install ripgrep` or `apt install ripgrep`).

**Edit tool fails:** It requires exact text matches including whitespace. Claude will re-read the file and retry.

**Command hangs:** There's a timeout. The PTY session gets recreated if a command times out.

## Development

```bash
bun run dev                    # run
bun run dev --log-level debug  # verbose logging
bun run build                  # build JS
bun run typecheck              # type check
```

Architecture details are in `docs/implementation.md`.

## Privacy

Logs record events and metadata (tool names, durations, prompt lengths) but not file contents or exact prompts. Your prompts and tool results go to Anthropic's API.

## Status

Milestones 1–4 complete: chat, streaming, read/search tools, deterministic edits with diff review, persistent PTY with shell approvals.

Planned: memory/cache system, slash commands, UX polish.

## License

MIT
