import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { ConversationMeta } from "../storage/conversations";

interface ConversationPickerProps {
    conversations: ConversationMeta[];
    onSelect: (id: string) => void;
    onCancel: () => void;
}

function formatDate(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - ts;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
        return "Yesterday";
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
}

function getProjectName(repoRoot: string): string {
    const parts = repoRoot.split("/");
    return parts[parts.length - 1] || repoRoot;
}

export function ConversationPicker({
    conversations,
    onSelect,
    onCancel,
}: ConversationPickerProps) {
    const { exit } = useApp();
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            exit();
            return;
        }

        if (key.return) {
            const selected = conversations[selectedIndex];
            if (selected) {
                exit();
                setTimeout(() => onSelect(selected.id), 10);
            }
            return;
        }

        if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
            return;
        }

        if (key.downArrow) {
            setSelectedIndex(Math.min(conversations.length - 1, selectedIndex + 1));
            return;
        }

        if (input === "q") {
            onCancel();
            exit();
        }
    });

    if (conversations.length === 0) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color="gray">No conversations to resume.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    Select a conversation to resume
                </Text>
            </Box>
            {conversations.map((conv, index) => {
                const isSelected = index === selectedIndex;
                return (
                    <Box key={conv.id}>
                        <Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
                            {isSelected ? "› " : "  "}
                        </Text>
                        <Text color={isSelected ? "yellow" : "gray"}>{conv.id}</Text>
                        <Text color="gray"> - </Text>
                        <Text color={isSelected ? "white" : "gray"}>
                            {truncate(getProjectName(conv.repoRoot), 18)}
                        </Text>
                        <Text color="gray"> - </Text>
                        <Text color="gray" dimColor>
                            {formatDate(conv.lastActiveAt)}
                        </Text>
                        {conv.previewText && (
                            <>
                                <Text color="gray"> - </Text>
                                <Text color="gray" dimColor>
                                    {truncate(conv.previewText, 30)}
                                </Text>
                            </>
                        )}
                    </Box>
                );
            })}
            <Box marginTop={1}>
                <Text color="gray" dimColor>
                    ↑/↓ to navigate, Enter to select, Esc to cancel
                </Text>
            </Box>
        </Box>
    );
}

