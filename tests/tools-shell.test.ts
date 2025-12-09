import { describe, test, expect, afterEach } from "bun:test";
import { createShellService, getShellService, disposeAllShellServices } from "../src/shell";
import type { Logger } from "../src/logging";
import { createTempRepo, createFile, readFixtureFile, type TempRepo } from "./helpers/fixtures";

let tempRepo: TempRepo | null = null;

afterEach(() => {
    disposeAllShellServices();
    if (tempRepo) {
        tempRepo.cleanup();
        tempRepo = null;
    }
});

const dummyLogger: Logger = {
    info: () => {},
    error: () => {},
    debug: () => {},
};

describe("Shell Service", () => {
    describe("Command Execution", () => {
        test("captures stdout correctly", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'hello world'");

            expect(result.stdout).toBe("hello world");
            expect(result.exitCode).toBe(0);
            expect(result.durationMs).toBeGreaterThan(0);
        });

        test("captures stderr separately", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'error message' >&2");

            expect(result.stderr).toBe("error message");
            expect(result.exitCode).toBe(0);
        });

        test("captures exit code on failure", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("exit 42");

            expect(result.exitCode).toBe(42);
        });

        test("uses repo root as working directory by default", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("pwd");

            expect(result.stdout.replace("/private", "")).toBe(tempRepo.root.replace("/private", ""));
            expect(result.exitCode).toBe(0);
        });

        test("uses custom working directory when specified", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "subdir/dummy.txt", "content");

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const subdir = `${tempRepo.root}/subdir`;
            const result = await service.run("pwd", { cwd: subdir });

            expect(result.stdout.replace("/private", "")).toBe(subdir.replace("/private", ""));
        });

        test("handles multiline output", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'line1'; echo 'line2'; echo 'line3'");

            expect(result.stdout).toContain("line1");
            expect(result.stdout).toContain("line2");
            expect(result.stdout).toContain("line3");
        });

        test("handles empty output", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("true");

            expect(result.stdout).toBe("");
            expect(result.exitCode).toBe(0);
        });
    });

    describe("Timeout Enforcement", () => {
        test("times out long-running command", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            let errorThrown = false;
            try {
                await service.run("sleep 10", { timeoutMs: 100 });
            } catch (error) {
                errorThrown = true;
                expect(error).toBeInstanceOf(Error);
                if (error instanceof Error) {
                    expect(error.message).toContain("timed out");
                }
            }

            expect(errorThrown).toBe(true);
        });

        test("completes before timeout", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'fast'", { timeoutMs: 5000 });

            expect(result.stdout).toBe("fast");
            expect(result.exitCode).toBe(0);
        });
    });

    describe("File System Modifications", () => {
        test("creates file and validates side effect", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'test content' > testfile.txt");

            expect(result.exitCode).toBe(0);

            const fileContent = readFixtureFile(tempRepo.root, "testfile.txt");
            expect(fileContent).toContain("test content");
        });

        test("modifies existing file", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "modify.txt", "original\n");

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'appended' >> modify.txt");

            expect(result.exitCode).toBe(0);

            const fileContent = readFixtureFile(tempRepo.root, "modify.txt");
            expect(fileContent).toContain("original");
            expect(fileContent).toContain("appended");
        });

        test("leaves non-target files unchanged", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "untouched.txt", "original content\n");
            createFile(tempRepo.root, "target.txt", "target content\n");

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            await service.run("echo 'modified' > target.txt");

            const untouchedContent = readFixtureFile(tempRepo.root, "untouched.txt");
            expect(untouchedContent).toBe("original content\n");
        });
    });

    describe("Service Caching", () => {
        test("getShellService returns cached service for same repo", () => {
            tempRepo = createTempRepo();

            const service1 = getShellService(tempRepo.root, dummyLogger);
            const service2 = getShellService(tempRepo.root, dummyLogger);

            expect(service1).toBe(service2);
        });

        test("getShellService returns different services for different repos", () => {
            const tempRepo1 = createTempRepo();
            const tempRepo2 = createTempRepo();

            const service1 = getShellService(tempRepo1.root, dummyLogger);
            const service2 = getShellService(tempRepo2.root, dummyLogger);

            expect(service1).not.toBe(service2);

            tempRepo1.cleanup();
            tempRepo2.cleanup();
        });

        test("disposeAllShellServices clears cache", () => {
            tempRepo = createTempRepo();

            const service1 = getShellService(tempRepo.root, dummyLogger);
            disposeAllShellServices();
            const service2 = getShellService(tempRepo.root, dummyLogger);

            expect(service1).not.toBe(service2);
        });
    });

    describe("Deterministic Commands", () => {
        test("echo produces consistent output", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result1 = await service.run("echo 'test'");
            const result2 = await service.run("echo 'test'");

            expect(result1.stdout).toBe(result2.stdout);
            expect(result1.exitCode).toBe(result2.exitCode);
        });

        test("test command works correctly", async () => {
            tempRepo = createTempRepo();
            createFile(tempRepo.root, "exists.txt", "content");

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const existsResult = await service.run("test -f exists.txt");
            expect(existsResult.exitCode).toBe(0);

            const notExistsResult = await service.run("test -f nonexistent.txt");
            expect(notExistsResult.exitCode).not.toBe(0);
        });

        test("basic arithmetic in shell", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo $((2 + 2))");

            expect(result.stdout).toBe("4");
            expect(result.exitCode).toBe(0);
        });

        test("environment variable access", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo $HOME");

            expect(result.stdout.length).toBeGreaterThan(0);
            expect(result.exitCode).toBe(0);
        });
    });

    describe("Complex Commands", () => {
        test("pipes work correctly", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'hello world' | grep world");

            expect(result.stdout).toContain("world");
            expect(result.exitCode).toBe(0);
        });

        test("command chaining with &&", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'first' && echo 'second'");

            expect(result.stdout).toContain("first");
            expect(result.stdout).toContain("second");
            expect(result.exitCode).toBe(0);
        });

        test("command chaining with || on failure", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("false || echo 'fallback'");

            expect(result.stdout).toContain("fallback");
            expect(result.exitCode).toBe(0);
        });

        test("subshells work", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("(cd /tmp && pwd)");

            expect(result.stdout).toBe("/tmp");
        });
    });

    describe("Error Handling", () => {
        test("handles command not found", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("nonexistent_command_xyz");

            expect(result.exitCode).not.toBe(0);
            expect(result.stderr.length).toBeGreaterThan(0);
        });

        test("handles syntax errors", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const result = await service.run("echo 'unclosed quote");

            expect(result.exitCode).not.toBe(0);
        });
    });

    describe("Duration Tracking", () => {
        test("tracks command duration", async () => {
            tempRepo = createTempRepo();

            const service = createShellService({
                repoRoot: tempRepo.root,
                logger: dummyLogger,
            });

            const startTime = Date.now();
            const result = await service.run("sleep 0.1");
            const endTime = Date.now();

            expect(result.durationMs).toBeGreaterThan(0);
            expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 50);
        });
    });
});

