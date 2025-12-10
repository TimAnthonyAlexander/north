export type {
    Span,
    ParsedArgs,
    ParsedCommand,
    ParseResult,
    StructuredSummary,
    PickerOption,
    CommandContext,
    CommandResult,
    CommandDefinition,
    CommandReviewStatus,
    CommandReviewEntry,
    CommandExecutedEntry,
    ConversationInfo,
    Mode,
} from "./types";

export { createCommandRegistry, type CommandRegistry } from "./registry";
export { parseCommandInvocations, getTokenAtCursor, type TokenAtCursor } from "./parse";
export {
    MODELS,
    DEFAULT_MODEL,
    resolveModelId,
    getModelDisplay,
    getModelAliases,
    type ModelInfo,
} from "./models";

import { createCommandRegistry, type CommandRegistry } from "./registry";
import { quitCommand } from "./commands/quit";
import { newCommand } from "./commands/new";
import { helpCommand } from "./commands/help";
import { modelCommand } from "./commands/model";
import { summarizeCommand } from "./commands/summarize";
import { modeCommand } from "./commands/mode";
import { learnCommand } from "./commands/learn";
import { conversationsCommand } from "./commands/conversations";
import { resumeCommand } from "./commands/resume";
import { thinkingCommand } from "./commands/thinking";

export function createCommandRegistryWithAllCommands(): CommandRegistry {
    const registry = createCommandRegistry();
    registry.register(quitCommand);
    registry.register(newCommand);
    registry.register(helpCommand);
    registry.register(modelCommand);
    registry.register(summarizeCommand);
    registry.register(modeCommand);
    registry.register(learnCommand);
    registry.register(conversationsCommand);
    registry.register(resumeCommand);
    registry.register(thinkingCommand);
    return registry;
}
