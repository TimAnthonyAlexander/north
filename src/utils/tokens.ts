import type { Message } from "../provider/anthropic";

const CHARS_PER_TOKEN = 3.5;
const SAFETY_MARGIN = 1.1;

export interface TokenEstimate {
    estimatedTokens: number;
    breakdown: {
        system: number;
        messages: number;
        overhead: number;
    };
}

function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: Message): number {
    if (typeof message.content === "string") {
        return estimateTextTokens(message.content);
    }

    if (Array.isArray(message.content)) {
        let total = 0;
        for (const block of message.content) {
            if ("text" in block && typeof block.text === "string") {
                total += estimateTextTokens(block.text);
            } else if ("tool_use_id" in block) {
                const resultText =
                    "content" in block && Array.isArray(block.content)
                        ? block.content.map((c) => ("text" in c ? c.text : "")).join("")
                        : "";
                total += estimateTextTokens(resultText);
            }
        }
        return total;
    }

    return 0;
}

export function estimatePromptTokens(systemPrompt: string, messages: Message[]): TokenEstimate {
    const systemTokens = estimateTextTokens(systemPrompt);
    const messageTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
    const overhead = 100;

    const rawTotal = systemTokens + messageTokens + overhead;
    const estimatedTokens = Math.ceil(rawTotal * SAFETY_MARGIN);

    return {
        estimatedTokens,
        breakdown: {
            system: systemTokens,
            messages: messageTokens,
            overhead,
        },
    };
}
