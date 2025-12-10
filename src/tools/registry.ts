import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    ToolInputSchema,
    ApprovalPolicy,
} from "./types";

const MAX_TOOL_INPUT_SIZE = 50_000;

export interface ToolRegistry {
    register(tool: ToolDefinition): void;
    get(name: string): ToolDefinition | undefined;
    list(): ToolDefinition[];
    execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>;
    getApprovalPolicy(name: string): ApprovalPolicy;
    getSchemas(): Array<{
        name: string;
        description: string;
        input_schema: ToolInputSchema;
    }>;
}

export function createToolRegistry(): ToolRegistry {
    const tools = new Map<string, ToolDefinition>();

    return {
        register(tool: ToolDefinition): void {
            tools.set(tool.name, tool);
        },

        get(name: string): ToolDefinition | undefined {
            return tools.get(name);
        },

        list(): ToolDefinition[] {
            return Array.from(tools.values());
        },

        getApprovalPolicy(name: string): ApprovalPolicy {
            const tool = tools.get(name);
            return tool?.approvalPolicy ?? "none";
        },

        async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
            const tool = tools.get(name);
            if (!tool) {
                return { ok: false, error: `Unknown tool: ${name}` };
            }

            const inputSize = JSON.stringify(args).length;
            if (inputSize > MAX_TOOL_INPUT_SIZE) {
                return {
                    ok: false,
                    error: `Tool input too large (${Math.round(inputSize / 1000)}KB > 50KB limit). For new files, use <NORTH_FILE path="...">content</NORTH_FILE> protocol in your response text instead.`,
                };
            }

            try {
                return await tool.execute(args, ctx);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false, error: message };
            }
        },

        getSchemas(): Array<{
            name: string;
            description: string;
            input_schema: ToolInputSchema;
        }> {
            return Array.from(tools.values()).map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
            }));
        },
    };
}
