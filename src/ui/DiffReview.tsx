import React, { useState, useEffect, useMemo, memo } from "react";
import { Box, Text, useInput } from "ink";
import type { FileDiff } from "../tools/types";

const MAX_DIFF_LINES = 100;
const BORDER_PULSE_COLORS = ["yellow", "#ffff87", "#ffffaf", "#ffff87"] as const;

function useBorderPulse(active: boolean, interval = 600) {
    const [colorIndex, setColorIndex] = useState(0);

    useEffect(() => {
        if (!active) return;

        const timer = setInterval(() => {
            setColorIndex((prev) => (prev + 1) % BORDER_PULSE_COLORS.length);
        }, interval);
        return () => clearInterval(timer);
    }, [active, interval]);

    return active ? BORDER_PULSE_COLORS[colorIndex] : "yellow";
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
    animationsEnabled?: boolean;
}

interface ColoredLine {
    text: string;
    color: string;
    bold?: boolean;
    dimColor?: boolean;
}

function getLineStyle(line: string): ColoredLine {
    if (line.startsWith("+") && !line.startsWith("+++")) {
        return { text: line, color: "green" };
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
        return { text: line, color: "red" };
    }
    if (line.startsWith("@@")) {
        return { text: line, color: "cyan" };
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
        return { text: line, color: "white", bold: true };
    }
    return { text: line, color: "gray" };
}

const DiffLine = memo(function DiffLine({ line }: { line: ColoredLine }) {
    return (
        <Text color={line.color} bold={line.bold} dimColor={line.dimColor}>
            {line.text}
        </Text>
    );
});

const DiffContent = memo(function DiffContent({ diffs }: { diffs: FileDiff[] }) {
    const { displayLines, truncated, hiddenCount } = useMemo(() => {
        const allLines: ColoredLine[] = [];

        for (const fileDiff of diffs) {
            const diffLines = fileDiff.diff.split("\n");
            for (const line of diffLines) {
                allLines.push(getLineStyle(line));
            }
            allLines.push({ text: "", color: "gray" });
        }

        const isTruncated = allLines.length > MAX_DIFF_LINES;
        const display = isTruncated ? allLines.slice(0, MAX_DIFF_LINES) : allLines;
        const hidden = allLines.length - MAX_DIFF_LINES;

        return { displayLines: display, truncated: isTruncated, hiddenCount: hidden };
    }, [diffs]);

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
});

export const DiffReview = memo(function DiffReview({
    diffs,
    filesCount,
    toolName,
    reviewStatus,
    onAccept,
    onAlways,
    onReject,
    isActive,
    animationsEnabled = true,
}: DiffReviewProps) {
    const shouldAnimate = reviewStatus === "pending" && animationsEnabled;
    const borderColor = useBorderPulse(shouldAnimate, 600);

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

    const { totalAdded, totalRemoved } = useMemo(() => {
        let added = 0;
        let removed = 0;
        for (const d of diffs) {
            added += d.linesAdded;
            removed += d.linesRemoved;
        }
        return { totalAdded: added, totalRemoved: removed };
    }, [diffs]);

    const finalBorderColor =
        reviewStatus === "accepted" || reviewStatus === "always"
            ? "green"
            : reviewStatus === "rejected"
              ? "red"
              : borderColor;

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={finalBorderColor}
            paddingX={1}
        >
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
                    <Text color="green" bold>
                        [a]
                    </Text>
                    <Text color="green"> Accept </Text>
                    <Text color="gray"> | </Text>
                    <Text color="cyan" bold>
                        [y]
                    </Text>
                    <Text color="cyan"> Always </Text>
                    <Text color="gray"> | </Text>
                    <Text color="red" bold>
                        [r]
                    </Text>
                    <Text color="red"> Reject</Text>
                </Box>
            )}

            {reviewStatus === "accepted" && (
                <Box>
                    <Text color="green" bold>
                        ✓ Applied
                    </Text>
                </Box>
            )}

            {reviewStatus === "always" && (
                <Box>
                    <Text color="cyan" bold>
                        ✓ Auto-applied
                    </Text>
                </Box>
            )}

            {reviewStatus === "rejected" && (
                <Box>
                    <Text color="red" bold>
                        ✗ Rejected
                    </Text>
                </Box>
            )}
        </Box>
    );
});
