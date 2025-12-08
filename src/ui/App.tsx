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

interface AppProps {
  projectPath: string;
  logger: Logger;
  onRequestStart: (requestId: string, model: string) => void;
  onRequestComplete: (requestId: string, durationMs: number, error?: Error) => void;
  onUserPrompt: (length: number) => void;
  onToolCallStart: (toolName: string, args: unknown) => void;
  onToolCallComplete: (toolName: string, durationMs: number, ok: boolean) => void;
  onWriteReviewShown?: (filesCount: number, toolName: string) => void;
  onWriteReviewDecision?: (decision: "accept" | "reject", filesCount: number) => void;
  onWriteApplyStart?: () => void;
  onWriteApplyComplete?: (durationMs: number, ok: boolean) => void;
}

export function App({
  projectPath,
  logger,
  onRequestStart,
  onRequestComplete,
  onUserPrompt,
  onToolCallStart,
  onToolCallComplete,
  onWriteReviewShown,
  onWriteReviewDecision,
  onWriteApplyStart,
  onWriteApplyComplete,
}: AppProps) {
  const { exit } = useApp();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);

  useEffect(() => {
    const orch = createOrchestratorWithTools(
      {
        onStateChange(state: OrchestratorState) {
          setTranscript(state.transcript);
          setIsProcessing(state.isProcessing);
          setPendingReviewId(state.pendingReviewId);
        },
        onRequestStart,
        onRequestComplete,
        onToolCallStart,
        onToolCallComplete,
        onWriteReviewShown,
        onWriteReviewDecision,
        onWriteApplyStart,
        onWriteApplyComplete,
      },
      {
        repoRoot: projectPath,
        logger,
      }
    );
    setOrchestrator(orch);
  }, []);

  useEffect(() => {
    const handleSigint = () => {
      exit();
    };
    process.on("SIGINT", handleSigint);
    return () => {
      process.off("SIGINT", handleSigint);
    };
  }, [exit]);

  function handleSubmit(content: string) {
    if (!orchestrator) return;
    onUserPrompt(content.length);
    orchestrator.sendMessage(content);
  }

  function handleAcceptReview(entryId: string) {
    if (!orchestrator) return;
    orchestrator.resolveWriteReview(entryId, "accept");
  }

  function handleRejectReview(entryId: string) {
    if (!orchestrator) return;
    orchestrator.resolveWriteReview(entryId, "reject");
  }

  const model = orchestrator?.getModel() || "claude-sonnet-4-20250514";
  const composerDisabled = isProcessing || pendingReviewId !== null;

  return (
    <Box flexDirection="column" height="100%">
      <StatusLine model={model} projectPath={projectPath} />
      <Box flexDirection="column" flexGrow={1} paddingX={1} marginY={1}>
        <Transcript
          entries={transcript}
          pendingReviewId={pendingReviewId}
          onAcceptReview={handleAcceptReview}
          onRejectReview={handleRejectReview}
        />
      </Box>
      <Box paddingX={1}>
        <Composer onSubmit={handleSubmit} disabled={composerDisabled} />
      </Box>
    </Box>
  );
}
