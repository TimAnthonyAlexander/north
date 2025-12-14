import { describe, test, expect, afterEach } from "bun:test";
import { isAllowedOrigin, validateRepoRoot } from "../src/web/security";
import { createTempRepo, type TempRepo } from "./helpers/fixtures";

let tempRepo: TempRepo | null = null;

afterEach(() => {
    if (tempRepo) {
        tempRepo.cleanup();
        tempRepo = null;
    }
});

describe("web security", () => {
    test("origin check only allows localhost/127.0.0.1 exact port", () => {
        expect(isAllowedOrigin(null, 7331)).toBe(false);
        expect(isAllowedOrigin("http://127.0.0.1:7331", 7331)).toBe(true);
        expect(isAllowedOrigin("http://localhost:7331", 7331)).toBe(true);
        expect(isAllowedOrigin("http://localhost:7332", 7331)).toBe(false);
        expect(isAllowedOrigin("https://localhost:7331", 7331)).toBe(false);
    });

    test("repoRoot defaults to allowed root when omitted", () => {
        tempRepo = createTempRepo();
        const res = validateRepoRoot(undefined, tempRepo.root);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.repoRoot.replace("/private", "")).toBe(tempRepo.root.replace("/private", ""));
        }
    });

    test("repoRoot rejects paths outside allowed root", () => {
        tempRepo = createTempRepo();
        const other = createTempRepo();

        const res = validateRepoRoot(other.root, tempRepo.root);
        expect(res.ok).toBe(false);

        other.cleanup();
    });
});
