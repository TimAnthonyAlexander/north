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
        <Box justifyContent="space-between" paddingX={1}>
            <Text color="gray">
                <Text color="blue" bold>
                    north
                </Text>
                {" • "}
                <Text>{projectName}</Text>
            </Text>
            <Box>
                <Text color="gray">
                    <Text color="magenta">{model}</Text>
                    {" • "}
                    <Text color={contextColor}>●</Text>
                    {" "}
                    <Text color={contextColor}>{usagePercent}%</Text>
                </Text>
            </Box>
        </Box>
    );
}

