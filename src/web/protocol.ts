export const PROTOCOL_VERSION = 1 as const;

export type Mode = "ask" | "agent";

export type ClientToServerMessage =
    | {
          type: "hello";
          token: string;
          protocolVersion: number;
      }
    | {
          type: "session.create";
          repoRoot?: string;
          conversationId?: string;
          initialState?: unknown;
      }
    | {
          type: "chat.send";
          sessionId: string;
          content: string;
          mode: Mode;
          attachedFiles?: string[];
      }
    | {
          type: "review.resolve";
          sessionId: string;
          reviewId: string;
          kind: "write" | "shell" | "command" | "learning";
          decision: unknown;
      }
    | {
          type: "learning.start";
          sessionId: string;
      }
    | {
          type: "session.cancel";
          sessionId: string;
      }
    | {
          type: "session.stop";
          sessionId: string;
      };

export type ServerToClientMessage =
    | {
          type: "ready";
          protocolVersion: number;
      }
    | {
          type: "session.created";
          sessionId: string;
          state: unknown;
      }
    | {
          type: "state";
          sessionId: string;
          state: unknown;
      }
    | {
          type: "error";
          sessionId?: string;
          message: string;
      };

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isMode(value: unknown): value is Mode {
    return value === "ask" || value === "agent";
}

export type ParseResult =
    | { ok: true; message: ClientToServerMessage }
    | { ok: false; error: string };

export function parseClientMessage(raw: string): ParseResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, error: "Invalid JSON" };
    }

    if (!isObject(parsed) || !isString(parsed.type)) {
        return { ok: false, error: "Invalid message envelope" };
    }

    switch (parsed.type) {
        case "hello": {
            if (!isString(parsed.token)) return { ok: false, error: "hello.token must be string" };
            const pv = parsed.protocolVersion;
            if (typeof pv !== "number") {
                return { ok: false, error: "hello.protocolVersion must be number" };
            }
            return { ok: true, message: { type: "hello", token: parsed.token, protocolVersion: pv } };
        }
        case "session.create": {
            const repoRoot = parsed.repoRoot;
            const conversationId = parsed.conversationId;
            if (repoRoot !== undefined && !isString(repoRoot)) {
                return { ok: false, error: "session.create.repoRoot must be string" };
            }
            if (conversationId !== undefined && !isString(conversationId)) {
                return { ok: false, error: "session.create.conversationId must be string" };
            }
            return {
                ok: true,
                message: {
                    type: "session.create",
                    repoRoot: repoRoot as string | undefined,
                    conversationId: conversationId as string | undefined,
                    initialState: parsed.initialState,
                },
            };
        }
        case "chat.send": {
            if (!isString(parsed.sessionId)) {
                return { ok: false, error: "chat.send.sessionId must be string" };
            }
            if (!isString(parsed.content)) return { ok: false, error: "chat.send.content must be string" };
            if (!isMode(parsed.mode)) return { ok: false, error: "chat.send.mode must be ask|agent" };
            const attachedFiles = parsed.attachedFiles;
            if (
                attachedFiles !== undefined &&
                (!Array.isArray(attachedFiles) || attachedFiles.some((p) => !isString(p)))
            ) {
                return { ok: false, error: "chat.send.attachedFiles must be string[]" };
            }
            return {
                ok: true,
                message: {
                    type: "chat.send",
                    sessionId: parsed.sessionId,
                    content: parsed.content,
                    mode: parsed.mode,
                    attachedFiles: attachedFiles as string[] | undefined,
                },
            };
        }
        case "review.resolve": {
            if (!isString(parsed.sessionId)) {
                return { ok: false, error: "review.resolve.sessionId must be string" };
            }
            if (!isString(parsed.reviewId)) {
                return { ok: false, error: "review.resolve.reviewId must be string" };
            }
            const kind = parsed.kind;
            if (kind !== "write" && kind !== "shell" && kind !== "command" && kind !== "learning") {
                return { ok: false, error: "review.resolve.kind must be write|shell|command|learning" };
            }
            return {
                ok: true,
                message: {
                    type: "review.resolve",
                    sessionId: parsed.sessionId,
                    reviewId: parsed.reviewId,
                    kind,
                    decision: parsed.decision,
                },
            };
        }
        case "learning.start": {
            if (!isString(parsed.sessionId)) {
                return { ok: false, error: "learning.start.sessionId must be string" };
            }
            return { ok: true, message: { type: "learning.start", sessionId: parsed.sessionId } };
        }
        case "session.cancel": {
            if (!isString(parsed.sessionId)) {
                return { ok: false, error: "session.cancel.sessionId must be string" };
            }
            return { ok: true, message: { type: "session.cancel", sessionId: parsed.sessionId } };
        }
        case "session.stop": {
            if (!isString(parsed.sessionId)) {
                return { ok: false, error: "session.stop.sessionId must be string" };
            }
            return { ok: true, message: { type: "session.stop", sessionId: parsed.sessionId } };
        }
        default:
            return { ok: false, error: `Unknown message type: ${parsed.type}` };
    }
}

