import { describe, test, expect, afterEach } from "bun:test";
import {
    isCommandAllowed,
    allowCommand,
    getAllowedCommands,
} from "../src/storage/allowlist";
import {
    isEditsAutoAcceptEnabled,
    enableEditsAutoAccept,
    disableEditsAutoAccept,
} from "../src/storage/autoaccept";
import { getSavedModel, saveSelectedModel } from "../src/storage/config";
import { createTempRepo, type TempRepo } from "./helpers/fixtures";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempRepo: TempRepo | null = null;
let tempConfigDir: string | null = null;
let originalConfigDir: string | undefined = undefined;

afterEach(() => {
    if (tempRepo) {
        tempRepo.cleanup();
        tempRepo = null;
    }
    if (tempConfigDir) {
        Bun.spawnSync(["rm", "-rf", tempConfigDir]);
        tempConfigDir = null;
    }
    if (originalConfigDir !== undefined) {
        if (originalConfigDir) {
            process.env.NORTH_CONFIG_DIR = originalConfigDir;
        } else {
            delete process.env.NORTH_CONFIG_DIR;
        }
        originalConfigDir = undefined;
    }
});

describe("Allowlist Storage", () => {
    describe("Exact String Matching", () => {
        test("exact string match returns true", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "npm test");

            expect(isCommandAllowed(tempRepo.root, "npm test")).toBe(true);
        });

        test("similar but not exact string returns false", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "npm test");

            expect(isCommandAllowed(tempRepo.root, "npm tests")).toBe(false);
            expect(isCommandAllowed(tempRepo.root, "pnpm test")).toBe(false);
            expect(isCommandAllowed(tempRepo.root, "npm test --watch")).toBe(false);
        });

        test("case-sensitive matching", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "npm Test");

            expect(isCommandAllowed(tempRepo.root, "npm Test")).toBe(true);
            expect(isCommandAllowed(tempRepo.root, "npm test")).toBe(false);
        });

        test("whitespace is trimmed before matching", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "  npm test  ");

            expect(isCommandAllowed(tempRepo.root, "npm test")).toBe(true);
            expect(isCommandAllowed(tempRepo.root, "  npm test  ")).toBe(true);
        });
    });

    describe("File Creation and Persistence", () => {
        test("creates .north directory on first write", () => {
            tempRepo = createTempRepo();

            expect(existsSync(join(tempRepo.root, ".north"))).toBe(false);

            allowCommand(tempRepo.root, "test command");

            expect(existsSync(join(tempRepo.root, ".north"))).toBe(true);
            expect(existsSync(join(tempRepo.root, ".north/allowlist.json"))).toBe(true);
        });

        test("persists commands across instances", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "cmd1");
            allowCommand(tempRepo.root, "cmd2");

            const commands = getAllowedCommands(tempRepo.root);

            expect(commands).toContain("cmd1");
            expect(commands).toContain("cmd2");
        });

        test("reads after write returns same list", () => {
            tempRepo = createTempRepo();

            const testCommands = ["npm test", "bun build", "git status"];

            for (const cmd of testCommands) {
                allowCommand(tempRepo.root, cmd);
            }

            const retrieved = getAllowedCommands(tempRepo.root);

            expect(retrieved.sort()).toEqual(testCommands.sort());
        });

        test("duplicate commands are not added twice", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "npm test");
            allowCommand(tempRepo.root, "npm test");
            allowCommand(tempRepo.root, "npm test");

            const commands = getAllowedCommands(tempRepo.root);

            expect(commands).toEqual(["npm test"]);
        });
    });

    describe("Separate Repo Roots", () => {
        test("different repos have separate allowlists", () => {
            const repo1 = createTempRepo();
            const repo2 = createTempRepo();

            allowCommand(repo1.root, "cmd1");
            allowCommand(repo2.root, "cmd2");

            expect(isCommandAllowed(repo1.root, "cmd1")).toBe(true);
            expect(isCommandAllowed(repo1.root, "cmd2")).toBe(false);

            expect(isCommandAllowed(repo2.root, "cmd2")).toBe(true);
            expect(isCommandAllowed(repo2.root, "cmd1")).toBe(false);

            repo1.cleanup();
            repo2.cleanup();
        });

        test("modifying one repo does not affect another", () => {
            const repo1 = createTempRepo();
            const repo2 = createTempRepo();

            allowCommand(repo1.root, "shared-cmd");
            allowCommand(repo2.root, "shared-cmd");

            allowCommand(repo1.root, "repo1-only");

            expect(getAllowedCommands(repo1.root).length).toBe(2);
            expect(getAllowedCommands(repo2.root).length).toBe(1);

            repo1.cleanup();
            repo2.cleanup();
        });
    });

    describe("Error Handling", () => {
        test("handles missing file gracefully", () => {
            tempRepo = createTempRepo();

            expect(isCommandAllowed(tempRepo.root, "anything")).toBe(false);
            expect(getAllowedCommands(tempRepo.root)).toEqual([]);
        });

        test("handles corrupted JSON gracefully", () => {
            tempRepo = createTempRepo();

            const northDir = join(tempRepo.root, ".north");
            Bun.spawnSync(["mkdir", "-p", northDir]);
            writeFileSync(join(northDir, "allowlist.json"), "{ invalid json", "utf-8");

            expect(isCommandAllowed(tempRepo.root, "test")).toBe(false);
            expect(getAllowedCommands(tempRepo.root)).toEqual([]);
        });

        test("handles non-array allowedCommands", () => {
            tempRepo = createTempRepo();

            const northDir = join(tempRepo.root, ".north");
            Bun.spawnSync(["mkdir", "-p", northDir]);
            writeFileSync(
                join(northDir, "allowlist.json"),
                JSON.stringify({ allowedCommands: "not an array" }),
                "utf-8"
            );

            expect(getAllowedCommands(tempRepo.root)).toEqual([]);
        });
    });

    describe("Format Stability", () => {
        test("writes formatted JSON with newline", () => {
            tempRepo = createTempRepo();

            allowCommand(tempRepo.root, "test");

            const content = readFileSync(
                join(tempRepo.root, ".north/allowlist.json"),
                "utf-8"
            );

            expect(content.endsWith("\n")).toBe(true);

            const parsed = JSON.parse(content);
            expect(parsed).toHaveProperty("allowedCommands");
            expect(Array.isArray(parsed.allowedCommands)).toBe(true);
        });
    });
});

describe("AutoAccept Storage", () => {
    describe("Default Behavior", () => {
        test("default is false when file does not exist", () => {
            tempRepo = createTempRepo();

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(false);
        });
    });

    describe("Enable/Disable", () => {
        test("enable writes file and returns true", () => {
            tempRepo = createTempRepo();

            enableEditsAutoAccept(tempRepo.root);

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(true);
            expect(existsSync(join(tempRepo.root, ".north/autoaccept.json"))).toBe(true);
        });

        test("disable sets to false", () => {
            tempRepo = createTempRepo();

            enableEditsAutoAccept(tempRepo.root);
            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(true);

            disableEditsAutoAccept(tempRepo.root);
            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(false);
        });

        test("disable creates file if it does not exist", () => {
            tempRepo = createTempRepo();

            disableEditsAutoAccept(tempRepo.root);

            expect(existsSync(join(tempRepo.root, ".north/autoaccept.json"))).toBe(true);
            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(false);
        });
    });

    describe("Persistence", () => {
        test("persists across instances", () => {
            tempRepo = createTempRepo();

            enableEditsAutoAccept(tempRepo.root);

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(true);
        });

        test("toggling multiple times persists final state", () => {
            tempRepo = createTempRepo();

            enableEditsAutoAccept(tempRepo.root);
            disableEditsAutoAccept(tempRepo.root);
            enableEditsAutoAccept(tempRepo.root);

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(true);
        });
    });

    describe("Separate Repo Roots", () => {
        test("different repos have independent settings", () => {
            const repo1 = createTempRepo();
            const repo2 = createTempRepo();

            enableEditsAutoAccept(repo1.root);

            expect(isEditsAutoAcceptEnabled(repo1.root)).toBe(true);
            expect(isEditsAutoAcceptEnabled(repo2.root)).toBe(false);

            repo1.cleanup();
            repo2.cleanup();
        });
    });

    describe("Error Handling", () => {
        test("handles corrupted JSON gracefully", () => {
            tempRepo = createTempRepo();

            const northDir = join(tempRepo.root, ".north");
            Bun.spawnSync(["mkdir", "-p", northDir]);
            writeFileSync(join(northDir, "autoaccept.json"), "{ invalid", "utf-8");

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(false);
        });

        test("handles non-boolean value", () => {
            tempRepo = createTempRepo();

            const northDir = join(tempRepo.root, ".north");
            Bun.spawnSync(["mkdir", "-p", northDir]);
            writeFileSync(
                join(northDir, "autoaccept.json"),
                JSON.stringify({ editsAutoAccept: "yes" }),
                "utf-8"
            );

            expect(isEditsAutoAcceptEnabled(tempRepo.root)).toBe(true);
        });
    });

    describe("Format Stability", () => {
        test("writes formatted JSON with newline", () => {
            tempRepo = createTempRepo();

            enableEditsAutoAccept(tempRepo.root);

            const content = readFileSync(
                join(tempRepo.root, ".north/autoaccept.json"),
                "utf-8"
            );

            expect(content.endsWith("\n")).toBe(true);

            const parsed = JSON.parse(content);
            expect(parsed).toHaveProperty("editsAutoAccept");
            expect(typeof parsed.editsAutoAccept).toBe("boolean");
        });
    });
});

describe("Global Config Storage", () => {
    function createTempConfigDir(): string {
        if (originalConfigDir === undefined) {
            originalConfigDir = process.env.NORTH_CONFIG_DIR || "";
        }
        const dir = join(tmpdir(), `north-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        process.env.NORTH_CONFIG_DIR = dir;
        return dir;
    }

    describe("Read/Write Stability", () => {
        test("save and read model persists correctly", () => {
            tempConfigDir = createTempConfigDir();

            saveSelectedModel("claude-sonnet-4-20250514");

            const retrieved = getSavedModel();

            expect(retrieved).toBe("claude-sonnet-4-20250514");
        });

        test("returns null when no model saved", () => {
            tempConfigDir = createTempConfigDir();

            const retrieved = getSavedModel();

            expect(retrieved).toBeNull();
        });

        test("overwrites previous model", () => {
            tempConfigDir = createTempConfigDir();

            saveSelectedModel("model1");
            saveSelectedModel("model2");

            const retrieved = getSavedModel();

            expect(retrieved).toBe("model2");
        });
    });

    describe("Schema Tolerance", () => {
        test("ignores unknown fields", () => {
            tempConfigDir = createTempConfigDir();

            const configPath = join(tempConfigDir, "config.json");
            Bun.spawnSync(["mkdir", "-p", tempConfigDir]);

            writeFileSync(
                configPath,
                JSON.stringify({
                    selectedModel: "my-model",
                    unknownField: "should be ignored",
                    anotherField: 123,
                }),
                "utf-8"
            );

            const retrieved = getSavedModel();

            expect(retrieved).toBe("my-model");
        });

        test("handles missing config file", () => {
            tempConfigDir = createTempConfigDir();

            const retrieved = getSavedModel();

            expect(retrieved).toBeNull();
        });

        test("handles corrupted JSON gracefully", () => {
            tempConfigDir = createTempConfigDir();

            const configPath = join(tempConfigDir, "config.json");
            Bun.spawnSync(["mkdir", "-p", tempConfigDir]);
            writeFileSync(configPath, "{ invalid json", "utf-8");

            const retrieved = getSavedModel();

            expect(retrieved).toBeNull();
        });
    });

    describe("Directory Creation", () => {
        test("creates config directory on first write", () => {
            tempConfigDir = createTempConfigDir();

            expect(existsSync(tempConfigDir)).toBe(false);

            saveSelectedModel("test-model");

            expect(existsSync(tempConfigDir)).toBe(true);
            expect(existsSync(join(tempConfigDir, "config.json"))).toBe(true);
        });
    });

    describe("Format Stability", () => {
        test("writes formatted JSON with newline", () => {
            tempConfigDir = createTempConfigDir();

            saveSelectedModel("test-model");

            const configPath = join(tempConfigDir, "config.json");
            const content = readFileSync(configPath, "utf-8");

            expect(content.endsWith("\n")).toBe(true);

            const parsed = JSON.parse(content);
            expect(parsed).toHaveProperty("selectedModel");
        });
    });
});

