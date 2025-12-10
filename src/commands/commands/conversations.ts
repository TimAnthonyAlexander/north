import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "../types";

function formatRelativeTime(ts: number): string {
    const now = Date.now();
    const diffMs = now - ts;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
}

function getProjectName(repoRoot: string): string {
    const parts = repoRoot.split("/");
    return parts[parts.length - 1] || repoRoot;
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
}

export const conversationsCommand: CommandDefinition = {
    name: "conversations",
    description: "Switch to another conversation",
    usage: "/conversations",

    async execute(ctx: CommandContext, _args: ParsedArgs): Promise<CommandResult> {
        const conversations = ctx.listRecentConversations(20);
        const currentId = ctx.getConversationId();

        if (conversations.length === 0) {
            return { ok: false, error: "No conversations found" };
        }

        const options = conversations.map((conv) => ({
            id: conv.id,
            label: `${conv.id} - ${truncate(getProjectName(conv.repoRoot), 15)}`,
            hint:
                conv.id === currentId
                    ? "(current)"
                    : `${formatRelativeTime(conv.lastActiveAt)} - ${truncate(conv.previewText || "(empty)", 30)}`,
        }));

        const selected = await ctx.showPicker(
            "conversations",
            "Select a conversation to switch to:",
            options
        );

        if (!selected) {
            return { ok: true, message: "Cancelled" };
        }

        if (selected === currentId) {
            return { ok: true, message: "Already in this conversation" };
        }

        const result = await ctx.switchConversation(selected);
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        return { ok: true, message: `Switched to conversation ${selected}` };
    },
};
