#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { initLogger, type LogLevel } from "./logging/index";
import { detectRepoRoot } from "./utils/repo";

function parseArgs(): { path?: string; logLevel: LogLevel } {
    const args = process.argv.slice(2);
    let path: string | undefined;
    let logLevel: LogLevel = "info";

    for (let i = 0; i < args.length; i++) {
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

    return { path, logLevel };
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

function main() {
    const { path, logLevel } = parseArgs();
    const startDir = path || process.cwd();
    const projectPath = detectRepoRoot(startDir);
    const logger = initLogger({ projectPath, logLevel });

    const { unmount, waitUntilExit } = render(
        React.createElement(App, {
            projectPath,
            logger,
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
            onShellReviewShown(command: string, cwd?: string | null) {
                logger.info("shell_review_shown", { command, cwd: cwd || undefined });
            },
            onShellReviewDecision(decision: "run" | "always" | "deny", command: string) {
                logger.info("shell_review_decision", { decision, command });
            },
            onShellRunStart(command: string, cwd?: string | null) {
                logger.info("shell_run_start", { command, cwd: cwd || undefined });
            },
            onShellRunComplete(command: string, exitCode: number, durationMs: number, stdoutBytes: number, stderrBytes: number) {
                logger.info("shell_run_complete", { command, exitCode, durationMs, stdoutBytes, stderrBytes });
            },
        })
    );

    waitUntilExit().then(() => {
        logger.info("app_exit", {});
        process.exit(0);
    });
}

main();
