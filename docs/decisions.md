# North Decisions (ADR-lite)

This file records decisions that should not drift. If something changes, add a new entry. Do not rewrite history.

Format:
- Date (YYYY-MM-DD)
- Decision
- Rationale
- Consequences

---

## 2025-12-08: Bun as runtime and packaging

Decision:
- Use Bun as the runtime and build system.
- Ship as a self-contained binary for macOS and Linux.

Rationale:
- Faster startup and distribution as a single artifact.
- Avoid Node installation friction.
- Aligns with the "CLI as product" expectation.

Consequences:
- Dependencies must be compatible with Bun.
- CI needs to build per target platform (macOS, Linux).
- No Node-only assumptions in scripts or tooling.

---

## 2025-12-08: TypeScript only (no mixed-language core)

Decision:
- The core application is TypeScript only.
- No Rust/Go helper binaries for v0.

Rationale:
- Reduce complexity and coordination overhead.
- Keep the codebase easy for LLMs to reason about and edit.
- Minimize build chain and cross-platform glue.

Consequences:
- PTY and filesystem logic must be implemented with TS-compatible libraries.
- Performance optimizations must stay within TS/Bun constraints.

---

## 2025-12-08: Ink (React) for the TUI

Decision:
- Use Ink for terminal rendering.

Rationale:
- Ink is widely known and documented.
- React mental model accelerates development and maintenance.
- Easier for LLMs to assist with UI work.

Consequences:
- UI must remain minimal to avoid complex state management.
- Avoid overbuilding panes, trees, or mouse-heavy interaction in v0.

---

## 2025-12-08: Minimal UI, but inline diffs are mandatory

Decision:
- The UI is primarily a conversational transcript with a multiline composer.
- Inline diff review is non-negotiable for any file changes.

Rationale:
- Most value comes from conversation and correct edits.
- Diff review is the safety mechanism and trust builder.

Consequences:
- Diff generation and rendering must be stable early (Milestone 3).
- No file writes without a diff preview and explicit user approval.

---

## 2025-12-08: Deterministic edit tools (no free-form edits)

Decision:
- The model never edits files directly.
- The host exposes deterministic edit operations (exact replace, insert at line, create file, batch apply).
- No fuzzy matching in v0.

Rationale:
- Reliability and correctness beat convenience.
- Exact operations make failures clear and recoverable: read more context, retry.
- Avoid the "LLM produced a broken patch" failure mode.

Consequences:
- The model must use read tools to gather correct anchors.
- Tools must return actionable errors when validation fails.
- The orchestrator must support retry loops naturally.

---

## 2025-12-08: Persistent PTY shell session

Decision:
- Shell execution runs inside a single persistent PTY session per project.

Rationale:
- Preserves state (cwd, env, shell session context).
- Matches user expectations for iterative workflows.

Consequences:
- Requires a robust PTY integration for macOS and Linux.
- Output capture must be reliable and not freeze the UI.

---

## 2025-12-08: Shell commands require approval with allowlist

Decision:
- Every shell command requires approval unless allowlisted.
- Approval options:
  - Run this time
  - Always execute (persist exact command string in per-project allowlist)
  - Deny

Rationale:
- Prevent accidental destructive commands.
- Reduce repeated prompts with a simple persistence mechanism.
- Keep policy model extremely simple (exact string match).

Consequences:
- UI needs a clean approval prompt.
- Allowlist storage must be stable and human-readable.
- Denials must be returned to the model as structured tool results.

---

## 2025-12-08: Lightweight context and indexing only

Decision:
- Only lightweight repo context is computed:
  - README excerpt
  - root-level tree
  - language composition
  - hotfiles (git-based heuristic if available)
- Primary navigation is via search tools, not heavy indexing.

Rationale:
- Works for any repo size without large background work.
- Keeps implementation simple and predictable.
- Users can still work naturally without @mentioning files, because search exists.

Consequences:
- Search tools must be solid (Milestone 2).
- Token budgeting must be disciplined (avoid dumping huge files).

---

## 2025-12-08: Memory model (global + per-project)

Decision:
- Maintain:
  - global user memory
  - per-project memory
- Memory is written only when explicitly requested by the user, except allowlist writes from "Always execute".

Rationale:
- Keep behavior predictable and non-creepy.
- Avoid accidental accumulation of wrong assumptions.
- Preserve per-project conventions cleanly.

Consequences:
- Provide a `/memory` view command.
- Memory file formats must remain stable and easy to edit manually.

---

## 2025-12-08: Logging is local, single file

Decision:
- Write append-only logs to a local log file.

Rationale:
- Debuggability without external services.
- Privacy by default.

Consequences:
- Never log API keys.
- Avoid logging full file contents.
- Log tool calls, approvals, errors, and timings.

---

## 2025-12-08: Claude only, default Sonnet 4.5, streaming required

Decision:
- Only Anthropic Claude is supported for v0.
- Default model: Sonnet 4.5.
- Streaming output is required.

Rationale:
- Reduce scope and decision overhead.
- Streaming is part of perceived responsiveness.
- Strong model performance for coding workflows.

Consequences:
- Provider abstraction should be minimal, but clean enough to extend later.
- The UI must handle streaming without flicker or stalls.

---

## 2025-12-08: MCP is a future target, not a v0 feature

Decision:
- Do not implement MCP in v0.
- Keep the tool registry shaped so MCP can be added later as an adapter.

Rationale:
- MCP would add scope and integration complexity.
- A clean tool interface now makes future MCP straightforward.

Consequences:
- Tool schemas and results must be strict structured JSON.
- Avoid tool designs that rely on hidden side channels.

---

## 2025-12-08: Ctrl+J as reliable newline binding

Decision:
- Use Ctrl+J as the primary multiline input mechanism.
- Keep Shift+Enter as a fallback where terminals support it.

Rationale:
- Shift+Enter is not reliably detectable across terminals (key codes vary by platform and terminal emulator).
- Ctrl+J sends a distinct, universal key sequence (ASCII linefeed).
- Users need a guaranteed way to insert newlines in the composer.

Consequences:
- Placeholder text advertises Ctrl+J, not Shift+Enter.
- Both bindings work, but Ctrl+J is the documented method.

---

## 2025-12-08: Throttled streaming updates

Decision:
- Throttle UI updates during streaming to ~32ms intervals.
- Buffer incoming chunks and flush on throttle tick or stream completion.

Rationale:
- Calling setState on every chunk (potentially hundreds per second) causes unnecessary re-renders.
- Throttling reduces CPU load and prevents UI flicker on fast streams.
- 32ms (~30fps) is visually smooth and efficient.

Consequences:
- Final content is always exact (flush on complete).
- Streaming feels smooth without lag.


