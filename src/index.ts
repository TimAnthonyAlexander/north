#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { ConversationList } from "./ui/ConversationList";
import { ConversationPicker } from "./ui/ConversationPicker";
import { initLogger, type LogLevel } from "./logging/index";
import { detectRepoRoot } from "./utils/repo";
import { loadCursorRules } from "./rules/index";
import { hasProfile, loadProfile, hasDeclined } from "./storage/profile";
import {
    generateConversationId,
    loadConversation,
    listConversations,
    conversationExists,
    type ConversationState,
} from "./storage/conversations";
import { existsSync } from "fs";

type Command = "run" | "resume" | "list";

interface ParsedCLI {
    command: Command;
    resumeId?: string;
    path?: string;
    logLevel: LogLevel;
}

function parseArgs(): ParsedCLI {
    const args = process.argv.slice(2);
    let command: Command = "run";
    let resumeId: string | undefined;
    let path: string | undefined;
    let logLevel: LogLevel = "info";

    let i = 0;
    if (args[0] && !args[0].startsWith("-")) {
        const subcommand = args[0];
        if (subcommand === "resume") {
            command = "resume";
            i = 1;
            if (args[1] && !args[1].startsWith("-")) {
                resumeId = args[1];
                i = 2;
            }
        } else if (subcommand === "conversations" || subcommand === "list") {
            command = "list";
            i = 1;
        }
    }

    for (; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--path" && args[i + 1]) {
            path = args[++i];
        } else if (arg === "--log-level" && args[i + 1]) {
            const level = args[++i];
            if (level === "info" || level === "debug") {
                logLevel = level;
            }
        }
    }

    return { command, resumeId, path, logLevel };
}

function summarizeToolArgs(args: unknown): Record<string, unknown> {
    if (!args || typeof args !== "object") return {};

    const summary: Record<string, unknown> = {};
    const obj = args as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" && value.length > 100) {
            summary[key] = `${value.slice(0, 50)}... (${value.length} chars)`;
        } else {
            summary[key] = value;
        }
    }

    return summary;
}

async function runListCommand(): Promise<void> {
    const conversations = listConversations();
    const { waitUntilExit } = render(
        React.createElement(ConversationList, { conversations })
    );
    await waitUntilExit();
    process.exit(0);
}

async function runResumePickerCommand(
    path: string | undefined,
    logLevel: LogLevel
): Promise<void> {
    const conversations = listConversations().slice(0, 20);
    if (conversations.length === 0) {
        console.log("No conversations to resume.");
        process.exit(0);
    }

    const { waitUntilExit } = render(
        React.createElement(ConversationPicker, {
            conversations,
            onSelect(id: string) {
                runMainWithConversation(id, path, logLevel);
            },
            onCancel() {
                process.exit(0);
            },
        })
    );
    await waitUntilExit();
}

function runMainWithConversation(
    conversationId: string,
    pathOverride: string | undefined,
    logLevel: LogLevel
): void {
    const state = loadConversation(conversationId);
    if (!state) {
        console.error(`Conversation ${conversationId} not found or corrupted.`);
        process.exit(1);
    }

    let projectPath = state.repoRoot;
    let repoMissing = false;

    if (pathOverride) {
        projectPath = detectRepoRoot(pathOverride);
    } else if (!existsSync(projectPath)) {
        console.warn(
            `Warning: Original project path no longer exists: ${projectPath}`
        );
        console.warn("Some tools may be unavailable. Use --path to specify a new location.");
        repoMissing = true;
        projectPath = process.cwd();
    }

    runMain(conversationId, state, projectPath, logLevel, repoMissing);
}

async function runMain(
    conversationId: string,
    initialState: ConversationState | null,
    projectPath: string,
    logLevel: LogLevel,
    _repoMissing = false
): Promise<void> {
    const logger = initLogger({ projectPath, logLevel });

    const cursorRulesResult = await loadCursorRules(projectPath);
    const cursorRulesText = cursorRulesResult?.text || null;

    let projectProfileText: string | null = null;
    let needsLearningPrompt = false;

    if (hasProfile(projectPath)) {
        projectProfileText = loadProfile(projectPath);
    } else if (!hasDeclined(projectPath) && !initialState) {
        needsLearningPrompt = true;
    }

    const { waitUntilExit } = render(
        React.createElement(App, {
            projectPath,
            logger,
            cursorRulesText,
            projectProfileText,
            needsLearningPrompt,
            conversationId,
            initialState,
            onRequestStart(requestId: string, model: string) {
                logger.info("model_request_start", { requestId, model });
            },
            onRequestComplete(requestId: string, durationMs: number, error?: Error) {
                if (error) {
                    logger.error("model_request_error", error, { requestId, durationMs });
                } else {
                    logger.info("model_request_complete", { requestId, durationMs });
                }
            },
            onUserPrompt(length: number) {
                logger.info("user_prompt", { length });
            },
            onToolCallStart(toolName: string, args: unknown) {
                logger.info("tool_call_start", {
                    toolName,
                    argsSummary: summarizeToolArgs(args),
                });
            },
            onToolCallComplete(toolName: string, durationMs: number, ok: boolean) {
                logger.info("tool_call_complete", {
                    toolName,
                    durationMs,
                    ok,
                });
            },
            onWriteReviewShown(filesCount: number, toolName: string) {
                logger.info("write_review_shown", { filesCount, toolName });
            },
            onWriteReviewDecision(decision: "accept" | "reject", filesCount: number) {
                logger.info("write_review_decision", { decision, filesCount });
            },
            onWriteApplyStart() {
                logger.info("write_apply_start", {});
            },
            onWriteApplyComplete(durationMs: number, ok: boolean) {
                logger.info("write_apply_complete", { durationMs, ok });
            },
            onShellReviewShown(command: string, cwd?: string | null, timeoutMs?: number | null) {
                logger.info("shell_review_shown", {
                    command,
                    cwd: cwd || undefined,
                    timeoutMs: timeoutMs ?? undefined,
                });
            },
            onShellReviewDecision(decision: "run" | "always" | "auto" | "deny", command: string) {
                logger.info("shell_review_decision", { decision, command });
            },
            onShellRunStart(command: string, cwd?: string | null, timeoutMs?: number | null) {
                logger.info("shell_run_start", {
                    command,
                    cwd: cwd || undefined,
                    timeoutMs: timeoutMs ?? undefined,
                });
            },
            onShellRunComplete(
                command: string,
                exitCode: number,
                durationMs: number,
                stdoutBytes: number,
                stderrBytes: number
            ) {
                logger.info("shell_run_complete", {
                    command,
                    exitCode,
                    durationMs,
                    stdoutBytes,
                    stderrBytes,
                });
            },
        }),
        { exitOnCtrlC: false }
    );

    waitUntilExit().then(() => {
        logger.info("app_exit", {});
        process.exit(0);
    });
}

async function main() {
    const { command, resumeId, path, logLevel } = parseArgs();

    if (command === "list") {
        await runListCommand();
        return;
    }

    if (command === "resume") {
        if (resumeId) {
            if (!conversationExists(resumeId)) {
                console.error(`Conversation ${resumeId} not found.`);
                process.exit(1);
            }
            runMainWithConversation(resumeId, path, logLevel);
        } else {
            await runResumePickerCommand(path, logLevel);
        }
        return;
    }

    const startDir = path || process.cwd();
    const projectPath = detectRepoRoot(startDir);
    const conversationId = generateConversationId();

    await runMain(conversationId, null, projectPath, logLevel);
}

main();
