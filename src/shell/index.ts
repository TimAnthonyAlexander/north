import { spawn, type IPty } from "bun-pty";
import type { Logger } from "../logging/index";

export interface ShellRunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
}

interface PendingCommand {
    id: string;
    startTime: number;
    resolve: (result: ShellRunResult) => void;
    reject: (error: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
}

interface PtySession {
    pty: IPty;
    buffer: string;
    pending: PendingCommand | null;
    disposed: boolean;
}

const START_MARKER = "__NORTH_CMD_START_";
const END_MARKER = "__NORTH_CMD_END_";

function generateCommandId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseEndMarker(buffer: string, commandId: string): { found: boolean; exitCode: number; endIndex: number } {
    const endPattern = `\n${END_MARKER}${commandId}_EXIT_`;
    const idx = buffer.indexOf(endPattern);
    if (idx === -1) {
        return { found: false, exitCode: -1, endIndex: -1 };
    }

    const afterMarker = buffer.slice(idx + endPattern.length);
    const exitMatch = afterMarker.match(/^(\d+)_END_\r?\n/);
    if (!exitMatch) {
        return { found: false, exitCode: -1, endIndex: -1 };
    }

    const exitCode = parseInt(exitMatch[1], 10);
    const fullEndLength = endPattern.length + exitMatch[0].length;
    return { found: true, exitCode, endIndex: idx + fullEndLength };
}

function extractOutput(buffer: string, commandId: string, endIndex: number): string {
    const startPattern = `${START_MARKER}${commandId}_START_\n`;
    const startIdx = buffer.indexOf(startPattern);
    if (startIdx === -1) {
        const altPattern = `${START_MARKER}${commandId}_START_\r\n`;
        const altIdx = buffer.indexOf(altPattern);
        if (altIdx === -1) {
            return "";
        }
        const outputStart = altIdx + altPattern.length;
        const endPatternStart = `\n${END_MARKER}${commandId}_EXIT_`;
        const endIdx = buffer.indexOf(endPatternStart, outputStart);
        if (endIdx === -1) {
            return "";
        }
        return buffer.slice(outputStart, endIdx).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
    }

    const outputStart = startIdx + startPattern.length;
    const endPatternStart = `\n${END_MARKER}${commandId}_EXIT_`;
    const endIdx = buffer.indexOf(endPatternStart, outputStart);
    if (endIdx === -1) {
        return "";
    }

    return buffer.slice(outputStart, endIdx).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
}

export interface ShellService {
    run(command: string, options?: { cwd?: string | null; timeoutMs?: number }): Promise<ShellRunResult>;
    dispose(): void;
}

export interface ShellServiceOptions {
    repoRoot: string;
    logger: Logger;
}

export function createShellService(options: ShellServiceOptions): ShellService {
    const { repoRoot, logger } = options;
    let session: PtySession | null = null;

    function destroySession(): void {
        if (session) {
            session.disposed = true;
            if (session.pending) {
                if (session.pending.timeout) {
                    clearTimeout(session.pending.timeout);
                }
                session.pending.reject(new Error("Shell service disposed"));
                session.pending = null;
            }
            try {
                session.pty.kill();
            } catch {
            }
            session = null;
        }
    }

    function createSession(): PtySession {
        destroySession();

        const pty = spawn("/bin/bash", ["--norc", "--noprofile", "-i"], {
            name: "xterm-256color",
            cols: 120,
            rows: 40,
            cwd: repoRoot,
            env: {
                ...process.env,
                TERM: "xterm-256color",
                PS1: "",
                PS2: "",
                PROMPT_COMMAND: "",
            },
        });

        const newSession: PtySession = {
            pty,
            buffer: "",
            pending: null,
            disposed: false,
        };

        pty.onData((data: string) => {
            if (newSession.disposed) return;
            newSession.buffer += data;

            if (newSession.pending) {
                const pending = newSession.pending;
                const result = parseEndMarker(newSession.buffer, pending.id);
                if (result.found) {
                    const output = extractOutput(newSession.buffer, pending.id, result.endIndex);
                    const durationMs = Date.now() - pending.startTime;

                    if (pending.timeout) {
                        clearTimeout(pending.timeout);
                    }

                    newSession.pending = null;
                    newSession.buffer = newSession.buffer.slice(result.endIndex);

                    pending.resolve({
                        stdout: output,
                        stderr: "",
                        exitCode: result.exitCode,
                        durationMs,
                    });
                }
            }
        });

        pty.onExit(({ exitCode, signal }) => {
            newSession.disposed = true;
            if (newSession.pending) {
                const pending = newSession.pending;
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                pending.reject(new Error(`Shell exited unexpectedly: exitCode=${exitCode}, signal=${signal}`));
                newSession.pending = null;
            }
        });

        session = newSession;
        return newSession;
    }

    function getOrCreateSession(): PtySession {
        if (session && !session.disposed) {
            return session;
        }
        return createSession();
    }

    return {
        async run(command: string, runOptions?: { cwd?: string | null; timeoutMs?: number }): Promise<ShellRunResult> {
            let sess = getOrCreateSession();

            if (sess.pending) {
                throw new Error("A command is already running. Wait for it to complete or timeout.");
            }

            const commandId = generateCommandId();
            const timeoutMs = runOptions?.timeoutMs ?? 60000;

            const startMarker = `${START_MARKER}${commandId}_START_`;
            const endMarker = `${END_MARKER}${commandId}_EXIT_`;

            let wrappedCommand = "";
            if (runOptions?.cwd) {
                wrappedCommand += `cd ${JSON.stringify(runOptions.cwd)} && `;
            }
            wrappedCommand += `printf '\\n${startMarker}\\n'; ${command}; printf '\\n${endMarker}%d_END_\\n' $?`;

            return new Promise<ShellRunResult>((resolve, reject) => {
                const pending: PendingCommand = {
                    id: commandId,
                    startTime: Date.now(),
                    resolve,
                    reject,
                };

                if (timeoutMs > 0) {
                    pending.timeout = setTimeout(() => {
                        logger.info("shell_timeout", { command, timeoutMs });
                        destroySession();
                        reject(new Error(`Command timed out after ${timeoutMs}ms (session destroyed): ${command}`));
                    }, timeoutMs);
                }

                sess.pending = pending;
                sess.pty.write(wrappedCommand + "\n");
            });
        },

        dispose(): void {
            destroySession();
        },
    };
}

const globalSessions = new Map<string, ShellService>();

export function getShellService(repoRoot: string, logger: Logger): ShellService {
    let service = globalSessions.get(repoRoot);
    if (!service) {
        service = createShellService({ repoRoot, logger });
        globalSessions.set(repoRoot, service);
    }
    return service;
}

export function disposeAllShellServices(): void {
    for (const [, service] of globalSessions) {
        service.dispose();
    }
    globalSessions.clear();
}
