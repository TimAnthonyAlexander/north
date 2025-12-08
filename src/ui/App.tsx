import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { StatusLine } from "./StatusLine";
import {
    createOrchestratorWithTools,
    type Orchestrator,
    type OrchestratorState,
    type TranscriptEntry,
} from "../orchestrator/index";
import type { Logger } from "../logging/index";
import { disposeAllShellServices } from "../shell/index";
import type { CommandRegistry } from "../commands/index";

interface AppProps {
    projectPath: string;
    logger: Logger;
    cursorRulesText: string | null;
    onRequestStart: (requestId: string, model: string) => void;
    onRequestComplete: (requestId: string, durationMs: number, error?: Error) => void;
    onUserPrompt: (length: number) => void;
    onToolCallStart: (toolName: string, args: unknown) => void;
    onToolCallComplete: (toolName: string, durationMs: number, ok: boolean) => void;
    onWriteReviewShown?: (filesCount: number, toolName: string) => void;
    onWriteReviewDecision?: (decision: "accept" | "reject", filesCount: number) => void;
    onWriteApplyStart?: () => void;
    onWriteApplyComplete?: (durationMs: number, ok: boolean) => void;
    onShellReviewShown?: (command: string, cwd?: string | null, timeoutMs?: number | null) => void;
    onShellReviewDecision?: (decision: "run" | "always" | "deny", command: string) => void;
    onShellRunStart?: (command: string, cwd?: string | null, timeoutMs?: number | null) => void;
    onShellRunComplete?: (command: string, exitCode: number, durationMs: number, stdoutBytes: number, stderrBytes: number) => void;
}

export function App({
    projectPath,
    logger,
    cursorRulesText,
    onRequestStart,
    onRequestComplete,
    onUserPrompt,
    onToolCallStart,
    onToolCallComplete,
    onWriteReviewShown,
    onWriteReviewDecision,
    onWriteApplyStart,
    onWriteApplyComplete,
    onShellReviewShown,
    onShellReviewDecision,
    onShellRunStart,
    onShellRunComplete,
}: AppProps) {
    const { exit } = useApp();
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
    const [currentModel, setCurrentModel] = useState<string>("claude-sonnet-4-20250514");
    const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
    const [commandRegistry, setCommandRegistry] = useState<CommandRegistry | undefined>(undefined);

    useEffect(() => {
        const orch = createOrchestratorWithTools(
            {
                onStateChange(state: OrchestratorState) {
                    setTranscript(state.transcript);
                    setIsProcessing(state.isProcessing);
                    setPendingReviewId(state.pendingReviewId);
                    setCurrentModel(state.currentModel);
                },
                onRequestStart,
                onRequestComplete,
                onToolCallStart,
                onToolCallComplete,
                onWriteReviewShown,
                onWriteReviewDecision,
                onWriteApplyStart,
                onWriteApplyComplete,
                onShellReviewShown,
                onShellReviewDecision,
                onShellRunStart,
                onShellRunComplete,
                onExit() {
                    disposeAllShellServices();
                    exit();
                },
            },
            {
                repoRoot: projectPath,
                logger,
                cursorRulesText,
            }
        );
        setOrchestrator(orch);
        setCommandRegistry(orch.getCommandRegistry());

        return () => {
            orch.stop();
            disposeAllShellServices();
        };
    }, []);

    useEffect(() => {
        const handleSigint = () => {
            if (orchestrator?.isProcessing()) {
                orchestrator.cancel();
            } else {
                orchestrator?.stop();
                disposeAllShellServices();
                exit();
            }
        };
        process.on("SIGINT", handleSigint);
        return () => {
            process.off("SIGINT", handleSigint);
        };
    }, [exit, orchestrator]);

    function handleSubmit(content: string) {
        if (!orchestrator) return;
        onUserPrompt(content.length);
        void orchestrator.sendMessage(content);
    }

    function handleAcceptReview(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveWriteReview(entryId, "accept");
    }

    function handleRejectReview(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveWriteReview(entryId, "reject");
    }

    function handleShellRun(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveShellReview(entryId, "run");
    }

    function handleShellAlways(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveShellReview(entryId, "always");
    }

    function handleShellDeny(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveShellReview(entryId, "deny");
    }

    function handleCommandSelect(entryId: string, selectedId: string) {
        if (!orchestrator) return;
        orchestrator.resolveCommandReview(entryId, selectedId);
    }

    function handleCommandCancel(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveCommandReview(entryId, null);
    }

    const composerDisabled = isProcessing || pendingReviewId !== null;

    return (
        <Box flexDirection="column" height="100%">
            <StatusLine model={currentModel} projectPath={projectPath} />
            <Box flexDirection="column" flexGrow={1} paddingX={1} marginY={1}>
                <Transcript
                    entries={transcript}
                    pendingReviewId={pendingReviewId}
                    onAcceptReview={handleAcceptReview}
                    onRejectReview={handleRejectReview}
                    onShellRun={handleShellRun}
                    onShellAlways={handleShellAlways}
                    onShellDeny={handleShellDeny}
                    onCommandSelect={handleCommandSelect}
                    onCommandCancel={handleCommandCancel}
                />
            </Box>
            <Box paddingX={1}>
                <Composer
                    onSubmit={handleSubmit}
                    disabled={composerDisabled}
                    commandRegistry={commandRegistry}
                />
            </Box>
        </Box>
    );
}
