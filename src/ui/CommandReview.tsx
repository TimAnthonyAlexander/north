import React, { useState, memo } from "react";
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

function renderHint(hint: string, isHighlighted: boolean) {
    // Parse hint for [PRICE]...[/PRICE] markers
    const priceMatch = hint.match(/\[PRICE\](.*?)\[\/PRICE\]/);
    
    if (priceMatch) {
        const price = priceMatch[1];
        const left = hint.replace(/\s*\[PRICE\].*?\[\/PRICE\]/, "").trim();
        
        return (
            <Box flexGrow={1} flexDirection="row" justifyContent="space-between" marginLeft={1}>
                <Text color={isHighlighted ? "cyan" : "#999999"}>{left}</Text>
                <Text color="#ff9800">{price}</Text>
            </Box>
        );
    }
    
    // No price tag, just return regular hint
    return (
        <Text color={isHighlighted ? "cyan" : "#999999"} marginLeft={1}>
            {hint}
        </Text>
    );
}

export const CommandReview = memo(function CommandReview({
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

    const selectedOption = selectedId ? options.find((o) => o.id === selectedId) : null;

    const boxWidth = commandName === "model" ? 80 : 120;

    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor={getBorderColor(status)}
            paddingX={1}
            width={boxWidth}
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
                            <Box key={option.id} flexDirection="row">
                                <Text
                                    color={i === highlightedIndex ? "cyan" : "white"}
                                    bold={i === highlightedIndex}
                                >
                                    {i === highlightedIndex ? "› " : "  "}
                                    {option.label}
                                </Text>
                                {option.hint && renderHint(option.hint, i === highlightedIndex)}
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
                    <Text color="green" bold>
                        ✓ Selected:{" "}
                    </Text>
                    <Text>{selectedOption.label}</Text>
                </Box>
            )}

            {status === "cancelled" && (
                <Box>
                    <Text color="red" bold>
                        ✗ Cancelled
                    </Text>
                </Box>
            )}
        </Box>
    );
});
