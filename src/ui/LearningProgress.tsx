import React, { memo } from "react";
import { Box, Text } from "ink";

interface LearningProgressProps {
    percent: number;
    currentTopic: string;
}

export const LearningProgress = memo(function LearningProgress({
    percent,
    currentTopic,
}: LearningProgressProps) {
    return (
        <Box
            flexDirection="column"
            marginBottom={1}
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
        >
            <Box>
                <Text bold color="cyan">
                    Learning codebase... {percent}%
                </Text>
            </Box>
            <Box>
                <Text color="gray" dimColor>
                    {currentTopic}
                </Text>
            </Box>
        </Box>
    );
});
