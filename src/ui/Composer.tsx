import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getTokenAtCursor, MODELS, type CommandRegistry, type Mode } from "../commands/index";
import { getFileIndex, fuzzyMatchFiles } from "../utils/fileindex";
import { basename } from "path";

interface Suggestion {
    value: string;
    label: string;
    hint?: string;
    type: "command" | "model" | "file";
}

interface ComposerProps {
    onSubmit: (content: string, attachedFiles: string[]) => void;
    disabled: boolean;
    commandRegistry?: CommandRegistry;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
    onLineCountChange?: (lineCount: number) => void;
    onIsEmptyChange?: (isEmpty: boolean) => void;
    repoRoot: string;
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
        type: "model" as const,
    }));
}

function getFileMentionToken(
    value: string,
    cursorPos: number
): { query: string; tokenStart: number; tokenEnd: number } | null {
    if (cursorPos === 0) return null;

    let tokenStart = cursorPos;
    while (tokenStart > 0 && !/\s/.test(value[tokenStart - 1])) {
        tokenStart--;
    }

    if (value[tokenStart] !== "@") return null;

    let tokenEnd = cursorPos;
    while (tokenEnd < value.length && !/\s/.test(value[tokenEnd])) {
        tokenEnd++;
    }

    const query = value.slice(tokenStart + 1, cursorPos);
    return { query, tokenStart, tokenEnd };
}

function getFileSuggestions(query: string, repoRoot: string): Suggestion[] {
    const files = getFileIndex(repoRoot);
    const matches = fuzzyMatchFiles(query, files, 10);

    return matches.map((filePath) => ({
        value: filePath,
        label: basename(filePath),
        hint: filePath,
        type: "file" as const,
    }));
}

interface SuggestionState {
    suggestions: Suggestion[];
    tokenStart: number;
    tokenEnd: number;
    type: "command" | "model" | "file";
}

function getSuggestions(
    value: string,
    cursorPos: number,
    registry: CommandRegistry | undefined,
    repoRoot: string
): SuggestionState | null {
    const fileMention = getFileMentionToken(value, cursorPos);
    if (fileMention) {
        const fileSuggestions = getFileSuggestions(fileMention.query, repoRoot);
        if (fileSuggestions.length > 0) {
            return {
                suggestions: fileSuggestions,
                tokenStart: fileMention.tokenStart,
                tokenEnd: fileMention.tokenEnd,
                type: "file",
            };
        }
    }

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
                type: "command" as const,
            }));

        if (filtered.length === 0) return null;

        return {
            suggestions: filtered,
            tokenStart: token.tokenStart,
            tokenEnd: token.tokenEnd,
            type: "command",
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
            type: "model",
        };
    }

    return null;
}

function cycleMode(currentMode: Mode): Mode {
    switch (currentMode) {
        case "ask":
            return "agent";
        case "agent":
            return "ask";
    }
}

function getModeColor(mode: Mode): string {
    switch (mode) {
        case "ask":
            return "blue";
        case "agent":
            return "green";
    }
}

function getModeLabel(mode: Mode): string {
    switch (mode) {
        case "ask":
            return "ASK";
        case "agent":
            return "AGENT";
    }
}

function extractAttachedFiles(value: string): string[] {
    const regex = /@([^\s@]+)/g;
    const files: string[] = [];
    let match;
    while ((match = regex.exec(value)) !== null) {
        if (match[1] && match[1].includes("/")) {
            files.push(match[1]);
        }
    }
    return [...new Set(files)];
}

export function Composer({
    onSubmit,
    disabled,
    commandRegistry,
    mode,
    onModeChange,
    onLineCountChange,
    onIsEmptyChange,
    repoRoot,
}: ComposerProps) {
    const [value, setValue] = useState("");
    const [cursorPos, setCursorPos] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [attachedFiles, setAttachedFiles] = useState<string[]>([]);

    useEffect(() => {
        const lineCount = value.split("\n").length;
        onLineCountChange?.(lineCount);
    }, [value, onLineCountChange]);

    useEffect(() => {
        onIsEmptyChange?.(value.length === 0);
    }, [value, onIsEmptyChange]);

    const suggestionState = useMemo(() => {
        if (!showSuggestions) return null;
        return getSuggestions(value, cursorPos, commandRegistry, repoRoot);
    }, [value, cursorPos, commandRegistry, showSuggestions, repoRoot]);

    const suggestions = suggestionState?.suggestions || [];
    const hasSuggestions = suggestions.length > 0;
    const isFileSuggestion = suggestionState?.type === "file";

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

            const isSingleNewline = input === "\n" || input === "\r" || input === "\r\n";
            const isPaste = input && input.length > 1 && !isSingleNewline;
            if (isPaste) {
                const normalized = input.replace(/\r\n?/g, "\n");
                const before = value.slice(0, cursorPos);
                const after = value.slice(cursorPos);
                setValue(before + normalized + after);
                setCursorPos(cursorPos + normalized.length);
                setShowSuggestions(true);
                setSelectedIndex(0);
                return;
            }

            if (key.escape) {
                if (hasSuggestions) {
                    setShowSuggestions(false);
                    return;
                }
            }

            if (input === " " && isFileSuggestion) {
                setShowSuggestions(false);
                const before = value.slice(0, cursorPos);
                const after = value.slice(cursorPos);
                setValue(before + " " + after);
                setCursorPos(cursorPos + 1);
                return;
            }

            if (key.tab) {
                if (hasSuggestions) {
                    const suggestion = suggestions[selectedIndex];
                    if (suggestion && suggestionState) {
                        const before = value.slice(0, suggestionState.tokenStart);
                        const after = value.slice(suggestionState.tokenEnd);

                        if (suggestion.type === "command") {
                            const newValue = (before + suggestion.value + after).trim();
                            const allAttached = [
                                ...attachedFiles,
                                ...extractAttachedFiles(newValue),
                            ];
                            onSubmit(newValue, allAttached);
                            setValue("");
                            setCursorPos(0);
                            setSelectedIndex(0);
                            setShowSuggestions(true);
                            setAttachedFiles([]);
                        } else if (suggestion.type === "file") {
                            const filePath = suggestion.value;
                            const newAttached = [...attachedFiles];
                            if (!newAttached.includes(filePath)) {
                                newAttached.push(filePath);
                            }
                            setAttachedFiles(newAttached);

                            const newValue = before + "@" + filePath + " " + after;
                            const newCursor = suggestionState.tokenStart + 1 + filePath.length + 1;
                            setValue(newValue);
                            setCursorPos(newCursor);
                            setSelectedIndex(0);
                            setShowSuggestions(true);
                        } else {
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
                    setSelectedIndex(0);
                    return;
                }

                if (hasSuggestions) {
                    const suggestion = suggestions[selectedIndex];
                    if (suggestion && suggestionState) {
                        const before = value.slice(0, suggestionState.tokenStart);
                        const after = value.slice(suggestionState.tokenEnd);

                        if (suggestion.type === "command") {
                            const newValue = (before + suggestion.value + after).trim();
                            const allAttached = [
                                ...attachedFiles,
                                ...extractAttachedFiles(newValue),
                            ];
                            onSubmit(newValue, allAttached);
                            setValue("");
                            setCursorPos(0);
                            setSelectedIndex(0);
                            setShowSuggestions(true);
                            setAttachedFiles([]);
                        } else if (suggestion.type === "file") {
                            const filePath = suggestion.value;
                            const newAttached = [...attachedFiles];
                            if (!newAttached.includes(filePath)) {
                                newAttached.push(filePath);
                            }
                            setAttachedFiles(newAttached);

                            const newValue = before + "@" + filePath + " " + after;
                            const newCursor = suggestionState.tokenStart + 1 + filePath.length + 1;
                            setValue(newValue);
                            setCursorPos(newCursor);
                            setSelectedIndex(0);
                            setShowSuggestions(true);
                        } else {
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
                    }
                } else if (value.trim().length > 0) {
                    const allAttached = [...attachedFiles, ...extractAttachedFiles(value)];
                    onSubmit(value, allAttached);
                    setValue("");
                    setCursorPos(0);
                    setSelectedIndex(0);
                    setShowSuggestions(true);
                    setAttachedFiles([]);
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
                if (value.length === 0) return;
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
                if (value.length === 0) return;
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

    function renderLineWithCursor(line: string, lineIndex: number): React.ReactNode {
        let charsBefore = 0;
        for (let i = 0; i < lineIndex; i++) {
            charsBefore += lines[i].length + 1;
        }
        const lineStart = charsBefore;
        const lineEnd = lineStart + line.length;

        if (cursorPos >= lineStart && cursorPos <= lineEnd) {
            const cursorOffset = cursorPos - lineStart;
            const before = line.slice(0, cursorOffset);
            const after = line.slice(cursorOffset);
            return (
                <>
                    <Text>{before}</Text>
                    <Text color="green" bold>
                        ▏
                    </Text>
                    <Text>{after || " "}</Text>
                </>
            );
        }
        return <Text>{line || " "}</Text>;
    }

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={disabled ? "gray" : "green"}
            paddingX={1}
            width="100%"
        >
            {attachedFiles.length > 0 && (
                <Box marginBottom={0}>
                    <Text color="cyan" dimColor>
                        📎 {attachedFiles.length} file{attachedFiles.length > 1 ? "s" : ""} attached
                    </Text>
                </Box>
            )}
            <Box>
                <Text color="green" bold>
                    {"› "}
                </Text>
                <Box flexDirection="column" flexGrow={1}>
                    {showPlaceholder ? (
                        <Box>
                            <Text color="green" bold>
                                ▏
                            </Text>
                            <Text color="#999999">
                                Type a message... (@ to attach files, Tab to switch mode)
                            </Text>
                        </Box>
                    ) : (
                        lines.map((line, i) => <Box key={i}>{renderLineWithCursor(line, i)}</Box>)
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
                    borderStyle="single"
                    borderColor={isFileSuggestion ? "cyan" : "gray"}
                    paddingX={1}
                >
                    {isFileSuggestion && (
                        <Box marginBottom={0}>
                            <Text color="cyan" bold>
                                Files
                            </Text>
                        </Box>
                    )}
                    {suggestions.slice(0, 8).map((s, i) => (
                        <Box key={s.value}>
                            <Text
                                color={i === selectedIndex ? "cyan" : "white"}
                                bold={i === selectedIndex}
                            >
                                {i === selectedIndex ? "› " : "  "}
                                {s.label}
                            </Text>
                            {s.hint && s.hint !== s.label && (
                                <Text color="gray" dimColor>
                                    {" - "}
                                    {s.hint}
                                </Text>
                            )}
                        </Box>
                    ))}
                    <Box marginTop={0}>
                        <Text color="gray" dimColor>
                            {isFileSuggestion
                                ? "Tab/Enter to attach, Space/Esc to cancel"
                                : "Tab to select, Esc to close"}
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
