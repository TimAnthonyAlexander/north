import { createProvider as createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import { getModelProvider, type ProviderType } from "../commands/models";
import type { Provider } from "./types";

export type {
    Provider,
    Message,
    StreamCallbacks,
    StreamOptions,
    ToolCall,
    ToolResultInput,
    ToolSchema,
    ThinkingBlock,
    ThinkingConfig,
    StreamResult,
    TokenUsage,
} from "./types";
export { getModelProvider, type ProviderType };

export function createProviderForModel(modelId: string): Provider {
    const providerType = getModelProvider(modelId);
    return createProviderByType(providerType, modelId);
}

export function createProviderByType(providerType: ProviderType, modelId?: string): Provider {
    switch (providerType) {
        case "openai":
            return createOpenAIProvider({ model: modelId });
        case "anthropic":
        default:
            return createAnthropicProvider({ model: modelId });
    }
}
