import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    appendFileSync,
    readdirSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { randomBytes, createHash } from "crypto";
import type { TranscriptEntry } from "../orchestrator/index";
import type { StructuredSummary } from "../commands/types";

export interface ConversationMeta {
    id: string;
    repoRoot: string;
    repoHash: string;
    startedAt: number;
    lastActiveAt: number;
    previewText: string;
    model: string;
}

export interface ConversationState {
    id: string;
    repoRoot: string;
    repoHash: string;
    model: string;
    transcript: TranscriptEntry[];
    rollingSummary: StructuredSummary | null;
    startedAt: number;
    lastActiveAt: number;
}

type ConversationEvent =
    | {
          t: "conversation_started";
          ts: number;
          id: string;
          repoRoot: string;
          repoHash: string;
          model: string;
      }
    | {
          t: "entry_added";
          ts: number;
          entry: TranscriptEntry;
      }
    | {
          t: "entry_updated";
          ts: number;
          id: string;
          patch: Partial<TranscriptEntry>;
      }
    | {
          t: "model_changed";
          ts: number;
          model: string;
      }
    | {
          t: "rolling_summary_set";
          ts: number;
          summary: StructuredSummary | null;
      }
    | {
          t: "conversation_ended";
          ts: number;
      };

function getHomeDir(): string {
    return process.env.HOME || homedir();
}

function getConversationsDir(): string {
    if (process.env.NORTH_CONVERSATIONS_DIR) {
        return process.env.NORTH_CONVERSATIONS_DIR;
    }
    return join(getHomeDir(), ".north", "conversations");
}

function ensureConversationsDir(): void {
    const dir = getConversationsDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function getEventLogPath(id: string): string {
    return join(getConversationsDir(), `${id}.jsonl`);
}

function getSnapshotPath(id: string): string {
    return join(getConversationsDir(), `${id}.snapshot.json`);
}

function getIndexPath(): string {
    return join(getConversationsDir(), "index.json");
}

export function generateConversationId(): string {
    return randomBytes(3).toString("hex");
}

export function getRepoHash(repoRoot: string): string {
    return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

export function appendEvent(id: string, event: ConversationEvent): void {
    ensureConversationsDir();
    const path = getEventLogPath(id);
    const line = JSON.stringify(event) + "\n";
    appendFileSync(path, line, "utf-8");
}

export function startConversation(id: string, repoRoot: string, model: string): void {
    const repoHash = getRepoHash(repoRoot);
    const ts = Date.now();

    appendEvent(id, {
        t: "conversation_started",
        ts,
        id,
        repoRoot,
        repoHash,
        model,
    });

    updateIndex(id, {
        id,
        repoRoot,
        repoHash,
        startedAt: ts,
        lastActiveAt: ts,
        previewText: "",
        model,
    });
}

export function logEntryAdded(id: string, entry: TranscriptEntry): void {
    appendEvent(id, {
        t: "entry_added",
        ts: Date.now(),
        entry,
    });

    if (entry.role === "user" && entry.content) {
        updateIndexPreview(id, entry.content.slice(0, 100));
    }
    updateIndexLastActive(id);
}

export function logEntryUpdated(
    id: string,
    entryId: string,
    patch: Partial<TranscriptEntry>
): void {
    appendEvent(id, {
        t: "entry_updated",
        ts: Date.now(),
        id: entryId,
        patch,
    });
    updateIndexLastActive(id);
}

export function logModelChanged(id: string, model: string): void {
    appendEvent(id, {
        t: "model_changed",
        ts: Date.now(),
        model,
    });
    updateIndexLastActive(id);
}

export function logRollingSummarySet(id: string, summary: StructuredSummary | null): void {
    appendEvent(id, {
        t: "rolling_summary_set",
        ts: Date.now(),
        summary,
    });
    updateIndexLastActive(id);
}

export function logConversationEnded(id: string): void {
    appendEvent(id, {
        t: "conversation_ended",
        ts: Date.now(),
    });
    updateIndexLastActive(id);
}

function loadIndex(): ConversationMeta[] {
    const path = getIndexPath();
    if (!existsSync(path)) {
        return [];
    }
    try {
        const content = readFileSync(path, "utf-8");
        return JSON.parse(content);
    } catch {
        return [];
    }
}

function saveIndex(index: ConversationMeta[]): void {
    ensureConversationsDir();
    const path = getIndexPath();
    writeFileSync(path, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function updateIndex(id: string, meta: ConversationMeta): void {
    const index = loadIndex();
    const existing = index.findIndex((m) => m.id === id);
    if (existing >= 0) {
        index[existing] = meta;
    } else {
        index.unshift(meta);
    }
    saveIndex(index);
}

function updateIndexLastActive(id: string): void {
    const index = loadIndex();
    const entry = index.find((m) => m.id === id);
    if (entry) {
        entry.lastActiveAt = Date.now();
        saveIndex(index);
    }
}

function updateIndexPreview(id: string, preview: string): void {
    const index = loadIndex();
    const entry = index.find((m) => m.id === id);
    if (entry && !entry.previewText) {
        entry.previewText = preview;
        saveIndex(index);
    }
}

export function listConversations(): ConversationMeta[] {
    const index = loadIndex();
    return index.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export function conversationExists(id: string): boolean {
    const path = getEventLogPath(id);
    return existsSync(path);
}

export function loadConversation(id: string): ConversationState | null {
    const logPath = getEventLogPath(id);
    const snapshotPath = getSnapshotPath(id);

    if (!existsSync(logPath)) {
        return null;
    }

    let state: ConversationState = {
        id,
        repoRoot: "",
        repoHash: "",
        model: "",
        transcript: [],
        rollingSummary: null,
        startedAt: 0,
        lastActiveAt: 0,
    };

    let snapshotEventCount = 0;
    if (existsSync(snapshotPath)) {
        try {
            const snapshotContent = readFileSync(snapshotPath, "utf-8");
            const snapshot = JSON.parse(snapshotContent);
            state = snapshot.state;
            snapshotEventCount = snapshot.eventCount || 0;
        } catch {
            snapshotEventCount = 0;
        }
    }

    try {
        const logContent = readFileSync(logPath, "utf-8");
        const lines = logContent.trim().split("\n");

        for (let i = snapshotEventCount; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const event: ConversationEvent = JSON.parse(line);
            applyEvent(state, event);
        }
    } catch (err) {
        console.error(`[conversations] Failed to load ${id}:`, err);
        return null;
    }

    return state;
}

function applyEvent(state: ConversationState, event: ConversationEvent): void {
    switch (event.t) {
        case "conversation_started":
            state.repoRoot = event.repoRoot;
            state.repoHash = event.repoHash;
            state.model = event.model;
            state.startedAt = event.ts;
            state.lastActiveAt = event.ts;
            break;

        case "entry_added":
            state.transcript.push(event.entry);
            state.lastActiveAt = event.ts;
            break;

        case "entry_updated": {
            const entry = state.transcript.find((e) => e.id === event.id);
            if (entry) {
                Object.assign(entry, event.patch);
            }
            state.lastActiveAt = event.ts;
            break;
        }

        case "model_changed":
            state.model = event.model;
            state.lastActiveAt = event.ts;
            break;

        case "rolling_summary_set":
            state.rollingSummary = event.summary;
            state.lastActiveAt = event.ts;
            break;

        case "conversation_ended":
            state.lastActiveAt = event.ts;
            break;
    }
}

export function saveSnapshot(id: string, state: ConversationState): void {
    ensureConversationsDir();
    const logPath = getEventLogPath(id);
    const snapshotPath = getSnapshotPath(id);

    let eventCount = 0;
    if (existsSync(logPath)) {
        try {
            const content = readFileSync(logPath, "utf-8");
            eventCount = content.trim().split("\n").length;
        } catch {
            eventCount = 0;
        }
    }

    const snapshot = {
        state,
        eventCount,
        savedAt: Date.now(),
    };

    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
}

export function getConversationIds(): string[] {
    const dir = getConversationsDir();
    if (!existsSync(dir)) {
        return [];
    }

    try {
        const files = readdirSync(dir);
        return files.filter((f) => f.endsWith(".jsonl")).map((f) => basename(f, ".jsonl"));
    } catch {
        return [];
    }
}
