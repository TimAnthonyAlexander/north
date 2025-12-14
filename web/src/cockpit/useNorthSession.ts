import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "ask" | "agent";

type ClientToServerMessage =
    | { type: "hello"; token: string; protocolVersion: number }
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
    | { type: "learning.start"; sessionId: string }
    | { type: "session.cancel"; sessionId: string }
    | { type: "session.stop"; sessionId: string };

type ServerToClientMessage =
    | { type: "ready"; protocolVersion: number }
    | { type: "session.created"; sessionId: string; state: unknown }
    | { type: "state"; sessionId: string; state: unknown }
    | { type: "error"; sessionId?: string; message: string };

function getTokenFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
}

function getTokenFromInjectedGlobal(): string | null {
    const token = (window as unknown as { __NORTH_TOKEN__?: unknown }).__NORTH_TOKEN__;
    return typeof token === "string" ? token : null;
}

function parseServerMessage(raw: string): ServerToClientMessage | null {
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return null;
        if (typeof (data as any).type !== "string") return null;
        return data as ServerToClientMessage;
    } catch {
        return null;
    }
}

export interface NorthSessionState {
    wsStatus: "disconnected" | "connecting" | "connected" | "ready";
    protocolVersion: number | null;
    sessionId: string | null;
    state: unknown;
    error: string | null;
}

export interface UseNorthSessionOptions {
    protocolVersion?: number;
    wsPath?: string;
}

export function useNorthSession(options: UseNorthSessionOptions = {}) {
    const protocolVersion = options.protocolVersion ?? 1;
    const wsPath = options.wsPath ?? "/ws";

    const [wsStatus, setWsStatus] = useState<NorthSessionState["wsStatus"]>("disconnected");
    const [readyVersion, setReadyVersion] = useState<number | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [state, setState] = useState<unknown>(null);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const pendingSendQueueRef = useRef<ClientToServerMessage[]>([]);

    const token = useMemo(() => getTokenFromUrl() || getTokenFromInjectedGlobal(), []);

    const send = useCallback((msg: ClientToServerMessage) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            pendingSendQueueRef.current.push(msg);
            return;
        }
        ws.send(JSON.stringify(msg));
    }, []);

    const flushQueue = useCallback(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const queued = pendingSendQueueRef.current.splice(0);
        for (const msg of queued) {
            ws.send(JSON.stringify(msg));
        }
    }, []);

    useEffect(() => {
        if (!token) {
            setError("Missing token. Start `north web` and open the printed URL.");
            return;
        }

        setWsStatus("connecting");
        setError(null);

        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${scheme}//${window.location.host}${wsPath}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setWsStatus("connected");
            send({ type: "hello", token, protocolVersion });
            flushQueue();
        };

        ws.onmessage = (ev) => {
            const msg = parseServerMessage(String(ev.data));
            if (!msg) return;

            if (msg.type === "ready") {
                setReadyVersion(msg.protocolVersion);
                setWsStatus("ready");
                send({ type: "session.create" });
                return;
            }

            if (msg.type === "session.created") {
                setSessionId(msg.sessionId);
                setState(msg.state);
                return;
            }

            if (msg.type === "state") {
                setState(msg.state);
                return;
            }

            if (msg.type === "error") {
                setError(msg.message);
                return;
            }
        };

        ws.onerror = () => {
            setError("WebSocket error");
        };

        ws.onclose = () => {
            setWsStatus("disconnected");
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, wsPath]);

    const actions = useMemo(() => {
        return {
            sendChat: (content: string, mode: Mode, attachedFiles: string[] = []) => {
                if (!sessionId) return;
                send({ type: "chat.send", sessionId, content, mode, attachedFiles });
            },
            resolveReview: (
                reviewId: string,
                kind: "write" | "shell" | "command" | "learning",
                decision: unknown
            ) => {
                if (!sessionId) return;
                send({ type: "review.resolve", sessionId, reviewId, kind, decision });
            },
            startLearning: () => {
                if (!sessionId) return;
                send({ type: "learning.start", sessionId });
            },
            cancel: () => {
                if (!sessionId) return;
                send({ type: "session.cancel", sessionId });
            },
            stop: () => {
                if (!sessionId) return;
                send({ type: "session.stop", sessionId });
            },
        };
    }, [send, sessionId]);

    return {
        state: {
            wsStatus,
            protocolVersion: readyVersion,
            sessionId,
            state,
            error,
        } satisfies NorthSessionState,
        token,
        actions,
    };
}

