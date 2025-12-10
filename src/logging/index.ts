import { appendFileSync } from "fs";
import { join } from "path";
import { getLogDir, ensureDir } from "../utils/paths";

export type LogLevel = "info" | "debug" | "error";

export interface Logger {
    info(event: string, data?: Record<string, unknown>): void;
    debug(event: string, data?: Record<string, unknown>): void;
    error(event: string, error: Error, data?: Record<string, unknown>): void;
}

let logFilePath: string | null = null;
let currentLogLevel: LogLevel = "info";

function ensureLogDir(): void {
    ensureDir(getLogDir());
}

function formatTimestamp(): string {
    return new Date().toISOString();
}

function formatLogEntry(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
    error?: Error
): string {
    const entry: Record<string, unknown> = {
        timestamp: formatTimestamp(),
        level,
        event,
    };

    if (data) {
        entry.data = data;
    }

    if (error) {
        entry.error = {
            message: error.message,
            stack: error.stack,
        };
    }

    return JSON.stringify(entry) + "\n";
}

function writeLog(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
    error?: Error
): void {
    if (!logFilePath) return;

    const shouldLog =
        level === "error" ||
        currentLogLevel === "debug" ||
        (currentLogLevel === "info" && level === "info");

    if (!shouldLog) return;

    const entry = formatLogEntry(level, event, data, error);
    try {
        appendFileSync(logFilePath, entry);
    } catch {
        // Silent fail - logging should never crash the app
    }
}

export function initLogger(options: { projectPath: string; logLevel?: LogLevel }): Logger {
    currentLogLevel = options.logLevel || "info";
    ensureLogDir();
    logFilePath = join(getLogDir(), "north.log");

    const logger: Logger = {
        info(event: string, data?: Record<string, unknown>) {
            writeLog("info", event, data);
        },
        debug(event: string, data?: Record<string, unknown>) {
            writeLog("debug", event, data);
        },
        error(event: string, error: Error, data?: Record<string, unknown>) {
            writeLog("error", event, data, error);
        },
    };

    logger.info("app_start", {
        version: "0.1.0",
        projectPath: options.projectPath,
        cwd: process.cwd(),
    });

    return logger;
}

export function getLogFilePath(): string | null {
    return logFilePath;
}
