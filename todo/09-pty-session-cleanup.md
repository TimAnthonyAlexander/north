# Add TTL Cleanup to Global PTY Sessions

## Severity: Minor

## Location
`src/shell/index.ts` (lines 233-249, `globalSessions`)

## Problem
The `globalSessions` Map holds PTY processes indefinitely. If a user switches `--path` or the orchestrator is recreated multiple times, old PTY sessions remain alive. Each PTY consumes system resources (memory, file descriptors) and can accumulate over long-running sessions.

## Solution
1. Implement TTL-based cleanup for idle sessions
2. Track last activity time per session
3. Periodically check and dispose sessions that have been idle too long
4. Ensure proper cleanup on process exit

## Implementation Notes
```typescript
interface SessionEntry {
    service: ShellService;
    lastActivity: number;
}

const globalSessions = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of globalSessions) {
            if (now - entry.lastActivity > SESSION_TTL_MS) {
                entry.service.dispose();
                globalSessions.delete(key);
            }
        }
    }, 60_000); // Check every minute
}

export function getShellService(repoRoot: string, logger: Logger): ShellService {
    let entry = globalSessions.get(repoRoot);
    if (!entry) {
        const service = createShellService({ repoRoot, logger });
        entry = { service, lastActivity: Date.now() };
        globalSessions.set(repoRoot, entry);
        startCleanupInterval();
    }
    entry.lastActivity = Date.now();
    return entry.service;
}
```

Also ensure cleanup on process exit:
```typescript
process.on('exit', disposeAllShellServices);
process.on('SIGTERM', disposeAllShellServices);
```

---

**When complete, delete this file: `rm todo/09-pty-session-cleanup.md`**


