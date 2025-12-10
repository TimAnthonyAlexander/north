import React from "react";
import { Box, Text, useApp } from "ink";
import type { ConversationMeta } from "../storage/conversations";

interface ConversationListProps {
    conversations: ConversationMeta[];
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

export function ConversationList({ conversations }: ConversationListProps) {
    const { exit } = useApp();

    React.useEffect(() => {
        const timer = setTimeout(() => {
            exit();
        }, 100);
        return () => clearTimeout(timer);
    }, [exit]);

    if (conversations.length === 0) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color="gray">No conversations found.</Text>
            </Box>
        );
    }

    const idWidth = 8;
    const projectWidth = 20;
    const dateWidth = 14;

    return (
        <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    Recent Conversations
                </Text>
            </Box>
            <Box marginBottom={1}>
                <Text color="gray">
                    {"ID".padEnd(idWidth)}
                    {"PROJECT".padEnd(projectWidth)}
                    {"LAST ACTIVE".padEnd(dateWidth)}
                    PREVIEW
                </Text>
            </Box>
            {conversations.map((conv) => (
                <Box key={conv.id}>
                    <Text color="yellow">{conv.id.padEnd(idWidth)}</Text>
                    <Text color="white">
                        {truncate(getProjectName(conv.repoRoot), projectWidth - 2).padEnd(
                            projectWidth
                        )}
                    </Text>
                    <Text color="gray">{formatDate(conv.lastActiveAt).padEnd(dateWidth)}</Text>
                    <Text color="gray" dimColor>
                        {truncate(conv.previewText || "(empty)", 40)}
                    </Text>
                </Box>
            ))}
            <Box marginTop={1}>
                <Text color="gray" dimColor>
                    To resume: north resume {"<id>"}
                </Text>
            </Box>
        </Box>
    );
}
