import React from "react";
import { Box, Text } from "ink";
import type { TranscriptEntry } from "../orchestrator/index";

interface TranscriptProps {
  entries: TranscriptEntry[];
}

function MessageBlock({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === "user";
  const label = isUser ? "You" : "Claude";
  const labelColor = isUser ? "cyan" : "magenta";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={labelColor}>
        {label}
        {entry.isStreaming && <Text color="gray"> ●</Text>}
      </Text>
      <Box marginLeft={2}>
        <Text wrap="wrap">{entry.content || (entry.isStreaming ? "..." : "")}</Text>
      </Box>
    </Box>
  );
}

export function Transcript({ entries }: TranscriptProps) {
  if (entries.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color="gray">Start a conversation by typing below.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <MessageBlock key={entry.id} entry={entry} />
      ))}
    </Box>
  );
}

