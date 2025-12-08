import type { ToolDefinition, ToolContext, ToolResult, PlanUpdateInput, PlanOutput } from "./types";

export const planUpdateTool: ToolDefinition<PlanUpdateInput, PlanOutput> = {
    name: "plan_update",
    description:
        "Update an existing plan with revised changes. The updated plan will require user approval again before any write operations proceed. Use this when the user requests revisions or when you need to adjust the plan during execution.",
    approvalPolicy: "plan",
    inputSchema: {
        type: "object",
        properties: {
            planId: {
                type: "string",
                description:
                    "The ID of the plan to update (from previous plan_create or plan_update call)",
            },
            planText: {
                type: "string",
                description: "The revised plan text describing the updated approach",
            },
        },
        required: ["planId", "planText"],
    },
    async execute(args: PlanUpdateInput, _ctx: ToolContext): Promise<ToolResult<PlanOutput>> {
        if (!args.planId || typeof args.planId !== "string") {
            return { ok: false, error: "planId is required and must be a string" };
        }

        if (!args.planText || typeof args.planText !== "string") {
            return { ok: false, error: "planText is required and must be a string" };
        }

        if (args.planText.trim().length === 0) {
            return { ok: false, error: "planText cannot be empty" };
        }

        const versionMatch = args.planId.match(/v(\d+)$/);
        const currentVersion = versionMatch ? parseInt(versionMatch[1], 10) : 1;
        const newVersion = currentVersion + 1;

        const newPlanId = args.planId.replace(/(-v\d+)?$/, `-v${newVersion}`);

        return {
            ok: true,
            data: {
                planId: newPlanId,
                version: newVersion,
            },
        };
    },
};
