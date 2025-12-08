import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";

interface StatusLineProps {
    model: string;
    projectPath: string;
    contextUsage: number;
}

function getContextColor(usage: number): string {
    if (usage < 0.60) return "green";
    if (usage < 0.85) return "yellow";
    return "red";
}

export function StatusLine({ model, projectPath, contextUsage }: StatusLineProps) {
    const projectName = basename(projectPath);
    const usagePercent = Math.round(contextUsage * 100);
    const contextColor = getContextColor(contextUsage);

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
                <Text color="magenta">{model}</Text>
                <Text color="#999999">•</Text>
                <Text color={contextColor}>● {usagePercent}%</Text>
            </Box>
        </Box>
    );
}

