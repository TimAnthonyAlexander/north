import type { ToolDefinition, ToolContext, ToolResult, PlanCreateInput, PlanOutput } from "./types";

function generatePlanId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const planCreateTool: ToolDefinition<PlanCreateInput, PlanOutput> = {
    name: "plan_create",
    description: "Create a plan for the changes you want to make. The plan will be shown to the user for approval before any write operations are allowed. Use this tool in Plan mode to outline your approach before implementation.",
    approvalPolicy: "plan",
    inputSchema: {
        type: "object",
        properties: {
            planText: {
                type: "string",
                description: "The detailed plan text describing what changes will be made, why, and in what order. Be specific about files, functions, and implementation steps.",
            },
        },
        required: ["planText"],
    },
    async execute(args: PlanCreateInput, _ctx: ToolContext): Promise<ToolResult<PlanOutput>> {
        if (!args.planText || typeof args.planText !== "string") {
            return { ok: false, error: "planText is required and must be a string" };
        }

        if (args.planText.trim().length === 0) {
            return { ok: false, error: "planText cannot be empty" };
        }

        const planId = generatePlanId();
        
        return {
            ok: true,
            data: {
                planId,
                version: 1,
            },
        };
    },
};

