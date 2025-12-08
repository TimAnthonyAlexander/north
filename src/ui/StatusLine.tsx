import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";
import type { Mode } from "../commands/index";

interface StatusLineProps {
    model: string;
    projectPath: string;
    contextUsage: number;
    mode: Mode;
}

function getContextColor(usage: number): string {
    if (usage < 0.6) return "green";
    if (usage < 0.85) return "yellow";
    return "red";
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

export function StatusLine({ model, projectPath, contextUsage, mode }: StatusLineProps) {
    const projectName = basename(projectPath);
    const usagePercent = Math.round(contextUsage * 100);
    const contextColor = getContextColor(contextUsage);
    const modeColor = getModeColor(mode);
    const modeLabel = getModeLabel(mode);

    return (
        <Box width="100%" paddingX={1} justifyContent="space-between">
            <Box flexGrow={1} flexShrink={1} marginRight={1}>
                <Text wrap="truncate" color="#999999">
                    <Text color="blue" bold>
                        north
                    </Text>
                    {" • "}
                    {projectName}
                </Text>
            </Box>
            <Box flexDirection="row" gap={1}>
                <Text color={modeColor} bold>
                    [{modeLabel}]
                </Text>
                <Text color="#999999">•</Text>
                <Text color="magenta">{model}</Text>
                <Text color="#999999">•</Text>
                <Text color={contextColor}>● {usagePercent}%</Text>
            </Box>
        </Box>
    );
}
