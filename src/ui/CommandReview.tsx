import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PickerOption, CommandReviewStatus } from "../commands/types";

interface CommandReviewProps {
    commandName: string;
    prompt: string;
    options: PickerOption[];
    status: CommandReviewStatus;
    selectedId?: string;
    onSelect?: (id: string) => void;
    onCancel?: () => void;
    isActive: boolean;
}

function getBorderColor(status: CommandReviewStatus): string {
    switch (status) {
        case "pending":
            return "yellow";
        case "selected":
            return "green";
        case "cancelled":
            return "red";
    }
}

export function CommandReview({
    commandName,
    prompt,
    options,
    status,
    selectedId,
    onSelect,
    onCancel,
    isActive,
}: CommandReviewProps) {
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    useInput(
        (input, key) => {
            if (!isActive || status !== "pending") return;

            if (key.upArrow) {
                setHighlightedIndex(Math.max(0, highlightedIndex - 1));
                return;
            }

            if (key.downArrow) {
                setHighlightedIndex(Math.min(options.length - 1, highlightedIndex + 1));
                return;
            }

            if (key.return) {
                const selected = options[highlightedIndex];
                if (selected) {
                    onSelect?.(selected.id);
                }
                return;
            }

            if (key.escape || input === "q" || input === "Q") {
                onCancel?.();
                return;
            }
        },
        { isActive: isActive && status === "pending" }
    );

    const selectedOption = selectedId ? options.find(o => o.id === selectedId) : null;

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={getBorderColor(status)}
            paddingX={1}
        >
            <Box marginBottom={1}>
                <Text bold color="blue">
                    /{commandName}
                </Text>
                <Text color="gray"> - </Text>
                <Text>{prompt}</Text>
            </Box>

            {status === "pending" && (
                <>
                    <Box flexDirection="column" marginBottom={1}>
                        {options.map((option, i) => (
                            <Box key={option.id}>
                                <Text color={i === highlightedIndex ? "cyan" : "white"} bold={i === highlightedIndex}>
                                    {i === highlightedIndex ? "› " : "  "}
                                    {option.label}
                                </Text>
                                {option.hint && (
                                    <Text color="gray" dimColor>
                                        {" "}({option.hint})
                                    </Text>
                                )}
                            </Box>
                        ))}
                    </Box>
                    <Box>
                        <Text color="gray" dimColor>
                            ↑/↓ navigate, Enter select, Esc cancel
                        </Text>
                    </Box>
                </>
            )}

            {status === "selected" && selectedOption && (
                <Box>
                    <Text color="green" bold>✓ Selected: </Text>
                    <Text>{selectedOption.label}</Text>
                </Box>
            )}

            {status === "cancelled" && (
                <Box>
                    <Text color="red" bold>✗ Cancelled</Text>
                </Box>
            )}
        </Box>
    );
}

