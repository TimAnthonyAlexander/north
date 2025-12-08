import React from "react";
import { Box, Text } from "ink";
import type { TranscriptEntry } from "../orchestrator/index";
import { DiffReview } from "./DiffReview";

interface TranscriptProps {
    entries: TranscriptEntry[];
    pendingReviewId: string | null;
    onAcceptReview?: (entryId: string) => void;
    onRejectReview?: (entryId: string) => void;
}

function UserMessage({ entry }: { entry: TranscriptEntry }) {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">
                You
            </Text>
            <Box marginLeft={2}>
                <Text wrap="wrap">{entry.content}</Text>
            </Box>
        </Box>
    );
}

function AssistantMessage({ entry }: { entry: TranscriptEntry }) {
    const hasContent = entry.content.length > 0;

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text bold color="magenta">
                Claude
                {entry.isStreaming && <Text color="gray"> ●</Text>}
            </Text>
            {hasContent && (
                <Box marginLeft={2}>
                    <Text wrap="wrap">{entry.content}</Text>
                </Box>
            )}
            {!hasContent && entry.isStreaming && (
                <Box marginLeft={2}>
                    <Text color="gray">...</Text>
                </Box>
            )}
        </Box>
    );
}

function ToolMessage({ entry }: { entry: TranscriptEntry }) {
    const isError = entry.toolResult && !entry.toolResult.ok;

    return (
        <Box marginLeft={2} marginBottom={0}>
            <Text color="gray">
                <Text color={isError ? "red" : "yellow"}>⚡</Text>{" "}
                <Text color={isError ? "red" : "gray"} dimColor={!isError}>
                    {entry.content}
                </Text>
                {entry.isStreaming && <Text color="gray"> ●</Text>}
            </Text>
        </Box>
    );
}

interface MessageBlockProps {
    entry: TranscriptEntry;
    isActiveReview: boolean;
    onAccept?: () => void;
    onReject?: () => void;
}

function MessageBlock({ entry, isActiveReview, onAccept, onReject }: MessageBlockProps) {
    if (entry.role === "user") {
        return <UserMessage entry={entry} />;
    }

    if (entry.role === "tool") {
        return <ToolMessage entry={entry} />;
    }

    if (entry.role === "diff_review" && entry.diffContent) {
        return (
            <DiffReview
                diffs={entry.diffContent}
                filesCount={entry.filesCount || 0}
                toolName={entry.toolName || "edit"}
                reviewStatus={entry.reviewStatus || "pending"}
                onAccept={onAccept}
                onReject={onReject}
                isActive={isActiveReview}
            />
        );
    }

    return <AssistantMessage entry={entry} />;
}

export function Transcript({
    entries,
    pendingReviewId,
    onAcceptReview,
    onRejectReview,
}: TranscriptProps) {
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
                <MessageBlock
                    key={entry.id}
                    entry={entry}
                    isActiveReview={entry.id === pendingReviewId}
                    onAccept={entry.id === pendingReviewId ? () => onAcceptReview?.(entry.id) : undefined}
                    onReject={entry.id === pendingReviewId ? () => onRejectReview?.(entry.id) : undefined}
                />
            ))}
        </Box>
    );
}
