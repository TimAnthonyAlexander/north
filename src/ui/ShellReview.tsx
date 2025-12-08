import React from "react";
import { Box, Text, useInput } from "ink";

export type ShellReviewStatus = "pending" | "ran" | "always" | "denied";

interface ShellReviewProps {
    command: string;
    cwd?: string;
    status: ShellReviewStatus;
    onRun?: () => void;
    onAlways?: () => void;
    onDeny?: () => void;
    isActive: boolean;
}

function getBorderColor(status: ShellReviewStatus): string {
    switch (status) {
        case "pending":
            return "yellow";
        case "ran":
        case "always":
            return "green";
        case "denied":
            return "red";
    }
}

export function ShellReview({
    command,
    cwd,
    status,
    onRun,
    onAlways,
    onDeny,
    isActive,
}: ShellReviewProps) {
    useInput(
        (input) => {
            if (!isActive || status !== "pending") return;

            if (input === "r" || input === "R") {
                onRun?.();
            } else if (input === "a" || input === "A") {
                onAlways?.();
            } else if (input === "d" || input === "D") {
                onDeny?.();
            }
        },
        { isActive: isActive && status === "pending" }
    );

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={getBorderColor(status)}
            paddingX={1}
        >
            <Box marginBottom={1}>
                <Text bold color="yellow">
                    🖥️ Shell Command
                </Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <Box>
                    <Text color="gray">$ </Text>
                    <Text bold>{command}</Text>
                </Box>
                {cwd && (
                    <Box>
                        <Text color="gray" dimColor>
                            cwd: {cwd}
                        </Text>
                    </Box>
                )}
            </Box>

            {status === "pending" && (
                <Box>
                    <Text color="green" bold>[r]</Text>
                    <Text color="green"> Run </Text>
                    <Text color="gray"> | </Text>
                    <Text color="blue" bold>[a]</Text>
                    <Text color="blue"> Always </Text>
                    <Text color="gray"> | </Text>
                    <Text color="red" bold>[d]</Text>
                    <Text color="red"> Deny</Text>
                </Box>
            )}

            {status === "ran" && (
                <Box>
                    <Text color="green" bold>✓ Executed</Text>
                </Box>
            )}

            {status === "always" && (
                <Box>
                    <Text color="green" bold>✓ Executed (added to allowlist)</Text>
                </Box>
            )}

            {status === "denied" && (
                <Box>
                    <Text color="red" bold>✗ Denied</Text>
                </Box>
            )}
        </Box>
    );
}

