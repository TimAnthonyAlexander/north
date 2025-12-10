import React, { memo } from "react";
import { Box, Text, useInput } from "ink";
import { getModelProvider, getModelDisplay } from "../commands/models";
import { getCostBreakdown, type ModelCost } from "../storage/costs";

interface CostsDialogProps {
    sessionCostsByModel: Record<string, ModelCost>;
    sessionTotalCost: number;
    onClose: () => void;
}

function formatTokenCount(tokens: number): string {
    if (tokens >= 1_000_000) {
        return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
        return `${(tokens / 1_000).toFixed(1)}K`;
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

interface GroupedCosts {
    anthropic: { modelId: string; cost: ModelCost }[];
    openai: { modelId: string; cost: ModelCost }[];
}

function groupByProvider(costs: Record<string, ModelCost>): GroupedCosts {
    const result: GroupedCosts = { anthropic: [], openai: [] };
    for (const [modelId, cost] of Object.entries(costs)) {
        const provider = getModelProvider(modelId);
        result[provider].push({ modelId, cost });
    }
    result.anthropic.sort((a, b) => b.cost.costUsd - a.cost.costUsd);
    result.openai.sort((a, b) => b.cost.costUsd - a.cost.costUsd);
    return result;
}

function ProviderSection({
    name,
    models,
    indent = false,
}: {
    name: string;
    models: { modelId: string; cost: ModelCost }[];
    indent?: boolean;
}) {
    if (models.length === 0) return null;

    const providerTotal = models.reduce((sum, m) => sum + m.cost.costUsd, 0);
    const prefix = indent ? "  " : "";

    return (
        <>
            <Box justifyContent="space-between" width="100%">
                <Text color="cyan" bold>
                    {prefix}
                    {name}
                </Text>
                <Text color="green" bold>
                    {formatCost(providerTotal)}
                </Text>
            </Box>
            {models.map(({ modelId, cost }) => (
                <Box key={modelId} justifyContent="space-between" width="100%">
                    <Text color="gray">
                        {prefix} {getModelDisplay(modelId)}
                    </Text>
                    <Text>
                        <Text color="gray">
                            {formatTokenCount(cost.inputTokens)} /{" "}
                            {formatTokenCount(cost.outputTokens)}
                        </Text>
                        <Text>{"  "}</Text>
                        <Text color="green">{formatCost(cost.costUsd)}</Text>
                    </Text>
                </Box>
            ))}
        </>
    );
}

function CostSection({
    title,
    costs,
    totalCost,
}: {
    title: string;
    costs: Record<string, ModelCost>;
    totalCost: number;
}) {
    const grouped = groupByProvider(costs);
    const hasAnyCosts = grouped.anthropic.length > 0 || grouped.openai.length > 0;

    return (
        <Box flexDirection="column" width="100%" marginBottom={1}>
            <Text bold color="yellow">
                {title}
            </Text>
            <Text color="gray">{"─".repeat(50)}</Text>
            {hasAnyCosts ? (
                <>
                    <ProviderSection name="Anthropic" models={grouped.anthropic} />
                    {grouped.anthropic.length > 0 && grouped.openai.length > 0 && <Text> </Text>}
                    <ProviderSection name="OpenAI" models={grouped.openai} />
                    <Text> </Text>
                    <Box justifyContent="space-between" width="100%">
                        <Text bold>TOTAL</Text>
                        <Text color="green" bold>
                            {formatCost(totalCost)}
                        </Text>
                    </Box>
                </>
            ) : (
                <Text color="gray" dimColor>
                    No costs recorded
                </Text>
            )}
        </Box>
    );
}

export const CostsDialog = memo(function CostsDialog({
    sessionCostsByModel,
    sessionTotalCost,
    onClose,
}: CostsDialogProps) {
    useInput((input, key) => {
        if (key.escape || input === "q" || input === "Q") {
            onClose();
        }
    });

    const allTimeBreakdown = getCostBreakdown();

    return (
        <Box
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            width="100%"
            height="100%"
        >
            <Box
                flexDirection="column"
                borderStyle="round"
                borderColor="blue"
                paddingX={2}
                paddingY={1}
                width={60}
            >
                <Box justifyContent="center" marginBottom={1}>
                    <Text bold color="blue">
                        Cost Breakdown
                    </Text>
                </Box>

                <CostSection
                    title="SESSION COSTS"
                    costs={sessionCostsByModel}
                    totalCost={sessionTotalCost}
                />

                <CostSection
                    title="ALL-TIME COSTS"
                    costs={allTimeBreakdown.byModel}
                    totalCost={allTimeBreakdown.allTimeCostUsd}
                />

                <Box justifyContent="center">
                    <Text color="gray" dimColor>
                        Press Esc to close
                    </Text>
                </Box>
            </Box>
        </Box>
    );
});
