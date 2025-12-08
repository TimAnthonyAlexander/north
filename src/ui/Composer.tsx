import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ComposerProps {
  onSubmit: (content: string) => void;
  disabled: boolean;
}

function insertNewline(value: string, cursorPos: number): { value: string; cursor: number } {
  const before = value.slice(0, cursorPos);
  const after = value.slice(cursorPos);
  return { value: before + "\n" + after, cursor: cursorPos + 1 };
}

export function Composer({ onSubmit, disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.ctrl && input === "j") {
        const result = insertNewline(value, cursorPos);
        setValue(result.value);
        setCursorPos(result.cursor);
        return;
      }

      if (key.return) {
        if (key.shift) {
          const result = insertNewline(value, cursorPos);
          setValue(result.value);
          setCursorPos(result.cursor);
        } else {
          if (value.trim().length > 0) {
            onSubmit(value);
            setValue("");
            setCursorPos(0);
          }
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          setValue(before + after);
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      if (key.upArrow) {
        const lines = value.slice(0, cursorPos).split("\n");
        if (lines.length > 1) {
          const currentLineStart = cursorPos - lines[lines.length - 1].length;
          const prevLineStart = currentLineStart - 1 - lines[lines.length - 2].length;
          const colInCurrentLine = cursorPos - currentLineStart;
          const newPos = prevLineStart + Math.min(colInCurrentLine, lines[lines.length - 2].length);
          setCursorPos(Math.max(0, newPos));
        }
        return;
      }

      if (key.downArrow) {
        const beforeCursor = value.slice(0, cursorPos);
        const afterCursor = value.slice(cursorPos);
        const linesAfter = afterCursor.split("\n");
        if (linesAfter.length > 1) {
          const linesBefore = beforeCursor.split("\n");
          const colInCurrentLine = linesBefore[linesBefore.length - 1].length;
          const currentLineEnd = cursorPos + linesAfter[0].length;
          const newPos = currentLineEnd + 1 + Math.min(colInCurrentLine, linesAfter[1].length);
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
      }
    },
    { isActive: !disabled }
  );

  const displayValue = value || "";
  const lines = displayValue.split("\n");
  const showPlaceholder = !value && !disabled;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={disabled ? "gray" : "green"} paddingX={1}>
      <Box>
        <Text color="green" bold>
          {"› "}
        </Text>
        <Box flexDirection="column" flexGrow={1}>
          {showPlaceholder ? (
            <Text color="gray">Type a message... (Ctrl+J for newline)</Text>
          ) : (
            lines.map((line, i) => (
              <Text key={i} wrap="wrap">
                {line || " "}
              </Text>
            ))
          )}
        </Box>
      </Box>
      {disabled && (
        <Box marginTop={0}>
          <Text color="gray" dimColor>
            Waiting for response...
          </Text>
        </Box>
      )}
    </Box>
  );
}

