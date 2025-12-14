import { describe, test, expect } from "bun:test";
import { parseClientMessage } from "../src/web/protocol";

describe("web protocol", () => {
    test("rejects invalid JSON", () => {
        const res = parseClientMessage("{");
        expect(res.ok).toBe(false);
    });

    test("validates hello shape", () => {
        const ok = parseClientMessage(
            JSON.stringify({ type: "hello", token: "abc", protocolVersion: 1 })
        );
        expect(ok.ok).toBe(true);

        const bad = parseClientMessage(JSON.stringify({ type: "hello", protocolVersion: 1 }));
        expect(bad.ok).toBe(false);
    });

    test("validates chat.send shape", () => {
        const ok = parseClientMessage(
            JSON.stringify({
                type: "chat.send",
                sessionId: "s1",
                content: "hi",
                mode: "agent",
                attachedFiles: ["src/index.ts"],
            })
        );
        expect(ok.ok).toBe(true);

        const badMode = parseClientMessage(
            JSON.stringify({
                type: "chat.send",
                sessionId: "s1",
                content: "hi",
                mode: "nope",
            })
        );
        expect(badMode.ok).toBe(false);
    });
});

