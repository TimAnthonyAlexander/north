import React, { useState, useEffect, useMemo, memo } from "react";
import { Box, Text, Static } from "ink";
import type {
    TranscriptEntry,
    ShellReviewStatus,
    CommandReviewStatus,
    PlanReviewStatus,
} from "../orchestrator/index";
import { DiffReview } from "./DiffReview";
import { ShellReview } from "./ShellReview";
import { CommandReview } from "./CommandReview";
import { PlanReview } from "./PlanReview";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PULSE_COLORS = ["magenta", "#ff6ec7", "#ff8fd5", "#ffa0dc", "#ff8fd5", "#ff6ec7"] as const;

const ANIMATION_DISABLE_THRESHOLD = 100;

function useSpinner(active: boolean, interval = 80) {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => {
            setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
        }, interval);
        return () => clearInterval(timer);
    }, [active, interval]);

    return active ? SPINNER_FRAMES[frame] : SPINNER_FRAMES[0];
}

function usePulse(active: boolean, colors: readonly string[], interval = 500) {
    const [colorIndex, setColorIndex] = useState(0);

    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => {
            setColorIndex((prev) => (prev + 1) % colors.length);
        }, interval);
        return () => clearInterval(timer);
    }, [active, colors.length, interval]);

    return active ? colors[colorIndex] : colors[0];
}

interface TranscriptProps {
    entries: TranscriptEntry[];
    pendingReviewId: string | null;
    onAcceptReview?: (entryId: string) => void;
    onAlwaysAcceptReview?: (entryId: string) => void;
    onRejectReview?: (entryId: string) => void;
    onShellRun?: (entryId: string) => void;
    onShellAlways?: (entryId: string) => void;
    onShellDeny?: (entryId: string) => void;
    onCommandSelect?: (entryId: string, selectedId: string) => void;
    onCommandCancel?: (entryId: string) => void;
    onPlanAccept?: (entryId: string) => void;
    onPlanRevise?: (entryId: string) => void;
    onPlanReject?: (entryId: string) => void;
}

const UserMessage = memo(function UserMessage({ content }: { content: string }) {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">
                You
            </Text>
            <Box marginLeft={2}>
                <Text wrap="wrap">{content}</Text>
            </Box>
        </Box>
    );
});

const AssistantMessage = memo(function AssistantMessage({
    content,
    isStreaming,
    animationsEnabled,
}: {
    content: string;
    isStreaming: boolean;
    animationsEnabled: boolean;
}) {
    const hasContent = content.length > 0;
    const pulseColor = usePulse(isStreaming && animationsEnabled, PULSE_COLORS, 500);

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text bold color="magenta">
                Claude
                {isStreaming && <Text color={pulseColor}> ●</Text>}
            </Text>
            {hasContent && (
                <Box marginLeft={2}>
                    <Text wrap="wrap">{content}</Text>
                </Box>
            )}
            {!hasContent && isStreaming && (
                <Box marginLeft={2}>
                    <Text color="gray">...</Text>
                </Box>
            )}
        </Box>
    );
});

const ToolMessage = memo(function ToolMessage({
    content,
    isStreaming,
    isError,
    animationsEnabled,
}: {
    content: string;
    isStreaming: boolean;
    isError: boolean;
    animationsEnabled: boolean;
}) {
    const spinner = useSpinner(isStreaming && animationsEnabled, 80);

    return (
        <Box marginLeft={2} marginBottom={0}>
            <Text color="gray">
                <Text color={isError ? "red" : "yellow"}>⚡</Text>{" "}
                <Text color={isError ? "red" : "gray"} dimColor={!isError}>
                    {content}
                </Text>
                {isStreaming && <Text color="yellow"> {spinner}</Text>}
            </Text>
        </Box>
    );
});

const CommandExecutedMessage = memo(function CommandExecutedMessage({
    commandName,
    content,
}: {
    commandName: string;
    content: string;
}) {
    return (
        <Box marginLeft={0} marginBottom={1}>
            <Text color="blue">⚙</Text>
            <Text color="gray"> /{commandName}: </Text>
            <Text color="white">{content}</Text>
        </Box>
    );
});

interface MessageBlockProps {
    entry: TranscriptEntry;
    isActiveReview: boolean;
    animationsEnabled: boolean;
    onAccept?: () => void;
    onAlways?: () => void;
    onReject?: () => void;
    onShellRun?: () => void;
    onShellAlways?: () => void;
    onShellDeny?: () => void;
    onCommandSelect?: (selectedId: string) => void;
    onCommandCancel?: () => void;
    onPlanAccept?: () => void;
    onPlanRevise?: () => void;
    onPlanReject?: () => void;
}

const MessageBlock = memo(function MessageBlock({
    entry,
    isActiveReview,
    animationsEnabled,
    onAccept,
    onAlways,
    onReject,
    onShellRun,
    onShellAlways,
    onShellDeny,
    onCommandSelect,
    onCommandCancel,
    onPlanAccept,
    onPlanRevise,
    onPlanReject,
}: MessageBlockProps) {
    if (entry.role === "user") {
        return <UserMessage content={entry.content} />;
    }

    if (entry.role === "tool") {
        const isError = entry.toolResult ? !entry.toolResult.ok : false;
        return (
            <ToolMessage
                content={entry.content}
                isStreaming={entry.isStreaming ?? false}
                isError={isError}
                animationsEnabled={animationsEnabled}
            />
        );
    }

    if (entry.role === "command_executed") {
        return (
            <CommandExecutedMessage
                commandName={entry.commandName || "command"}
                content={entry.content}
            />
        );
    }

    if (entry.role === "diff_review" && entry.diffContent) {
        const reviewStatus = entry.reviewStatus as "pending" | "accepted" | "always" | "rejected";
        return (
            <DiffReview
                diffs={entry.diffContent}
                filesCount={entry.filesCount || 0}
                toolName={entry.toolName || "edit"}
                reviewStatus={reviewStatus || "pending"}
                onAccept={onAccept}
                onAlways={onAlways}
                onReject={onReject}
                isActive={isActiveReview}
                animationsEnabled={animationsEnabled}
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
                animationsEnabled={animationsEnabled}
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

    if (entry.role === "plan_review" && entry.planText) {
        const planStatus = (entry.reviewStatus || "pending") as PlanReviewStatus;
        return (
            <PlanReview
                planText={entry.planText}
                planVersion={entry.planVersion || 1}
                status={planStatus}
                onAccept={onPlanAccept}
                onRevise={onPlanRevise}
                onReject={onPlanReject}
                isActive={isActiveReview}
                animationsEnabled={animationsEnabled}
            />
        );
    }

    return (
        <AssistantMessage
            content={entry.content}
            isStreaming={entry.isStreaming ?? false}
            animationsEnabled={animationsEnabled}
        />
    );
});

function isEntryStatic(entry: TranscriptEntry, pendingReviewId: string | null): boolean {
    if (entry.isStreaming) return false;
    if (entry.id === pendingReviewId) return false;
    if (entry.role === "diff_review" && entry.reviewStatus === "pending") return false;
    if (entry.role === "shell_review" && entry.reviewStatus === "pending") return false;
    if (entry.role === "command_review" && entry.reviewStatus === "pending") return false;
    if (entry.role === "plan_review" && entry.reviewStatus === "pending") return false;
    return true;
}

const StaticEntry = memo(function StaticEntry({ entry }: { entry: TranscriptEntry }) {
    if (entry.role === "user") {
        return <UserMessage content={entry.content} />;
    }

    if (entry.role === "tool") {
        const isError = entry.toolResult ? !entry.toolResult.ok : false;
        return (
            <ToolMessage
                content={entry.content}
                isStreaming={false}
                isError={isError}
                animationsEnabled={false}
            />
        );
    }

    if (entry.role === "command_executed") {
        return (
            <CommandExecutedMessage
                commandName={entry.commandName || "command"}
                content={entry.content}
            />
        );
    }

    if (entry.role === "diff_review" && entry.diffContent) {
        const reviewStatus = entry.reviewStatus as "pending" | "accepted" | "always" | "rejected";
        return (
            <DiffReview
                diffs={entry.diffContent}
                filesCount={entry.filesCount || 0}
                toolName={entry.toolName || "edit"}
                reviewStatus={reviewStatus || "pending"}
                isActive={false}
                animationsEnabled={false}
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
                isActive={false}
                animationsEnabled={false}
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
                isActive={false}
            />
        );
    }

    if (entry.role === "plan_review" && entry.planText) {
        const planStatus = (entry.reviewStatus || "pending") as PlanReviewStatus;
        return (
            <PlanReview
                planText={entry.planText}
                planVersion={entry.planVersion || 1}
                status={planStatus}
                isActive={false}
                animationsEnabled={false}
            />
        );
    }

    return (
        <AssistantMessage
            content={entry.content}
            isStreaming={false}
            animationsEnabled={false}
        />
    );
});

export function Transcript({
    entries,
    pendingReviewId,
    onAcceptReview,
    onAlwaysAcceptReview,
    onRejectReview,
    onShellRun,
    onShellAlways,
    onShellDeny,
    onCommandSelect,
    onCommandCancel,
    onPlanAccept,
    onPlanRevise,
    onPlanReject,
}: TranscriptProps) {
    const animationsEnabled = entries.length < ANIMATION_DISABLE_THRESHOLD;

    const { staticEntries, dynamicEntries } = useMemo(() => {
        const staticList: TranscriptEntry[] = [];
        const dynamicList: TranscriptEntry[] = [];

        for (const entry of entries) {
            if (isEntryStatic(entry, pendingReviewId)) {
                staticList.push(entry);
            } else {
                dynamicList.push(entry);
            }
        }

        return { staticEntries: staticList, dynamicEntries: dynamicList };
    }, [entries, pendingReviewId]);

    if (entries.length === 0) {
        return (
            <Box marginBottom={1}>
                <Text color="#999999">Start a conversation by typing below.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            <Static items={staticEntries}>
                {(entry) => <StaticEntry key={entry.id} entry={entry} />}
            </Static>
            {dynamicEntries.map((entry) => {
                const isActive = entry.id === pendingReviewId;
                return (
                    <MessageBlock
                        key={entry.id}
                        entry={entry}
                        isActiveReview={isActive}
                        animationsEnabled={animationsEnabled}
                        onAccept={isActive ? () => onAcceptReview?.(entry.id) : undefined}
                        onAlways={isActive ? () => onAlwaysAcceptReview?.(entry.id) : undefined}
                        onReject={isActive ? () => onRejectReview?.(entry.id) : undefined}
                        onShellRun={isActive ? () => onShellRun?.(entry.id) : undefined}
                        onShellAlways={isActive ? () => onShellAlways?.(entry.id) : undefined}
                        onShellDeny={isActive ? () => onShellDeny?.(entry.id) : undefined}
                        onCommandSelect={
                            isActive ? (id) => onCommandSelect?.(entry.id, id) : undefined
                        }
                        onCommandCancel={isActive ? () => onCommandCancel?.(entry.id) : undefined}
                        onPlanAccept={isActive ? () => onPlanAccept?.(entry.id) : undefined}
                        onPlanRevise={isActive ? () => onPlanRevise?.(entry.id) : undefined}
                        onPlanReject={isActive ? () => onPlanReject?.(entry.id) : undefined}
                    />
                );
            })}
        </Box>
    );
}
