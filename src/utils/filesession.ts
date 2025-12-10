import * as fs from "node:fs";
import * as path from "node:path";

const TRAILING_WINDOW_SIZE = 30;

export interface ResumeInfo {
    path: string;
    linesWritten: number;
    trailingWindow: string[];
}

export interface FileWriteSession {
    path: string;
    absolutePath: string;
    linesWritten: number;
    isComplete: boolean;
    write(chunk: string): void;
    finalize(): void;
    getResumeInfo(): ResumeInfo;
    abort(): void;
}

export function startSession(repoRoot: string, relativePath: string): FileWriteSession {
    const absolutePath = path.join(repoRoot, relativePath);
    const parentDir = path.dirname(absolutePath);

    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    const fd = fs.openSync(absolutePath, "w");
    let linesWritten = 0;
    let isComplete = false;
    let lineBuffer = "";
    const trailingWindow: string[] = [];

    function updateTrailingWindow(line: string) {
        trailingWindow.push(line);
        if (trailingWindow.length > TRAILING_WINDOW_SIZE) {
            trailingWindow.shift();
        }
    }

    function write(chunk: string): void {
        if (isComplete) return;

        fs.writeSync(fd, chunk);

        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";

        for (const line of lines) {
            linesWritten++;
            updateTrailingWindow(line);
        }
    }

    function finalize(): void {
        if (isComplete) return;

        if (lineBuffer.length > 0) {
            linesWritten++;
            updateTrailingWindow(lineBuffer);
            lineBuffer = "";
        }

        fs.closeSync(fd);
        isComplete = true;
    }

    function getResumeInfo(): ResumeInfo {
        const currentWindow = [...trailingWindow];
        if (lineBuffer.length > 0) {
            currentWindow.push(lineBuffer);
            if (currentWindow.length > TRAILING_WINDOW_SIZE) {
                currentWindow.shift();
            }
        }

        return {
            path: relativePath,
            linesWritten: linesWritten + (lineBuffer.length > 0 ? 1 : 0),
            trailingWindow: currentWindow,
        };
    }

    function abort(): void {
        if (!isComplete) {
            fs.closeSync(fd);
            isComplete = true;
        }

        try {
            fs.unlinkSync(absolutePath);
        } catch {
            // File may not exist or already deleted
        }
    }

    return {
        path: relativePath,
        absolutePath,
        get linesWritten() {
            return linesWritten + (lineBuffer.length > 0 ? 1 : 0);
        },
        get isComplete() {
            return isComplete;
        },
        write,
        finalize,
        getResumeInfo,
        abort,
    };
}

export function appendToSession(
    repoRoot: string,
    relativePath: string,
    existingLinesWritten: number,
    existingTrailingWindow: string[]
): FileWriteSession {
    const absolutePath = path.join(repoRoot, relativePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Cannot append: file does not exist: ${relativePath}`);
    }

    const fd = fs.openSync(absolutePath, "a");
    let linesWritten = existingLinesWritten;
    let isComplete = false;
    let lineBuffer = "";
    const trailingWindow: string[] = [...existingTrailingWindow];

    function updateTrailingWindow(line: string) {
        trailingWindow.push(line);
        if (trailingWindow.length > TRAILING_WINDOW_SIZE) {
            trailingWindow.shift();
        }
    }

    function write(chunk: string): void {
        if (isComplete) return;

        fs.writeSync(fd, chunk);

        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";

        for (const line of lines) {
            linesWritten++;
            updateTrailingWindow(line);
        }
    }

    function finalize(): void {
        if (isComplete) return;

        if (lineBuffer.length > 0) {
            linesWritten++;
            updateTrailingWindow(lineBuffer);
            lineBuffer = "";
        }

        fs.closeSync(fd);
        isComplete = true;
    }

    function getResumeInfo(): ResumeInfo {
        const currentWindow = [...trailingWindow];
        if (lineBuffer.length > 0) {
            currentWindow.push(lineBuffer);
            if (currentWindow.length > TRAILING_WINDOW_SIZE) {
                currentWindow.shift();
            }
        }

        return {
            path: relativePath,
            linesWritten: linesWritten + (lineBuffer.length > 0 ? 1 : 0),
            trailingWindow: currentWindow,
        };
    }

    function abort(): void {
        if (!isComplete) {
            fs.closeSync(fd);
            isComplete = true;
        }
    }

    return {
        path: relativePath,
        absolutePath,
        get linesWritten() {
            return linesWritten + (lineBuffer.length > 0 ? 1 : 0);
        },
        get isComplete() {
            return isComplete;
        },
        write,
        finalize,
        getResumeInfo,
        abort,
    };
}
