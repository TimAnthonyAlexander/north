import type { Logger } from "../logging/index";

export interface ShellRunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
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

    return {
        async run(command: string, runOptions?: { cwd?: string | null; timeoutMs?: number }): Promise<ShellRunResult> {
            const cwd = runOptions?.cwd || repoRoot;
            const timeoutMs = runOptions?.timeoutMs ?? 60000;
            const startTime = Date.now();

            const proc = Bun.spawn(["bash", "-c", command], {
                cwd,
                env: process.env,
                stdout: "pipe",
                stderr: "pipe",
            });

            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let timedOut = false;

            if (timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    timedOut = true;
                    proc.kill();
                    logger.info("shell_timeout", { command, timeoutMs });
                }, timeoutMs);
            }

            try {
                const [stdout, stderr, exitCode] = await Promise.all([
                    new Response(proc.stdout).text(),
                    new Response(proc.stderr).text(),
                    proc.exited,
                ]);

                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (timedOut) {
                    throw new Error(`Command timed out after ${timeoutMs}ms: ${command}`);
                }

                const durationMs = Date.now() - startTime;

                return {
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode,
                    durationMs,
                };
            } catch (error) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (timedOut) {
                    throw new Error(`Command timed out after ${timeoutMs}ms: ${command}`);
                }

                throw error;
            }
        },

        dispose(): void {
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
