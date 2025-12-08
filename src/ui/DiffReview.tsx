import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { FileDiff } from "../tools/types";

const MAX_DIFF_LINES = 100;
const BORDER_PULSE_COLORS = ["yellow", "#ffff87", "#ffffaf", "#ffff87"] as const;

function useBorderPulse(isPending: boolean, interval = 600) {
    const [colorIndex, setColorIndex] = useState(0);
    
    useEffect(() => {
        if (!isPending) return;
        
        const timer = setInterval(() => {
            setColorIndex((prev) => (prev + 1) % BORDER_PULSE_COLORS.length);
        }, interval);
        return () => clearInterval(timer);
    }, [isPending, interval]);
    
    return isPending ? BORDER_PULSE_COLORS[colorIndex] : "yellow";
}

interface DiffReviewProps {
    diffs: FileDiff[];
    filesCount: number;
    toolName: string;
    reviewStatus: "pending" | "accepted" | "always" | "rejected";
    onAccept?: () => void;
    onAlways?: () => void;
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
    onAlways,
    onReject,
    isActive,
}: DiffReviewProps) {
    const borderColor = useBorderPulse(reviewStatus === "pending", 600);
    
    useInput(
        (input, key) => {
            if (!isActive || reviewStatus !== "pending") return;

            if (input === "a" || input === "A") {
                onAccept?.();
            } else if (input === "y" || input === "Y") {
                onAlways?.();
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
    
    const finalBorderColor = (reviewStatus === "accepted" || reviewStatus === "always") ? "green" :
        reviewStatus === "rejected" ? "red" : borderColor;

    return (
        <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor={finalBorderColor} paddingX={1}>
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
                    <Text color="cyan" bold>[y]</Text>
                    <Text color="cyan"> Always </Text>
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

            {reviewStatus === "always" && (
                <Box>
                    <Text color="cyan" bold>✓ Auto-applied</Text>
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

