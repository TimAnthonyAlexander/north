import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";

interface StatusLineProps {
    model: string;
    projectPath: string;
    contextUsage: number;
    contextUsedTokens: number;
    isScrolled?: boolean;
    thinkingEnabled?: boolean;
}

function getContextColor(usage: number): string {
    if (usage < 0.6) return "green";
    if (usage < 0.85) return "yellow";
    return "red";
}

function formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`;
    }
    return String(tokens);
}

export function StatusLine({
    model,
    projectPath,
    contextUsage,
    contextUsedTokens,
    isScrolled,
    thinkingEnabled,
}: StatusLineProps) {
    const projectName = basename(projectPath);
    const usagePercent = Math.round(contextUsage * 100);
    const contextColor = getContextColor(contextUsage);
    const tokenDisplay = formatTokenCount(contextUsedTokens);

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
                {isScrolled && (
                    <>
                        <Text color="yellow" bold>
                            [SCROLL]
                        </Text>
                        <Text color="#999999">•</Text>
                    </>
                )}
                {thinkingEnabled && (
                    <>
                        <Text color="cyan">💭</Text>
                        <Text color="#999999">•</Text>
                    </>
                )}
                <Text color="magenta">{model}</Text>
                <Text color="#999999">•</Text>
                <Text color={contextColor}>
                    ● {tokenDisplay} ({usagePercent}%)
                </Text>
            </Box>
        </Box>
    );
}
