import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { StatusLine } from "./StatusLine";
import {
  createOrchestrator,
  type Orchestrator,
  type OrchestratorState,
  type TranscriptEntry,
} from "../orchestrator/index";

interface AppProps {
  projectPath: string;
  onRequestStart: (requestId: string, model: string) => void;
  onRequestComplete: (requestId: string, durationMs: number, error?: Error) => void;
  onUserPrompt: (length: number) => void;
}

export function App({
  projectPath,
  onRequestStart,
  onRequestComplete,
  onUserPrompt,
}: AppProps) {
  const { exit } = useApp();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);

  useEffect(() => {
    const orch = createOrchestrator({
      onStateChange(state: OrchestratorState) {
        setTranscript(state.transcript);
        setIsProcessing(state.isProcessing);
      },
      onRequestStart,
      onRequestComplete,
    });
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

  const model = orchestrator?.getModel() || "claude-sonnet-4-20250514";

  return (
    <Box flexDirection="column" height="100%">
      <StatusLine model={model} projectPath={projectPath} />
      <Box flexDirection="column" flexGrow={1} paddingX={1} marginY={1}>
        <Transcript entries={transcript} />
      </Box>
      <Box paddingX={1}>
        <Composer onSubmit={handleSubmit} disabled={isProcessing} />
      </Box>
    </Box>
  );
}

