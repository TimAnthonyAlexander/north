import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { ScrollableTranscript } from "./ScrollableTranscript";
import { Composer } from "./Composer";
import { StatusLine } from "./StatusLine";
import { useAlternateScreen } from "./useAlternateScreen";
import { useTerminalSize } from "./useTerminalSize";
import {
    createOrchestratorWithTools,
    type Orchestrator,
    type OrchestratorState,
    type TranscriptEntry,
} from "../orchestrator/index";
import type { Logger } from "../logging/index";
import { disposeAllShellServices } from "../shell/index";
import { DEFAULT_MODEL, type CommandRegistry, type Mode } from "../commands/index";
import { markDeclined } from "../storage/profile";

interface AppProps {
    projectPath: string;
    logger: Logger;
    cursorRulesText: string | null;
    projectProfileText: string | null;
    needsLearningPrompt: boolean;
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
    onShellReviewDecision?: (decision: "run" | "always" | "auto" | "deny", command: string) => void;
    onShellRunStart?: (command: string, cwd?: string | null, timeoutMs?: number | null) => void;
    onShellRunComplete?: (
        command: string,
        exitCode: number,
        durationMs: number,
        stdoutBytes: number,
        stderrBytes: number
    ) => void;
}

export function App({
    projectPath,
    logger,
    cursorRulesText,
    projectProfileText,
    needsLearningPrompt,
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
    useAlternateScreen();
    const terminalSize = useTerminalSize();

    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
    const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);
    const [contextUsage, setContextUsage] = useState<number>(0);
    const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
    const [commandRegistry, setCommandRegistry] = useState<CommandRegistry | undefined>(undefined);
    const [nextMode, setNextMode] = useState<Mode>("agent");
    const [learningPromptId, setLearningPromptId] = useState<string | null>(null);
    const [learningInProgress, setLearningInProgress] = useState(false);
    const [learningPercent, setLearningPercent] = useState(0);
    const [learningTopic, setLearningTopic] = useState("");
    const [scrollOffset, setScrollOffset] = useState(0);
    const [composerLineCount, setComposerLineCount] = useState(1);

    useEffect(() => {
        const orch = createOrchestratorWithTools(
            {
                onStateChange(state: OrchestratorState) {
                    setTranscript(state.transcript);
                    setIsProcessing(state.isProcessing);
                    setPendingReviewId(state.pendingReviewId);
                    setCurrentModel(state.currentModel);
                    setContextUsage(state.contextUsage);
                    setLearningPromptId(state.learningPromptId);
                    setLearningInProgress(state.learningInProgress);
                    setLearningPercent(state.learningPercent);
                    setLearningTopic(state.learningTopic);
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
                projectProfileText,
            }
        );
        setOrchestrator(orch);
        setCommandRegistry(orch.getCommandRegistry());

        if (needsLearningPrompt) {
            const promptId = `learning-prompt-${Date.now()}`;
            setLearningPromptId(promptId);
        }

        return () => {
            orch.stop();
            disposeAllShellServices();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        void orchestrator.sendMessage(content, nextMode);
    }

    function handleAcceptReview(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveWriteReview(entryId, "accept");
    }

    function handleAlwaysAcceptReview(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveWriteReview(entryId, "always");
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

    function handleShellAuto(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveShellReview(entryId, "auto");
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

    function handleLearningAccept(entryId: string) {
        if (!orchestrator) return;
        orchestrator.resolveLearningPrompt(entryId, "accept");
        void orchestrator.startLearningSession();
    }

    function handleLearningDecline(entryId: string) {
        if (!orchestrator) return;
        markDeclined(projectPath);
        orchestrator.resolveLearningPrompt(entryId, "decline");
        setLearningPromptId(null);
    }

    const composerDisabled = isProcessing || pendingReviewId !== null || learningPromptId !== null;
    const inputActive = !composerDisabled;

    const composerBaseHeight = 4;
    const composerHeight = composerBaseHeight + Math.max(1, composerLineCount);
    const statusHeight = 1;
    const paddingHeight = 2;
    const viewportHeight = Math.max(
        terminalSize.rows - composerHeight - statusHeight - paddingHeight,
        10
    );
    const viewportWidth = Math.max(terminalSize.columns - 4, 40);

    useEffect(() => {
        setScrollOffset(0);
    }, [transcript.length]);

    const isScrolled = scrollOffset > 0;

    return (
        <Box flexDirection="column" height={terminalSize.rows}>
            <Box flexDirection="column" flexGrow={1} paddingX={1} marginTop={1}>
                <ScrollableTranscript
                    entries={transcript}
                    pendingReviewId={pendingReviewId}
                    currentModel={currentModel}
                    learningPromptId={learningPromptId}
                    learningInProgress={learningInProgress}
                    learningPercent={learningPercent}
                    learningTopic={learningTopic}
                    viewportHeight={viewportHeight}
                    viewportWidth={viewportWidth}
                    scrollOffset={scrollOffset}
                    onScrollChange={setScrollOffset}
                    onAcceptReview={handleAcceptReview}
                    onAlwaysAcceptReview={handleAlwaysAcceptReview}
                    onRejectReview={handleRejectReview}
                    onShellRun={handleShellRun}
                    onShellAlways={handleShellAlways}
                    onShellAuto={handleShellAuto}
                    onShellDeny={handleShellDeny}
                    onCommandSelect={handleCommandSelect}
                    onCommandCancel={handleCommandCancel}
                    onLearningAccept={handleLearningAccept}
                    onLearningDecline={handleLearningDecline}
                    inputActive={inputActive}
                />
            </Box>
            <Box paddingX={1}>
                <Composer
                    onSubmit={handleSubmit}
                    disabled={composerDisabled}
                    commandRegistry={commandRegistry}
                    mode={nextMode}
                    onModeChange={setNextMode}
                    onLineCountChange={setComposerLineCount}
                />
            </Box>
            <Box paddingX={1} marginBottom={1}>
                <StatusLine
                    model={currentModel}
                    projectPath={projectPath}
                    contextUsage={contextUsage}
                    mode={nextMode}
                    isScrolled={isScrolled}
                />
            </Box>
        </Box>
    );
}
