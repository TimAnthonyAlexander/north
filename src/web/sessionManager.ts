import type { Logger } from "../logging/index";
import {
    createOrchestratorWithTools,
    type Orchestrator,
    type OrchestratorState,
    type ShellDecision,
    type WriteDecision,
    type CommandDecision,
} from "../orchestrator/index";
import { loadCursorRules } from "../rules/index";
import { hasProfile, loadProfile } from "../storage/profile";
import { generateConversationId, loadConversation } from "../storage/conversations";
import { filterAttachedFiles, validateRepoRoot } from "./security";
import type { Mode } from "./protocol";

export interface SessionManagerOptions {
    allowedRepoRoot: string;
    logger: Logger;
    reviewTimeoutMs: number;
}

export type SessionId = string;

type SendFn = (msg: unknown) => void;

interface Session {
    id: SessionId;
    repoRoot: string;
    orchestrator: Orchestrator;
    createdAt: number;
    lastSeenAt: number;
    lastState: OrchestratorState;
    reviewTimeoutId: ReturnType<typeof setTimeout> | null;
}

function generateSessionId(): string {
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class SessionManager {
    private sessions = new Map<SessionId, Session>();
    private options: SessionManagerOptions;
    private send: SendFn;

    constructor(options: SessionManagerOptions, send: SendFn) {
        this.options = options;
        this.send = send;
    }

    listSessionIds(): SessionId[] {
        return [...this.sessions.keys()];
    }

    async createSession(input: {
        repoRoot?: string;
        conversationId?: string;
        initialState?: unknown;
    }): Promise<{ ok: true; sessionId: string; state: OrchestratorState } | { ok: false; error: string }> {
        const repoCheck = validateRepoRoot(input.repoRoot, this.options.allowedRepoRoot);
        if (!repoCheck.ok) return { ok: false, error: repoCheck.error };
        const repoRoot = repoCheck.repoRoot;

        const conversationId = input.conversationId || generateConversationId();

        const initialState =
            input.initialState !== undefined
                ? (input.initialState as any)
                : input.conversationId
                  ? loadConversation(input.conversationId)
                  : null;
        if (input.conversationId && input.initialState === undefined && !initialState) {
            return { ok: false, error: `Conversation ${input.conversationId} not found or corrupted` };
        }

        const cursorRulesResult = await loadCursorRules(repoRoot);
        const cursorRulesText = cursorRulesResult?.text || null;

        const projectProfileText = hasProfile(repoRoot) ? loadProfile(repoRoot) : null;

        const sessionId = generateSessionId();
        let lastState: OrchestratorState | null = null;
        let announced = false;

        const orchestrator = createOrchestratorWithTools(
            {
                onStateChange: (state) => {
                    lastState = state;
                    if (!announced) return;

                    const session = this.sessions.get(sessionId);
                    if (session) {
                        session.lastState = state;
                        session.lastSeenAt = Date.now();
                        this.maybeArmReviewTimeout(session);
                    }
                    this.send({ type: "state", sessionId, state });
                },
                onExit: () => {
                    this.closeSession(sessionId);
                },
            },
            {
                repoRoot,
                logger: this.options.logger,
                cursorRulesText,
                projectProfileText,
                conversationId,
                initialState,
            }
        );

        const session: Session = {
            id: sessionId,
            repoRoot,
            orchestrator,
            createdAt: Date.now(),
            lastSeenAt: Date.now(),
            lastState: (lastState ?? {
                transcript: [],
                isProcessing: false,
                pendingReviewId: null,
                currentModel: "",
                contextUsedTokens: 0,
                contextLimitTokens: 0,
                contextUsage: 0,
                learningPromptId: null,
                learningInProgress: false,
                learningPercent: 0,
                learningTopic: "",
                thinkingEnabled: false,
                sessionCostUsd: 0,
                allTimeCostUsd: 0,
                sessionCostsByModel: {},
            }) as OrchestratorState,
            reviewTimeoutId: null,
        };
        this.sessions.set(sessionId, session);

        announced = true;
        return { ok: true, sessionId, state: session.lastState };
    }

    getSession(sessionId: string): Session | null {
        return this.sessions.get(sessionId) || null;
    }

    async chatSend(input: {
        sessionId: string;
        content: string;
        mode: Mode;
        attachedFiles?: string[];
    }): Promise<{ ok: true } | { ok: false; error: string }> {
        const session = this.sessions.get(input.sessionId);
        if (!session) return { ok: false, error: "Unknown sessionId" };

        const safeAttached = filterAttachedFiles(session.repoRoot, input.attachedFiles);
        void session.orchestrator.sendMessage(input.content, input.mode, safeAttached);
        return { ok: true };
    }

    resolveReview(input: {
        sessionId: string;
        reviewId: string;
        kind: "write" | "shell" | "command" | "learning";
        decision: unknown;
    }): { ok: true } | { ok: false; error: string } {
        const session = this.sessions.get(input.sessionId);
        if (!session) return { ok: false, error: "Unknown sessionId" };

        if (input.kind === "write") {
            const d = input.decision;
            if (d !== "accept" && d !== "always" && d !== "reject") {
                return { ok: false, error: "Invalid write decision" };
            }
            session.orchestrator.resolveWriteReview(input.reviewId, d as WriteDecision);
            return { ok: true };
        }

        if (input.kind === "shell") {
            const d = input.decision;
            if (d !== "run" && d !== "always" && d !== "auto" && d !== "deny") {
                return { ok: false, error: "Invalid shell decision" };
            }
            session.orchestrator.resolveShellReview(input.reviewId, d as ShellDecision);
            return { ok: true };
        }

        if (input.kind === "command") {
            const d = input.decision;
            if (d !== null && typeof d !== "string") {
                return { ok: false, error: "Invalid command decision (string|null)" };
            }
            session.orchestrator.resolveCommandReview(input.reviewId, d as CommandDecision);
            return { ok: true };
        }

        // learning prompts are currently UI-managed in Ink; keep message for forward-compat.
        if (input.kind === "learning") {
            return { ok: true };
        }

        return { ok: false, error: "Unknown review kind" };
    }

    async startLearning(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const session = this.sessions.get(sessionId);
        if (!session) return { ok: false, error: "Unknown sessionId" };
        await session.orchestrator.startLearningSession();
        return { ok: true };
    }

    cancel(sessionId: string): { ok: true } | { ok: false; error: string } {
        const session = this.sessions.get(sessionId);
        if (!session) return { ok: false, error: "Unknown sessionId" };
        session.orchestrator.cancel();
        return { ok: true };
    }

    stop(sessionId: string): { ok: true } | { ok: false; error: string } {
        const session = this.sessions.get(sessionId);
        if (!session) return { ok: false, error: "Unknown sessionId" };
        session.orchestrator.stop();
        this.closeSession(sessionId);
        return { ok: true };
    }

    closeSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        if (session.reviewTimeoutId) {
            clearTimeout(session.reviewTimeoutId);
            session.reviewTimeoutId = null;
        }
        this.sessions.delete(sessionId);
    }

    closeAllSessions(): void {
        for (const sessionId of this.sessions.keys()) {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.orchestrator.cancel();
                session.orchestrator.stop();
            }
            this.closeSession(sessionId);
        }
    }

    private maybeArmReviewTimeout(session: Session): void {
        if (this.options.reviewTimeoutMs <= 0) return;

        const reviewId = session.lastState.pendingReviewId;
        if (!reviewId) {
            if (session.reviewTimeoutId) {
                clearTimeout(session.reviewTimeoutId);
                session.reviewTimeoutId = null;
            }
            return;
        }

        if (session.reviewTimeoutId) return;

        session.reviewTimeoutId = setTimeout(() => {
            session.reviewTimeoutId = null;

            const latest = session.lastState;
            const pendingId = latest.pendingReviewId;
            if (!pendingId) return;

            const entry = latest.transcript.find((e) => e.id === pendingId);
            if (!entry) return;

            if (entry.role === "diff_review") {
                session.orchestrator.resolveWriteReview(pendingId, "reject");
                this.send({
                    type: "error",
                    sessionId: session.id,
                    message: "Diff review timed out; rejected automatically.",
                });
                return;
            }

            if (entry.role === "shell_review") {
                session.orchestrator.resolveShellReview(pendingId, "deny");
                this.send({
                    type: "error",
                    sessionId: session.id,
                    message: "Shell review timed out; denied automatically.",
                });
                return;
            }

            if (entry.role === "command_review") {
                session.orchestrator.resolveCommandReview(pendingId, null);
                this.send({
                    type: "error",
                    sessionId: session.id,
                    message: "Command picker timed out; cancelled automatically.",
                });
                return;
            }
        }, this.options.reviewTimeoutMs);
    }
}
