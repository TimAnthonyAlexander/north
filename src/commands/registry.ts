import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "./types";

export interface CommandRegistry {
    register(command: CommandDefinition): void;
    get(name: string): CommandDefinition | undefined;
    has(name: string): boolean;
    list(): CommandDefinition[];
    execute(name: string, ctx: CommandContext, args: ParsedArgs): Promise<CommandResult>;
}

export function createCommandRegistry(): CommandRegistry {
    const commands = new Map<string, CommandDefinition>();
    
    return {
        register(command: CommandDefinition): void {
            commands.set(command.name, command);
        },
        
        get(name: string): CommandDefinition | undefined {
            return commands.get(name);
        },
        
        has(name: string): boolean {
            return commands.has(name);
        },
        
        list(): CommandDefinition[] {
            return Array.from(commands.values());
        },
        
        async execute(name: string, ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
            const command = commands.get(name);
            if (!command) {
                return { ok: false, error: `Unknown command: ${name}` };
            }
            try {
                return await command.execute(ctx, args);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false, error: message };
            }
        },
    };
}

