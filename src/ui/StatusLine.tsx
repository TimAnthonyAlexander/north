import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";
import { getModelDisplay } from "../commands/models";

interface StatusLineProps {
    model: string;
    projectPath: string;
    contextUsage: number;
    contextUsedTokens: number;
    isScrolled?: boolean;
    sessionCostUsd?: number;
    allTimeCostUsd?: number;
    messageCount?: number;
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

function formatCost(cost: number): string {
    if (cost < 0.001) {
        return "$0.00";
    }
    if (cost < 0.01) {
        return `$${cost.toFixed(3)}`;
    }
    if (cost < 1) {
        return `$${cost.toFixed(2)}`;
    }
    return `$${cost.toFixed(2)}`;
}

export function StatusLine({
    model,
    projectPath,
    contextUsage,
    contextUsedTokens,
    isScrolled,
    sessionCostUsd = 0,
    allTimeCostUsd = 0,
    messageCount = 0,
}: StatusLineProps) {
    const projectName = basename(projectPath);
    const modelDisplay = getModelDisplay(model);
    const usagePercent = Math.round(contextUsage * 100);
    const contextColor = getContextColor(contextUsage);
    const tokenDisplay = formatTokenCount(contextUsedTokens);
    const sessionCostDisplay = formatCost(sessionCostUsd);
    const allTimeCostDisplay = formatCost(allTimeCostUsd);

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
                <Text color="magenta">{modelDisplay}</Text>
                <Text color="#999999">•</Text>
                <Text color="#9c27b0">{messageCount} msgs</Text>

                <Text color="#999999">•</Text>
                <Text color={contextColor}>
                    ● {tokenDisplay} ({usagePercent}%)
                </Text>
                <Text color="#999999">•</Text>
                <Text color="#66bb6a">{sessionCostDisplay}</Text>
                <Text color="#999999">/</Text>
                <Text color="#42a5f5">{allTimeCostDisplay}</Text>
            </Box>
        </Box>
    );
}
