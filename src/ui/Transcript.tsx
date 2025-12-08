import React from "react";
import { Box, Text } from "ink";
import type { TranscriptEntry, ShellReviewStatus, CommandReviewStatus } from "../orchestrator/index";
import { DiffReview } from "./DiffReview";
import { ShellReview } from "./ShellReview";
import { CommandReview } from "./CommandReview";

interface TranscriptProps {
    entries: TranscriptEntry[];
    pendingReviewId: string | null;
    onAcceptReview?: (entryId: string) => void;
    onRejectReview?: (entryId: string) => void;
    onShellRun?: (entryId: string) => void;
    onShellAlways?: (entryId: string) => void;
    onShellDeny?: (entryId: string) => void;
    onCommandSelect?: (entryId: string, selectedId: string) => void;
    onCommandCancel?: (entryId: string) => void;
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

function CommandExecutedMessage({ entry }: { entry: TranscriptEntry }) {
    return (
        <Box marginLeft={0} marginBottom={1}>
            <Text color="blue">⚙</Text>
            <Text color="gray"> /{entry.commandName}: </Text>
            <Text color="white">{entry.content}</Text>
        </Box>
    );
}

interface MessageBlockProps {
    entry: TranscriptEntry;
    isActiveReview: boolean;
    onAccept?: () => void;
    onReject?: () => void;
    onShellRun?: () => void;
    onShellAlways?: () => void;
    onShellDeny?: () => void;
    onCommandSelect?: (selectedId: string) => void;
    onCommandCancel?: () => void;
}

function MessageBlock({
    entry,
    isActiveReview,
    onAccept,
    onReject,
    onShellRun,
    onShellAlways,
    onShellDeny,
    onCommandSelect,
    onCommandCancel,
}: MessageBlockProps) {
    if (entry.role === "user") {
        return <UserMessage entry={entry} />;
    }

    if (entry.role === "tool") {
        return <ToolMessage entry={entry} />;
    }

    if (entry.role === "command_executed") {
        return <CommandExecutedMessage entry={entry} />;
    }

    if (entry.role === "diff_review" && entry.diffContent) {
        const reviewStatus = entry.reviewStatus as "pending" | "accepted" | "rejected";
        return (
            <DiffReview
                diffs={entry.diffContent}
                filesCount={entry.filesCount || 0}
                toolName={entry.toolName || "edit"}
                reviewStatus={reviewStatus || "pending"}
                onAccept={onAccept}
                onReject={onReject}
                isActive={isActiveReview}
            />
        );
    }

    if (entry.role === "shell_review" && entry.shellCommand) {
        const shellStatus = (entry.reviewStatus || "pending") as ShellReviewStatus;
        return (
            <ShellReview
                command={entry.shellCommand}
                cwd={entry.shellCwd || undefined}
                status={shellStatus}
                onRun={onShellRun}
                onAlways={onShellAlways}
                onDeny={onShellDeny}
                isActive={isActiveReview}
            />
        );
    }

    if (entry.role === "command_review" && entry.commandOptions) {
        const commandStatus = (entry.reviewStatus || "pending") as CommandReviewStatus;
        return (
            <CommandReview
                commandName={entry.commandName || "command"}
                prompt={entry.commandPrompt || "Select an option"}
                options={entry.commandOptions}
                status={commandStatus}
                selectedId={entry.commandSelectedId}
                onSelect={onCommandSelect}
                onCancel={onCommandCancel}
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
    onShellRun,
    onShellAlways,
    onShellDeny,
    onCommandSelect,
    onCommandCancel,
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
            {entries.map((entry) => {
                const isActive = entry.id === pendingReviewId;
                return (
                    <MessageBlock
                        key={entry.id}
                        entry={entry}
                        isActiveReview={isActive}
                        onAccept={isActive ? () => onAcceptReview?.(entry.id) : undefined}
                        onReject={isActive ? () => onRejectReview?.(entry.id) : undefined}
                        onShellRun={isActive ? () => onShellRun?.(entry.id) : undefined}
                        onShellAlways={isActive ? () => onShellAlways?.(entry.id) : undefined}
                        onShellDeny={isActive ? () => onShellDeny?.(entry.id) : undefined}
                        onCommandSelect={isActive ? (id) => onCommandSelect?.(entry.id, id) : undefined}
                        onCommandCancel={isActive ? () => onCommandCancel?.(entry.id) : undefined}
                    />
                );
            })}
        </Box>
    );
}
