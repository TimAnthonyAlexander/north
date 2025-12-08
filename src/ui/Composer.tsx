import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getTokenAtCursor, MODELS, type CommandRegistry, type Mode } from "../commands/index";

interface Suggestion {
    value: string;
    label: string;
    hint?: string;
}

interface ComposerProps {
    onSubmit: (content: string) => void;
    disabled: boolean;
    commandRegistry?: CommandRegistry;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
}

function insertNewline(value: string, cursorPos: number): { value: string; cursor: number } {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    return { value: before + "\n" + after, cursor: cursorPos + 1 };
}

function findPrecedingCommand(value: string, cursorPos: number): string | null {
    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/\/(\w+)\s+[^\s]*$/);
    if (match) {
        return match[1];
    }
    return null;
}

function getModelSuggestions(prefix: string): Suggestion[] {
    const normalizedPrefix = prefix.toLowerCase();
    return MODELS.filter(
        (m) =>
            m.alias.toLowerCase().startsWith(normalizedPrefix) ||
            m.display.toLowerCase().startsWith(normalizedPrefix) ||
            m.pinned.toLowerCase().includes(normalizedPrefix)
    ).map((m) => ({
        value: m.alias,
        label: m.display,
        hint: m.alias,
    }));
}

function getSuggestions(
    value: string,
    cursorPos: number,
    registry: CommandRegistry | undefined
): { suggestions: Suggestion[]; tokenStart: number; tokenEnd: number } | null {
    if (!registry) return null;

    const token = getTokenAtCursor(value, cursorPos);
    if (!token) return null;

    if (token.isCommand) {
        const prefix = token.prefix.slice(1).toLowerCase();
        const commands = registry.list();

        const filtered = commands
            .filter((cmd) => cmd.name.toLowerCase().startsWith(prefix))
            .map((cmd) => ({
                value: `/${cmd.name}`,
                label: `/${cmd.name}`,
                hint: cmd.description,
            }));

        if (filtered.length === 0) return null;

        return {
            suggestions: filtered,
            tokenStart: token.tokenStart,
            tokenEnd: token.tokenEnd,
        };
    }

    const precedingCommand = findPrecedingCommand(value, cursorPos);
    if (precedingCommand === "model") {
        const modelSuggestions = getModelSuggestions(token.prefix);
        if (modelSuggestions.length === 0) return null;

        return {
            suggestions: modelSuggestions,
            tokenStart: token.tokenStart,
            tokenEnd: token.tokenEnd,
        };
    }

    return null;
}

function cycleMode(currentMode: Mode): Mode {
    switch (currentMode) {
        case "ask":
            return "agent";
        case "agent":
            return "plan";
        case "plan":
            return "ask";
    }
}

function getModeColor(mode: Mode): string {
    switch (mode) {
        case "ask":
            return "blue";
        case "agent":
            return "green";
        case "plan":
            return "yellow";
    }
}

function getModeLabel(mode: Mode): string {
    switch (mode) {
        case "ask":
            return "ASK";
        case "agent":
            return "AGENT";
        case "plan":
            return "PLAN";
    }
}

export function Composer({
    onSubmit,
    disabled,
    commandRegistry,
    mode,
    onModeChange,
}: ComposerProps) {
    const [value, setValue] = useState("");
    const [cursorPos, setCursorPos] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(true);

    const suggestionState = useMemo(() => {
        if (!showSuggestions) return null;
        return getSuggestions(value, cursorPos, commandRegistry);
    }, [value, cursorPos, commandRegistry, showSuggestions]);

    const suggestions = suggestionState?.suggestions || [];
    const hasSuggestions = suggestions.length > 0;

    useEffect(() => {
        if (suggestions.length === 0) {
            if (selectedIndex !== 0) setSelectedIndex(0);
        } else if (selectedIndex >= suggestions.length) {
            setSelectedIndex(suggestions.length - 1);
        }
    }, [suggestions.length, selectedIndex]);

    useInput(
        (input, key) => {
            if (disabled) return;

            if (key.escape) {
                if (hasSuggestions) {
                    setShowSuggestions(false);
                    return;
                }
            }

            if (key.tab) {
                if (hasSuggestions) {
                    const suggestion = suggestions[selectedIndex];
                    if (suggestion && suggestionState) {
                        const before = value.slice(0, suggestionState.tokenStart);
                        const after = value.slice(suggestionState.tokenEnd);
                        const needsSpace = after.length === 0 || !/^\s/.test(after);
                        const spacing = needsSpace ? " " : "";
                        const newValue = before + suggestion.value + spacing + after;
                        const newCursor =
                            suggestionState.tokenStart +
                            suggestion.value.length +
                            (needsSpace ? 1 : 0);
                        setValue(newValue);
                        setCursorPos(newCursor);
                        setSelectedIndex(0);
                    }
                } else {
                    onModeChange(cycleMode(mode));
                }
                return;
            }

            if (key.ctrl && input === "j") {
                const result = insertNewline(value, cursorPos);
                setValue(result.value);
                setCursorPos(result.cursor);
                setShowSuggestions(true);
                return;
            }

            if (key.return) {
                if (key.shift) {
                    const result = insertNewline(value, cursorPos);
                    setValue(result.value);
                    setCursorPos(result.cursor);
                    setShowSuggestions(true);
                } else if (hasSuggestions) {
                    const suggestion = suggestions[selectedIndex];
                    if (suggestion && suggestionState) {
                        const before = value.slice(0, suggestionState.tokenStart);
                        const after = value.slice(suggestionState.tokenEnd);
                        const needsSpace = after.length === 0 || !/^\s/.test(after);
                        const spacing = needsSpace ? " " : "";
                        const newValue = before + suggestion.value + spacing + after;
                        const newCursor =
                            suggestionState.tokenStart +
                            suggestion.value.length +
                            (needsSpace ? 1 : 0);
                        setValue(newValue);
                        setCursorPos(newCursor);
                        setSelectedIndex(0);
                    }
                } else if (value.trim().length > 0) {
                    onSubmit(value);
                    setValue("");
                    setCursorPos(0);
                    setSelectedIndex(0);
                    setShowSuggestions(true);
                }
                return;
            }

            if (key.backspace || key.delete) {
                if (cursorPos > 0) {
                    const before = value.slice(0, cursorPos - 1);
                    const after = value.slice(cursorPos);
                    setValue(before + after);
                    setCursorPos(cursorPos - 1);
                    setShowSuggestions(true);
                    setSelectedIndex(0);
                }
                return;
            }

            if (key.leftArrow) {
                setCursorPos(Math.max(0, cursorPos - 1));
                setShowSuggestions(true);
                return;
            }

            if (key.rightArrow) {
                setCursorPos(Math.min(value.length, cursorPos + 1));
                setShowSuggestions(true);
                return;
            }

            if (key.upArrow) {
                if (hasSuggestions) {
                    setSelectedIndex(Math.max(0, selectedIndex - 1));
                    return;
                }
                const lines = value.slice(0, cursorPos).split("\n");
                if (lines.length > 1) {
                    const currentLineStart = cursorPos - lines[lines.length - 1].length;
                    const prevLineStart = currentLineStart - 1 - lines[lines.length - 2].length;
                    const colInCurrentLine = cursorPos - currentLineStart;
                    const newPos =
                        prevLineStart + Math.min(colInCurrentLine, lines[lines.length - 2].length);
                    setCursorPos(Math.max(0, newPos));
                }
                return;
            }

            if (key.downArrow) {
                if (hasSuggestions) {
                    setSelectedIndex(Math.min(suggestions.length - 1, selectedIndex + 1));
                    return;
                }
                const beforeCursor = value.slice(0, cursorPos);
                const afterCursor = value.slice(cursorPos);
                const linesAfter = afterCursor.split("\n");
                if (linesAfter.length > 1) {
                    const linesBefore = beforeCursor.split("\n");
                    const colInCurrentLine = linesBefore[linesBefore.length - 1].length;
                    const currentLineEnd = cursorPos + linesAfter[0].length;
                    const newPos =
                        currentLineEnd + 1 + Math.min(colInCurrentLine, linesAfter[1].length);
                    setCursorPos(Math.min(value.length, newPos));
                }
                return;
            }

            if (key.ctrl || key.meta) return;

            if (input) {
                const before = value.slice(0, cursorPos);
                const after = value.slice(cursorPos);
                setValue(before + input + after);
                setCursorPos(cursorPos + input.length);
                setShowSuggestions(true);
                setSelectedIndex(0);
            }
        },
        { isActive: !disabled }
    );

    const displayValue = value || "";
    const lines = displayValue.split("\n");
    const showPlaceholder = !value && !disabled;

    const modeColor = getModeColor(mode);
    const modeLabel = getModeLabel(mode);

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={disabled ? "gray" : "green"}
            paddingX={1}
            width="100%"
        >
            <Box>
                <Text color="green" bold>
                    {"› "}
                </Text>
                <Box flexDirection="column" flexGrow={1}>
                    {showPlaceholder ? (
                        <Text color="#999999">
                            Type a message... (Ctrl+J for newline, Tab to switch mode)
                        </Text>
                    ) : (
                        lines.map((line, i) => (
                            <Text key={i} wrap="wrap">
                                {line || " "}
                            </Text>
                        ))
                    )}
                </Box>
                <Box marginLeft={1}>
                    <Text color={modeColor} bold>
                        [{modeLabel}]
                    </Text>
                </Box>
            </Box>
            {hasSuggestions && !disabled && (
                <Box
                    flexDirection="column"
                    marginTop={1}
                    borderStyle="single"
                    borderColor="gray"
                    paddingX={1}
                >
                    {suggestions.slice(0, 6).map((s, i) => (
                        <Box key={s.value}>
                            <Text
                                color={i === selectedIndex ? "cyan" : "white"}
                                bold={i === selectedIndex}
                            >
                                {i === selectedIndex ? "› " : "  "}
                                {s.label}
                            </Text>
                            {s.hint && (
                                <Text color="gray" dimColor>
                                    {" - "}
                                    {s.hint}
                                </Text>
                            )}
                        </Box>
                    ))}
                    <Box marginTop={0}>
                        <Text color="gray" dimColor>
                            Tab to select, Esc to close
                        </Text>
                    </Box>
                </Box>
            )}
            {disabled && (
                <Box marginTop={0}>
                    <Text color="gray" dimColor>
                        Waiting for response... (Ctrl+C to cancel)
                    </Text>
                </Box>
            )}
        </Box>
    );
}
