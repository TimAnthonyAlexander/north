import type { ToolDefinition, ToolContext, ToolResult, PlanCreateInput, PlanOutput } from "./types";

function generatePlanId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const planCreateTool: ToolDefinition<PlanCreateInput, PlanOutput> = {
    name: "plan_create",
    description: "Create a plan for the changes you want to make. CRITICAL WORKFLOW - YOU MUST FOLLOW THESE STEPS IN SEPARATE TURNS: (1) First turn: Use read tools to gather context about the codebase/files involved. End your turn by asking the user numbered clarifying questions (1-n) based on what you found. DO NOT call plan_create yet - STOP and wait for user response. (2) Second turn: After the user answers your questions, THEN call this tool to create the plan. NEVER call plan_create in the same turn as asking questions. The user must have a chance to respond to your questions before you create any plan.",
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

