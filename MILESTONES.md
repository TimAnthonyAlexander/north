# North Milestones (v0)

Each milestone must be shippable. Do not start the next milestone until the current one meets acceptance criteria.

## Milestone 1: Chat UI + streaming

### Goal
A working Ink TUI that supports multiline input and streams model output.

### Scope
- Ink UI shell:
  - transcript view
  - composer (multiline input)
  - status line (model name, current project path)
- Anthropic streaming integration
- Orchestrator basic loop: user message -> model stream -> append to transcript

### Acceptance criteria
- Enter sends message.
- Shift+Enter inserts newline.
- Assistant streams continuously and does not freeze UI.
- Transcript shows:
  - user message
  - assistant message (streamed)
- App exits cleanly with Ctrl+C.
- Logging creates the log file and records:
  - start event
  - user prompt event
  - model request event
  - model response completion event

### Out of scope
- Tools
- Approvals
- Edits
- PTY

---

## Milestone 2: Read/search tools (no side effects)

### Goal
The model can navigate and read the repo using tools and answer questions about the codebase.

### Scope
Implement these tools:
- list_root
- find_files
- search_text
- read_file
- read_readme
- detect_languages
- hotfiles (basic heuristic)

UI:
- Tool intent lines in transcript
- Compact display of tool results

### Acceptance criteria
- The model can:
  - find a file by name
  - search for a symbol/string
  - read a file range
  - summarize the README
  - describe repo composition (languages, rough layout)
- Tools respect .gitignore where applicable.
- Large outputs are truncated sensibly and do not flood the UI.
- Tool failures are surfaced clearly and are recoverable.

### Out of scope
- File writes
- Diffs
- PTY

---

## Milestone 3: Deterministic edits + inline diff review

### Goal
Safe and reviewable file changes.

### Scope
Implement write tools:
- edit_replace_exact
- edit_insert_at_line
- edit_create_file
- edit_apply_batch

Implement diff generation and inline diff viewer.

Approval:
- Accept or Reject for diffs

### Acceptance criteria
- Any write tool call produces a diff preview before applying.
- Reject means no file changes occur.
- Accept applies changes atomically for the batch.
- Exact replace fails fast if anchor not found and returns an actionable error.
- Diff viewer is readable and stable for typical code files.

### Out of scope
- Partial hunk acceptance
- Fuzzy matching
- Complex refactors with AST edits

---

## Milestone 4: Persistent PTY shell + approvals

### Goal
The assistant can run shell commands in a persistent session with user approvals and per-project allowlist.

### Scope
- One persistent PTY session per project
- shell_run tool
- Approval prompt:
  - Run this time
  - Always execute
  - Deny
- Per-project allowlist persistence

### Acceptance criteria
- Running `cd` changes working dir inside the PTY for subsequent commands.
- Run this time re-prompts next time.
- Always execute persists rule and stops prompting for that command in this project.
- Deny returns a denied tool result to the model.
- Outputs are captured and returned reliably.

---

## Milestone 5: Memory + project card cache polish

### Goal
Make the assistant feel grounded and consistent without heavy indexing.

### Scope
- Project card cache stored in `.north/cache.json`
- Global memory store and per-project memory store
- Lightweight conversation summarization when context grows

### Acceptance criteria
- Project card is computed once and reused.
- Global memory is loaded on startup.
- Project memory is loaded when in that project.
- Memory is only written when explicitly requested by the user (or when "Always execute" adds allowlist entries).

---

## Milestone 6: UX polish

### Goal
Make it pleasant and predictable.

### Scope
- Slash commands: /help /clear /memory /allowlist /model
- Better tool result formatting
- Better error surfaces
- Small quality-of-life behaviors

### Acceptance criteria
- No confusing UI states.
- Errors are actionable.
- The app feels stable during long streaming sessions.


