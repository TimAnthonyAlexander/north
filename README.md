# North (project codename)

North is a Claude-only, Bun-compiled, self-contained CLI for macOS and Linux.

It is a "chat + tools" terminal app:
- Minimal UI (Ink) with a strong diff review experience
- Persistent PTY shell session
- Deterministic file edits (the host applies edits, never the LLM)
- Lightweight repo context (readme, root tree, language composition, hotfiles)
- Simple local tool registry (future MCP compatibility, but not implemented now)

This repository is intentionally spec-driven: the dev should treat the docs as the source of truth.

## Principles (non-negotiable)

- KISS: fewer moving parts, fewer abstractions, fewer dependencies.
- Determinism: file edits and shell execution are always mediated by the host.
- Review-first: file edits always produce an inline diff and require user approval.
- Streaming: model output streams into the UI.
- Mac and Linux first. Everything else is optional.
- Trust model: local machine is trusted. No sandboxing for v0.
- No plugin system for v0. Tools are a simple registry in-process.

## Non-goals (v0)

- MCP support
- Multiple model providers
- Advanced indexing (full symbol graphs, embeddings, LSP integration)
- Multi-pane UI layouts
- Remote agents or multi-user sessions
- Background daemons

## How to read the docs

Start with:
1) docs/SPEC.md
2) docs/MILESTONES.md

If something is not specified, default to:
- The simplest approach that still meets acceptance criteria
- Deterministic behavior over "smart" behavior
- Fewer files and fewer dependencies

## Terminology

- Host: the North application (this repo)
- Model: Claude Sonnet 4.5 (via Anthropic API)
- Tool: a host-exposed capability the model may call
- Approval: a user decision that gates side effects (shell and writes)
- Project: a repo root (detected from current working directory or CLI arg)
- Project card: the lightweight cached context summary for a project

## Deliverable expectations

- Each milestone is shippable and stable.
- Logging is always on (local log file).
- When a tool fails, errors must be actionable and lead to recovery (read more context, retry).


