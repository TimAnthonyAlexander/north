import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";

interface StatusLineProps {
    model: string;
    projectPath: string;
}

export function StatusLine({ model, projectPath }: StatusLineProps) {
    const projectName = basename(projectPath);

    return (
        <Box justifyContent="space-between" paddingX={1}>
            <Text color="gray">
                <Text color="blue" bold>
                    north
                </Text>
                {" • "}
                <Text>{projectName}</Text>
            </Text>
            <Text color="gray">
                <Text color="magenta">{model}</Text>
            </Text>
        </Box>
    );
}

