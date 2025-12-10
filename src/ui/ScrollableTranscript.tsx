import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import wrapAnsi from "wrap-ansi";
import type {
    TranscriptEntry,
    ShellReviewStatus,
    CommandReviewStatus,
} from "../orchestrator/index";
import { DiffReview } from "./DiffReview";
import { ShellReview } from "./ShellReview";
import { CommandReview } from "./CommandReview";
import { LearningPrompt } from "./LearningPrompt";
import { LearningProgress } from "./LearningProgress";
import { getAssistantName } from "../commands/models";

const ANSI_CYAN = "\x1b[36m";
const ANSI_MAGENTA = "\x1b[35m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RED = "\x1b[31m";
const ANSI_GRAY = "\x1b[90m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_RESET = "\x1b[0m";

interface WrappedEntry {
    id: string;
    lines: string[];
    role: TranscriptEntry["role"];
    entry: TranscriptEntry;
    isInteractive: boolean;
}

function wrapText(text: string, width: number): string[] {
    if (width <= 0) return [text];
    const wrapped = wrapAnsi(text, width, { hard: true, trim: false });
    return wrapped.split("\n");
}

function entryToLines(
    entry: TranscriptEntry,
    width: number,
    assistantName: string
): { lines: string[]; isInteractive: boolean } {
    const contentWidth = Math.max(width - 4, 20);

    if (entry.role === "user") {
        const header = `${ANSI_CYAN}${ANSI_BOLD}You${ANSI_RESET}`;
        const contentLines = wrapText(entry.content, contentWidth).map((line) => `  ${line}`);
        return { lines: [header, ...contentLines, ""], isInteractive: false };
    }

    if (entry.role === "assistant") {
        const streamingDot = entry.isStreaming ? ` ${ANSI_MAGENTA}●${ANSI_RESET}` : "";
        const header = `${ANSI_MAGENTA}${ANSI_BOLD}${assistantName}${ANSI_RESET}${streamingDot}`;
        const allLines: string[] = [header];

        const hasThinking = entry.thinkingContent && entry.thinkingContent.length > 0;
        const showThinkingContent = hasThinking && (entry.thinkingVisible === true || (entry.isStreaming && entry.thinkingVisible !== false));

        if (showThinkingContent && entry.thinkingContent) {
            const thinkingLines = wrapText(entry.thinkingContent, contentWidth).map(
                (line) => `  ${ANSI_GRAY}💭 ${line}${ANSI_RESET}`
            );
            allLines.push(...thinkingLines);
        } else if (hasThinking && !entry.thinkingVisible && !entry.isStreaming) {
            allLines.push(`  ${ANSI_GRAY}💭 [thinking collapsed]${ANSI_RESET}`);
        }

        if (entry.content) {
            const contentLines = wrapText(entry.content, contentWidth).map((line) => `  ${line}`);
            allLines.push(...contentLines);
        } else if (!hasThinking && entry.isStreaming) {
            allLines.push(`  ${ANSI_GRAY}Thinking...${ANSI_RESET}`);
        }

        allLines.push("");
        return { lines: allLines, isInteractive: false };
    }

    if (entry.role === "tool") {
        const isError = entry.toolResult ? !entry.toolResult.ok : false;
        const icon = isError ? `${ANSI_RED}⚡${ANSI_RESET}` : `${ANSI_YELLOW}⚡${ANSI_RESET}`;
        const textColor = isError ? ANSI_RED : ANSI_GRAY;
        const spinner = entry.isStreaming ? ` ${ANSI_YELLOW}⠋${ANSI_RESET}` : "";
        const line = `  ${icon} ${textColor}${entry.content}${ANSI_RESET}${spinner}`;
        return { lines: [line], isInteractive: false };
    }

    if (entry.role === "command_executed") {
        const line = `${ANSI_BLUE}⚙${ANSI_RESET} ${ANSI_GRAY}/${entry.commandName || "command"}: ${ANSI_RESET}${entry.content}`;
        return { lines: [line, ""], isInteractive: false };
    }

    if (entry.role === "diff_review") {
        const status = entry.reviewStatus || "pending";
        if (status === "pending") {
            return { lines: [], isInteractive: true };
        }
        const statusText =
            status === "accepted"
                ? `${ANSI_YELLOW}📝${ANSI_RESET} ${ANSI_GRAY}${entry.toolName || "edit"} — ${entry.filesCount || 0} file(s)${ANSI_RESET} → ${ANSI_BOLD}Applied${ANSI_RESET}`
                : status === "always"
                  ? `${ANSI_YELLOW}📝${ANSI_RESET} ${ANSI_GRAY}${entry.toolName || "edit"} — ${entry.filesCount || 0} file(s)${ANSI_RESET} → ${ANSI_CYAN}Auto-applied${ANSI_RESET}`
                  : `${ANSI_YELLOW}📝${ANSI_RESET} ${ANSI_GRAY}${entry.toolName || "edit"} — ${entry.filesCount || 0} file(s)${ANSI_RESET} → ${ANSI_RED}Rejected${ANSI_RESET}`;
        return { lines: [`  ${statusText}`, ""], isInteractive: false };
    }

    if (entry.role === "shell_review") {
        const status = entry.reviewStatus || "pending";
        if (status === "pending") {
            return { lines: [], isInteractive: true };
        }
        const cmd = entry.shellCommand || "command";
        const truncatedCmd = cmd.length > 50 ? cmd.slice(0, 47) + "..." : cmd;
        const statusText =
            status === "ran"
                ? `${ANSI_YELLOW}🖥️${ANSI_RESET} ${ANSI_GRAY}$ ${truncatedCmd}${ANSI_RESET} → ${ANSI_BOLD}Executed${ANSI_RESET}`
                : status === "always"
                  ? `${ANSI_YELLOW}🖥️${ANSI_RESET} ${ANSI_GRAY}$ ${truncatedCmd}${ANSI_RESET} → ${ANSI_BOLD}Executed (allowlisted)${ANSI_RESET}`
                  : status === "auto"
                    ? `${ANSI_YELLOW}🖥️${ANSI_RESET} ${ANSI_GRAY}$ ${truncatedCmd}${ANSI_RESET} → ${ANSI_CYAN}Auto-approved${ANSI_RESET}`
                    : `${ANSI_YELLOW}🖥️${ANSI_RESET} ${ANSI_GRAY}$ ${truncatedCmd}${ANSI_RESET} → ${ANSI_RED}Denied${ANSI_RESET}`;
        return { lines: [`  ${statusText}`, ""], isInteractive: false };
    }

    if (entry.role === "command_review") {
        const status = entry.reviewStatus || "pending";
        if (status === "pending") {
            return { lines: [], isInteractive: true };
        }
        const selectedText = entry.commandSelectedId
            ? `${ANSI_BLUE}⚙${ANSI_RESET} ${ANSI_GRAY}/${entry.commandName || "command"}${ANSI_RESET} → ${ANSI_BOLD}${entry.commandSelectedId}${ANSI_RESET}`
            : `${ANSI_BLUE}⚙${ANSI_RESET} ${ANSI_GRAY}/${entry.commandName || "command"}${ANSI_RESET} → ${ANSI_RED}Cancelled${ANSI_RESET}`;
        return { lines: [`  ${selectedText}`, ""], isInteractive: false };
    }

    if (entry.role === "learning_prompt") {
        return { lines: [], isInteractive: true };
    }

    if (entry.role === "learning_progress") {
        return { lines: [], isInteractive: true };
    }

    return { lines: [], isInteractive: false };
}

interface ScrollableTranscriptProps {
    entries: TranscriptEntry[];
    pendingReviewId: string | null;
    currentModel: string;
    learningPromptId: string | null;
    learningInProgress: boolean;
    learningPercent: number;
    learningTopic: string;
    viewportHeight: number;
    viewportWidth: number;
    scrollOffset: number;
    onScrollChange: (offset: number) => void;
    onAcceptReview?: (entryId: string) => void;
    onAlwaysAcceptReview?: (entryId: string) => void;
    onRejectReview?: (entryId: string) => void;
    onShellRun?: (entryId: string) => void;
    onShellAlways?: (entryId: string) => void;
    onShellAuto?: (entryId: string) => void;
    onShellDeny?: (entryId: string) => void;
    onCommandSelect?: (entryId: string, selectedId: string) => void;
    onCommandCancel?: (entryId: string) => void;
    onLearningAccept?: (entryId: string) => void;
    onLearningDecline?: (entryId: string) => void;
    inputActive: boolean;
}

export function ScrollableTranscript({
    entries,
    pendingReviewId,
    currentModel,
    learningPromptId,
    learningInProgress,
    learningPercent,
    learningTopic,
    viewportHeight,
    viewportWidth,
    scrollOffset,
    onScrollChange,
    onAcceptReview,
    onAlwaysAcceptReview,
    onRejectReview,
    onShellRun,
    onShellAlways,
    onShellAuto,
    onShellDeny,
    onCommandSelect,
    onCommandCancel,
    onLearningAccept,
    onLearningDecline,
    inputActive,
}: ScrollableTranscriptProps) {
    const assistantName = getAssistantName(currentModel);
    const animationsEnabled = entries.length < 100;

    const wrappedEntries = useMemo(() => {
        const result: WrappedEntry[] = [];
        const seenIds = new Set<string>();

        for (const entry of entries) {
            if (seenIds.has(entry.id)) continue;
            seenIds.add(entry.id);

            const { lines, isInteractive } = entryToLines(entry, viewportWidth, assistantName);
            result.push({
                id: entry.id,
                lines,
                role: entry.role,
                entry,
                isInteractive,
            });
        }

        return result;
    }, [entries, viewportWidth, assistantName]);

    const textOnlyEntries = wrappedEntries.filter((e) => !e.isInteractive);
    const interactiveEntries = wrappedEntries.filter((e) => e.isInteractive);

    const allTextLines = useMemo(() => {
        return textOnlyEntries.flatMap((e) => e.lines);
    }, [textOnlyEntries]);

    const totalLines = allTextLines.length;
    const interactiveHeight = interactiveEntries.length > 0 ? 12 : 0;
    const textViewportHeight = Math.max(viewportHeight - interactiveHeight, 5);

    const maxScrollOffset = Math.max(0, totalLines - textViewportHeight);
    const effectiveOffset = Math.min(scrollOffset, maxScrollOffset);

    const endIndex = totalLines - effectiveOffset;
    const startIndex = Math.max(0, endIndex - textViewportHeight);
    const visibleLines = allTextLines.slice(startIndex, endIndex);

    useInput(
        (input, key) => {
            if (inputActive) return;

            if (key.upArrow) {
                const newOffset = Math.min(scrollOffset + 1, maxScrollOffset);
                onScrollChange(newOffset);
            } else if (key.downArrow) {
                const newOffset = Math.max(scrollOffset - 1, 0);
                onScrollChange(newOffset);
            } else if (key.pageUp) {
                const newOffset = Math.min(scrollOffset + textViewportHeight, maxScrollOffset);
                onScrollChange(newOffset);
            } else if (key.pageDown) {
                const newOffset = Math.max(scrollOffset - textViewportHeight, 0);
                onScrollChange(newOffset);
            } else if (input === "g" || input === "G") {
                onScrollChange(0);
            }
        },
        { isActive: !inputActive }
    );

    if (entries.length === 0 && !learningPromptId) {
        return (
            <Box flexDirection="column" height={viewportHeight}>
                <Text color="#999999">Start a conversation by typing below.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" height={viewportHeight}>
            {learningPromptId && !learningInProgress && (
                <LearningPrompt
                    status="pending"
                    onAccept={() => onLearningAccept?.(learningPromptId)}
                    onDecline={() => onLearningDecline?.(learningPromptId)}
                    isActive={true}
                    animationsEnabled={animationsEnabled}
                />
            )}

            <Box flexDirection="column" flexGrow={1} overflow="hidden">
                {visibleLines.map((line, i) => (
                    <Text key={`line-${startIndex + i}`} wrap="truncate">
                        {line || " "}
                    </Text>
                ))}
            </Box>

            {interactiveEntries.map((wrapped) => {
                const entry = wrapped.entry;
                const isActive = entry.id === pendingReviewId;

                if (entry.role === "diff_review" && entry.diffContent) {
                    const reviewStatus = entry.reviewStatus as
                        | "pending"
                        | "accepted"
                        | "always"
                        | "rejected";
                    return (
                        <DiffReview
                            key={entry.id}
                            diffs={entry.diffContent}
                            filesCount={entry.filesCount || 0}
                            toolName={entry.toolName || "edit"}
                            reviewStatus={reviewStatus || "pending"}
                            onAccept={isActive ? () => onAcceptReview?.(entry.id) : undefined}
                            onAlways={isActive ? () => onAlwaysAcceptReview?.(entry.id) : undefined}
                            onReject={isActive ? () => onRejectReview?.(entry.id) : undefined}
                            isActive={isActive}
                            animationsEnabled={animationsEnabled}
                        />
                    );
                }

                if (entry.role === "shell_review" && entry.shellCommand) {
                    const shellStatus = (entry.reviewStatus || "pending") as ShellReviewStatus;
                    return (
                        <ShellReview
                            key={entry.id}
                            command={entry.shellCommand}
                            cwd={entry.shellCwd || undefined}
                            status={shellStatus}
                            onRun={isActive ? () => onShellRun?.(entry.id) : undefined}
                            onAlways={isActive ? () => onShellAlways?.(entry.id) : undefined}
                            onAuto={isActive ? () => onShellAuto?.(entry.id) : undefined}
                            onDeny={isActive ? () => onShellDeny?.(entry.id) : undefined}
                            isActive={isActive}
                            animationsEnabled={animationsEnabled}
                        />
                    );
                }

                if (entry.role === "command_review" && entry.commandOptions) {
                    const commandStatus = (entry.reviewStatus || "pending") as CommandReviewStatus;
                    return (
                        <CommandReview
                            key={entry.id}
                            commandName={entry.commandName || "command"}
                            prompt={entry.commandPrompt || "Select an option"}
                            options={entry.commandOptions}
                            status={commandStatus}
                            selectedId={entry.commandSelectedId}
                            onSelect={
                                isActive ? (id) => onCommandSelect?.(entry.id, id) : undefined
                            }
                            onCancel={isActive ? () => onCommandCancel?.(entry.id) : undefined}
                            isActive={isActive}
                        />
                    );
                }

                if (entry.role === "learning_progress") {
                    return (
                        <LearningProgress
                            key={entry.id}
                            percent={entry.learningPercent || learningPercent}
                            currentTopic={entry.learningTopic || learningTopic}
                        />
                    );
                }

                return null;
            })}
        </Box>
    );
}
