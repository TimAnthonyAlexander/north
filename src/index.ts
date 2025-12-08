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

function main() {
  const { path, logLevel } = parseArgs();
  const startDir = path || process.cwd();
  const projectPath = detectRepoRoot(startDir);
  const logger = initLogger({ projectPath, logLevel });

  const { unmount, waitUntilExit } = render(
    React.createElement(App, {
      projectPath,
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
    })
  );

  waitUntilExit().then(() => {
    logger.info("app_exit", {});
    process.exit(0);
  });
}

main();

