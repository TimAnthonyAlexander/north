import { existsSync } from "node:fs";
import { join } from "node:path";
import { initLogger, type Logger, type LogLevel } from "../logging/index";
import { detectRepoRoot } from "../utils/repo";
import { PROTOCOL_VERSION, parseClientMessage, type ServerToClientMessage } from "./protocol";
import { generateAuthToken, isAllowedOrigin } from "./security";
import { SessionManager } from "./sessionManager";
import { disposeAllShellServices } from "../shell/index";

export interface WebServerOptions {
    port?: number;
    logLevel?: LogLevel;
    reviewTimeoutMs?: number;
    devProxyOrigin?: string;
    allowedOrigins?: string[];
}

function json(ws: { send: (data: string | Uint8Array) => void }, msg: ServerToClientMessage): void {
    ws.send(JSON.stringify(msg));
}

function getContentType(pathname: string): string {
    if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
    if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
    if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".svg")) return "image/svg+xml";
    return "application/octet-stream";
}

function renderIndexHtml(token: string): string {
    const tokenScript = `window.__NORTH_TOKEN__=${JSON.stringify(token)};`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>North Cockpit</title>
  </head>
  <body>
    <div id="root"></div>
    <script>${tokenScript}</script>
    <script type="module" src="/dist/index.js"></script>
  </body>
</html>`;
}

export async function startWebServer(options: WebServerOptions = {}): Promise<{
    port: number;
    cockpitUrl: string;
    cockpitUrlWithToken: string;
    token: string;
    repoRoot: string;
    logger: Logger;
    stop: () => void;
}> {
    const port = options.port ?? 7331;
    const repoRoot = detectRepoRoot(process.cwd());
    const logger = initLogger({ projectPath: repoRoot, logLevel: options.logLevel ?? "info" });
    const token = generateAuthToken();
    const reviewTimeoutMs = options.reviewTimeoutMs ?? 5 * 60 * 1000;

    const devProxyOrigin = options.devProxyOrigin ?? process.env.NORTH_WEB_DEV_PROXY;
    const extraAllowedOrigins = new Set<string>();
    for (const o of options.allowedOrigins ?? []) {
        if (typeof o === "string" && o.startsWith("http://")) extraAllowedOrigins.add(o);
    }
    const envOrigins = process.env.NORTH_WEB_ALLOWED_ORIGINS;
    if (envOrigins) {
        for (const o of envOrigins.split(",").map((s) => s.trim()).filter(Boolean)) {
            if (o.startsWith("http://")) extraAllowedOrigins.add(o);
        }
    }
    if (devProxyOrigin) {
        try {
            extraAllowedOrigins.add(new URL(devProxyOrigin).origin);
        } catch {
            // ignore invalid dev proxy origin
        }
    }
    const distRoot = join(repoRoot, "web", "dist");
    const bundlePath = join(distRoot, "index.js");

    if (!devProxyOrigin && existsSync(bundlePath)) {
        try {
            const bundleText = await Bun.file(bundlePath).text();
            const looksLikeCockpitBuild = bundleText.toLowerCase().includes("cockpit");
            if (!looksLikeCockpitBuild) {
                console.warn(
                    `[north web] Warning: ${bundlePath} does not appear to include the cockpit route. ` +
                        `If you just updated the cockpit UI, rebuild it with: (cd web && bun run build)`
                );
            }
        } catch {
            // ignore
        }
    }

    type WSData = {
        authed: boolean;
        sessionManager: SessionManager | null;
        sessionIds: Set<string>;
    };

    const server = Bun.serve<WSData>({
        hostname: "127.0.0.1",
        port,
        async fetch(req, srv) {
            const url = new URL(req.url);

            if (url.pathname === "/ws") {
                const origin = req.headers.get("origin");
                const currentPort = srv.port ?? port;
                if (!isAllowedOrigin(origin, currentPort, [...extraAllowedOrigins])) {
                    return new Response("Forbidden (bad origin)", { status: 403 });
                }
                const upgraded = srv.upgrade(req, {
                    data: {
                        authed: false,
                        sessionManager: null,
                        sessionIds: new Set<string>(),
                    },
                });
                return upgraded ? new Response(null) : new Response("Upgrade failed", { status: 400 });
            }

            if (devProxyOrigin) {
                const target = new URL(devProxyOrigin);
                target.pathname = url.pathname;
                target.search = url.search;

                const proxyReq = new Request(target.toString(), req);
                const res = await fetch(proxyReq);
                return res;
            }

            if (url.pathname === "/dist/index.js") {
                const filePath = bundlePath;
                if (!existsSync(filePath)) {
                    return new Response("Missing web bundle. Build web/ first.", { status: 404 });
                }
                return new Response(Bun.file(filePath), {
                    headers: {
                        "Content-Type": getContentType(filePath),
                        "Cache-Control": "no-store",
                    },
                });
            }

            // SPA fallback for / and /cockpit (and any other route).
            return new Response(renderIndexHtml(token), {
                headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
            });
        },
        websocket: {
            open(ws) {
                // noop until hello
            },
            message(ws, message) {
                const raw = typeof message === "string" ? message : Buffer.from(message).toString("utf-8");
                const parsed = parseClientMessage(raw);
                if (!parsed.ok) {
                    json(ws, { type: "error", message: parsed.error });
                    return;
                }

                const data = ws.data;

                if (!data.authed) {
                    if (parsed.message.type !== "hello") {
                        ws.close(1008, "Unauthorized");
                        return;
                    }
                    if (parsed.message.token !== token) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }
                    data.authed = true;
                    data.sessionManager = new SessionManager(
                        { allowedRepoRoot: repoRoot, logger, reviewTimeoutMs },
                        (msg) => json(ws, msg as ServerToClientMessage)
                    );
                    json(ws, { type: "ready", protocolVersion: PROTOCOL_VERSION });
                    return;
                }

                const sm = data.sessionManager;
                if (!sm) {
                    json(ws, { type: "error", message: "Session manager unavailable" });
                    return;
                }

                (async () => {
                    switch (parsed.message.type) {
                        case "session.create": {
                            const created = await sm.createSession(parsed.message);
                            if (!created.ok) {
                                json(ws, { type: "error", message: created.error });
                                return;
                            }
                            data.sessionIds.add(created.sessionId);
                            json(ws, {
                                type: "session.created",
                                sessionId: created.sessionId,
                                state: created.state,
                            });
                            return;
                        }
                        case "chat.send": {
                            const res = await sm.chatSend(parsed.message);
                            if (!res.ok) {
                                json(ws, { type: "error", sessionId: parsed.message.sessionId, message: res.error });
                            }
                            return;
                        }
                        case "review.resolve": {
                            const res = sm.resolveReview(parsed.message);
                            if (!res.ok) {
                                json(ws, { type: "error", sessionId: parsed.message.sessionId, message: res.error });
                            }
                            return;
                        }
                        case "learning.start": {
                            const res = await sm.startLearning(parsed.message.sessionId);
                            if (!res.ok) {
                                json(ws, { type: "error", sessionId: parsed.message.sessionId, message: res.error });
                            }
                            return;
                        }
                        case "session.cancel": {
                            const res = sm.cancel(parsed.message.sessionId);
                            if (!res.ok) {
                                json(ws, { type: "error", sessionId: parsed.message.sessionId, message: res.error });
                            }
                            return;
                        }
                        case "session.stop": {
                            const res = sm.stop(parsed.message.sessionId);
                            if (!res.ok) {
                                json(ws, { type: "error", sessionId: parsed.message.sessionId, message: res.error });
                            }
                            data.sessionIds.delete(parsed.message.sessionId);
                            return;
                        }
                        case "hello":
                            json(ws, { type: "error", message: "Already authenticated" });
                            return;
                    }
                })().catch((err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    json(ws, { type: "error", message: msg });
                });
            },
            close(ws) {
                const data = ws.data;
                if (data?.sessionManager) {
                    data.sessionManager.closeAllSessions();
                }
            },
        },
    });

    const boundPort = server.port ?? port;
    const cockpitUrl = `http://127.0.0.1:${boundPort}/cockpit`;
    const cockpitUrlWithToken = `${cockpitUrl}?token=${encodeURIComponent(token)}`;

    const stop = () => {
        server.stop(true);
        disposeAllShellServices();
    };

    return { port: boundPort, cockpitUrl, cockpitUrlWithToken, token, repoRoot, logger, stop };
}
