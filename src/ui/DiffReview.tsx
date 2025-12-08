import React from "react";
import { Box, Text, useInput } from "ink";
import type { FileDiff } from "../tools/types";

const MAX_DIFF_LINES = 100;

interface DiffReviewProps {
    diffs: FileDiff[];
    filesCount: number;
    toolName: string;
    reviewStatus: "pending" | "accepted" | "rejected";
    onAccept?: () => void;
    onReject?: () => void;
    isActive: boolean;
}

function DiffLine({ line }: { line: string }) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
        return <Text color="green">{line}</Text>;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
        return <Text color="red">{line}</Text>;
    }
    if (line.startsWith("@@")) {
        return <Text color="cyan">{line}</Text>;
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
        return <Text bold color="white">{line}</Text>;
    }
    return <Text color="gray">{line}</Text>;
}

function DiffContent({ diffs }: { diffs: FileDiff[] }) {
    const allLines: string[] = [];

    for (const fileDiff of diffs) {
        const diffLines = fileDiff.diff.split("\n");
        allLines.push(...diffLines);
        allLines.push("");
    }

    const truncated = allLines.length > MAX_DIFF_LINES;
    const displayLines = truncated ? allLines.slice(0, MAX_DIFF_LINES) : allLines;
    const hiddenCount = allLines.length - MAX_DIFF_LINES;

    return (
        <Box flexDirection="column">
            {displayLines.map((line, i) => (
                <DiffLine key={i} line={line} />
            ))}
            {truncated && (
                <Text color="yellow" dimColor>
                    ... {hiddenCount} more lines ...
                </Text>
            )}
        </Box>
    );
}

export function DiffReview({
    diffs,
    filesCount,
    toolName,
    reviewStatus,
    onAccept,
    onReject,
    isActive,
}: DiffReviewProps) {
    useInput(
        (input, key) => {
            if (!isActive || reviewStatus !== "pending") return;

            if (input === "a" || input === "A") {
                onAccept?.();
            } else if (input === "r" || input === "R") {
                onReject?.();
            } else if (key.return) {
                onAccept?.();
            } else if (key.escape) {
                onReject?.();
            }
        },
        { isActive: isActive && reviewStatus === "pending" }
    );

    const totalAdded = diffs.reduce((sum, d) => sum + d.linesAdded, 0);
    const totalRemoved = diffs.reduce((sum, d) => sum + d.linesRemoved, 0);

    return (
        <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor={
            reviewStatus === "accepted" ? "green" :
                reviewStatus === "rejected" ? "red" : "yellow"
        } paddingX={1}>
            <Box marginBottom={1}>
                <Text bold color="yellow">
                    📝 {toolName}
                </Text>
                <Text color="gray"> — </Text>
                <Text>
                    {filesCount} file{filesCount !== 1 ? "s" : ""}
                </Text>
                <Text color="gray"> (</Text>
                <Text color="green">+{totalAdded}</Text>
                <Text color="gray">/</Text>
                <Text color="red">-{totalRemoved}</Text>
                <Text color="gray">)</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <DiffContent diffs={diffs} />
            </Box>

            {reviewStatus === "pending" && (
                <Box>
                    <Text color="green" bold>[a]</Text>
                    <Text color="green"> Accept </Text>
                    <Text color="gray"> | </Text>
                    <Text color="red" bold>[r]</Text>
                    <Text color="red"> Reject</Text>
                </Box>
            )}

            {reviewStatus === "accepted" && (
                <Box>
                    <Text color="green" bold>✓ Applied</Text>
                </Box>
            )}

            {reviewStatus === "rejected" && (
                <Box>
                    <Text color="red" bold>✗ Rejected</Text>
                </Box>
            )}
        </Box>
    );
}

