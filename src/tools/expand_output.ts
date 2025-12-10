import type { ToolDefinition, ToolContext, ToolResult } from "./types";
import { getCachedOutput, getCachedOutputRange } from "../utils/digest";

export interface ExpandOutputInput {
    outputId: string;
    range?: {
        start: number;
        end: number;
    };
}

export interface ExpandOutputOutput {
    outputId: string;
    content: string;
    toolName: string;
    rangeApplied: boolean;
}

export const expandOutputTool: ToolDefinition<ExpandOutputInput, ExpandOutputOutput> = {
    name: "expand_output",
    description:
        "Retrieve the full output from a previous tool call that was digested. Use this when you need to see more of a tool's output that was truncated. The outputId is provided in the digestNote of truncated outputs.",
    inputSchema: {
        type: "object",
        properties: {
            outputId: {
                type: "string",
                description: "The outputId from a digested tool output",
            },
            range: {
                type: "object",
                description:
                    "Optional line range to retrieve (1-indexed). If not provided, returns full output.",
                properties: {
                    start: { type: "number", description: "Start line (1-indexed, inclusive)" },
                    end: { type: "number", description: "End line (1-indexed, inclusive)" },
                },
            },
        },
        required: ["outputId"],
    },
    async execute(
        args: ExpandOutputInput,
        _ctx: ToolContext
    ): Promise<ToolResult<ExpandOutputOutput>> {
        const cached = getCachedOutput(args.outputId);
        if (!cached) {
            return {
                ok: false,
                error: `Output not found: ${args.outputId}. Cached outputs are only available for the current conversation turn.`,
            };
        }

        const content = args.range
            ? getCachedOutputRange(args.outputId, args.range.start, args.range.end)
            : cached.fullOutput;

        if (content === null) {
            return {
                ok: false,
                error: `Failed to retrieve output range`,
            };
        }

        return {
            ok: true,
            data: {
                outputId: args.outputId,
                content,
                toolName: cached.toolName,
                rangeApplied: !!args.range,
            },
        };
    },
};
