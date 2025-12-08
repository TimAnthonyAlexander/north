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
    pending: Map<string, PendingCommand>;
    disposed: boolean;
}

const START_MARKER = "__NORTH_START_";
const END_MARKER = "__NORTH_END_";
const EXIT_MARKER = "__EXIT__";

function generateCommandId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseEndMarker(buffer: string, commandId: string): { found: boolean; exitCode: number; endIndex: number } {
    const endPattern = `${END_MARKER}${commandId}${EXIT_MARKER}`;
    const idx = buffer.indexOf(endPattern);
    if (idx === -1) {
        return { found: false, exitCode: -1, endIndex: -1 };
    }

    const afterMarker = buffer.slice(idx + endPattern.length);
    const exitMatch = afterMarker.match(/^(\d+)__/);
    if (!exitMatch) {
        return { found: false, exitCode: -1, endIndex: -1 };
    }

    const exitCode = parseInt(exitMatch[1], 10);
    const fullEndLength = endPattern.length + exitMatch[0].length;
    return { found: true, exitCode, endIndex: idx + fullEndLength };
}

function extractOutput(buffer: string, commandId: string, endIndex: number): string {
    const startPattern = `${START_MARKER}${commandId}__`;
    const startIdx = buffer.indexOf(startPattern);
    if (startIdx === -1) {
        return "";
    }

    const outputStart = startIdx + startPattern.length;
    const endPattern = `${END_MARKER}${commandId}${EXIT_MARKER}`;
    const endIdx = buffer.indexOf(endPattern);
    if (endIdx === -1) {
        return "";
    }

    let output = buffer.slice(outputStart, endIdx);
    output = output.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    return output;
}

export interface ShellService {
    run(command: string, options?: { cwd?: string; timeoutMs?: number }): Promise<ShellRunResult>;
    dispose(): void;
}

export interface ShellServiceOptions {
    repoRoot: string;
    logger: Logger;
}

export function createShellService(options: ShellServiceOptions): ShellService {
    const { repoRoot, logger } = options;
    let session: PtySession | null = null;

    function getOrCreateSession(): PtySession {
        if (session && !session.disposed) {
            return session;
        }

        const shell = process.env.SHELL || "/bin/bash";
        const pty = spawn(shell, ["--norc", "--noprofile", "-i"], {
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
            pending: new Map(),
            disposed: false,
        };

        pty.onData((data: string) => {
            if (newSession.disposed) return;
            newSession.buffer += data;

            for (const [cmdId, pending] of newSession.pending) {
                const result = parseEndMarker(newSession.buffer, cmdId);
                if (result.found) {
                    const output = extractOutput(newSession.buffer, cmdId, result.endIndex);
                    const durationMs = Date.now() - pending.startTime;

                    if (pending.timeout) {
                        clearTimeout(pending.timeout);
                    }

                    newSession.pending.delete(cmdId);

                    pending.resolve({
                        stdout: output,
                        stderr: "",
                        exitCode: result.exitCode,
                        durationMs,
                    });

                    const startIdx = newSession.buffer.indexOf(`${START_MARKER}${cmdId}__`);
                    if (startIdx !== -1) {
                        newSession.buffer = newSession.buffer.slice(result.endIndex);
                    }
                }
            }
        });

        pty.onExit(({ exitCode, signal }) => {
            newSession.disposed = true;
            for (const [, pending] of newSession.pending) {
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                pending.reject(new Error(`Shell exited unexpectedly: exitCode=${exitCode}, signal=${signal}`));
            }
            newSession.pending.clear();
        });

        session = newSession;
        return newSession;
    }

    return {
        async run(command: string, runOptions?: { cwd?: string; timeoutMs?: number }): Promise<ShellRunResult> {
            const sess = getOrCreateSession();
            const commandId = generateCommandId();
            const timeoutMs = runOptions?.timeoutMs ?? 60000;

            const startMarker = `${START_MARKER}${commandId}__`;
            const endMarker = `${END_MARKER}${commandId}${EXIT_MARKER}`;

            let wrappedCommand = "";
            if (runOptions?.cwd) {
                wrappedCommand += `cd ${JSON.stringify(runOptions.cwd)} && `;
            }
            wrappedCommand += `echo ${startMarker}; ${command}; echo ${endMarker}$?__`;

            return new Promise<ShellRunResult>((resolve, reject) => {
                const pending: PendingCommand = {
                    id: commandId,
                    startTime: Date.now(),
                    resolve,
                    reject,
                };

                if (timeoutMs > 0) {
                    pending.timeout = setTimeout(() => {
                        sess.pending.delete(commandId);
                        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
                    }, timeoutMs);
                }

                sess.pending.set(commandId, pending);
                sess.pty.write(wrappedCommand + "\n");
            });
        },

        dispose(): void {
            if (session && !session.disposed) {
                session.disposed = true;
                for (const [, pending] of session.pending) {
                    if (pending.timeout) {
                        clearTimeout(pending.timeout);
                    }
                    pending.reject(new Error("Shell service disposed"));
                }
                session.pending.clear();
                try {
                    session.pty.kill();
                } catch {
                }
                session = null;
            }
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

