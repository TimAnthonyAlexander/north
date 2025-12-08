import React, { useState, useEffect, memo } from "react";
import { Box, Text, useInput } from "ink";

export type PlanReviewStatus = "pending" | "accepted" | "rejected" | "revised";

const BORDER_PULSE_COLORS = ["yellow", "#ffff87", "#ffffaf", "#ffff87"] as const;

function useBorderPulse(active: boolean, colors: readonly string[], interval = 600) {
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

interface PlanReviewProps {
    planText: string;
    planVersion: number;
    status: PlanReviewStatus;
    onAccept?: () => void;
    onRevise?: () => void;
    onReject?: () => void;
    isActive: boolean;
    animationsEnabled?: boolean;
}

export const PlanReview = memo(function PlanReview({
    planText,
    planVersion,
    status,
    onAccept,
    onRevise,
    onReject,
    isActive,
    animationsEnabled = true,
}: PlanReviewProps) {
    const shouldAnimate = status === "pending" && animationsEnabled;
    const pulsedColor = useBorderPulse(shouldAnimate, BORDER_PULSE_COLORS, 600);
    const borderColor = status === "pending" ? pulsedColor : getBorderColor(status);

    useInput(
        (input, _key) => {
            if (status !== "pending" || !isActive) return;

            if (input === "a" && onAccept) {
                onAccept();
            } else if (input === "r" && onRevise) {
                onRevise();
            } else if (input === "x" && onReject) {
                onReject();
            }
        },
        { isActive: isActive && status === "pending" }
    );

    const statusBadge = getStatusBadge(status);

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={borderColor}
            paddingX={1}
        >
            <Box justifyContent="space-between" marginBottom={1}>
                <Text bold color="yellow">
                    📋 Plan Review (v{planVersion})
                </Text>
                {statusBadge}
            </Box>
            <Box flexDirection="column" marginBottom={1}>
                <Text wrap="wrap">{planText}</Text>
            </Box>
            {status === "pending" && isActive && (
                <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                    <Text color="gray" dimColor>
                        <Text color="green" bold>
                            a
                        </Text>{" "}
                        accept{" "}
                        <Text color="yellow" bold>
                            r
                        </Text>{" "}
                        revise{" "}
                        <Text color="red" bold>
                            x
                        </Text>{" "}
                        reject
                    </Text>
                </Box>
            )}
        </Box>
    );
});

function getBorderColor(status: PlanReviewStatus): string {
    switch (status) {
        case "accepted":
            return "green";
        case "rejected":
            return "red";
        case "revised":
            return "yellow";
        default:
            return "yellow";
    }
}

function getStatusBadge(status: PlanReviewStatus) {
    switch (status) {
        case "pending":
            return (
                <Text color="yellow" bold>
                    [PENDING]
                </Text>
            );
        case "accepted":
            return (
                <Text color="green" bold>
                    [ACCEPTED]
                </Text>
            );
        case "rejected":
            return (
                <Text color="red" bold>
                    [REJECTED]
                </Text>
            );
        case "revised":
            return (
                <Text color="yellow" bold>
                    [REVISED]
                </Text>
            );
    }
}
