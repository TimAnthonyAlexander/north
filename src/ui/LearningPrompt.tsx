import React, { useState, useEffect, memo } from "react";
import { Box, Text, useInput } from "ink";

export type LearningPromptStatus = "pending" | "accepted" | "declined";

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

interface LearningPromptProps {
    status: LearningPromptStatus;
    onAccept?: () => void;
    onDecline?: () => void;
    isActive: boolean;
    animationsEnabled?: boolean;
}

function getBorderColor(status: LearningPromptStatus): string {
    switch (status) {
        case "pending":
            return "yellow";
        case "accepted":
            return "green";
        case "declined":
            return "red";
    }
}

export const LearningPrompt = memo(function LearningPrompt({
    status,
    onAccept,
    onDecline,
    isActive,
    animationsEnabled = true,
}: LearningPromptProps) {
    const shouldAnimate = status === "pending" && animationsEnabled;
    const borderPulse = useBorderPulse(shouldAnimate, 600);

    useInput(
        (input) => {
            if (!isActive || status !== "pending") return;

            if (input === "y" || input === "Y") {
                onAccept?.();
            } else if (input === "n" || input === "N") {
                onDecline?.();
            }
        },
        { isActive: isActive && status === "pending" }
    );

    const finalBorderColor = status === "pending" ? borderPulse : getBorderColor(status);

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={finalBorderColor}
            paddingX={1}
        >
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    🧠 Project Learning
                </Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <Text>First time in this project. Let North learn it for ~1 minute?</Text>
            </Box>

            {status === "pending" && (
                <Box>
                    <Text color="green" bold>
                        [y]
                    </Text>
                    <Text color="green"> Yes </Text>
                    <Text color="gray"> | </Text>
                    <Text color="red" bold>
                        [n]
                    </Text>
                    <Text color="red"> No</Text>
                </Box>
            )}

            {status === "accepted" && (
                <Box>
                    <Text color="green" bold>
                        ✓ Learning...
                    </Text>
                </Box>
            )}

            {status === "declined" && (
                <Box>
                    <Text color="red" bold>
                        ✗ Declined
                    </Text>
                </Box>
            )}
        </Box>
    );
});

