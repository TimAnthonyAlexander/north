import type { ParsedCommand, ParsedArgs, ParseResult, Span } from "./types";
import type { CommandRegistry } from "./registry";

function isWhitespace(char: string): boolean {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isCommandBoundary(input: string, pos: number): boolean {
    if (pos === 0) return true;
    return isWhitespace(input[pos - 1]);
}

function parseQuotedString(input: string, start: number): { value: string; end: number } | null {
    const quote = input[start];
    if (quote !== '"' && quote !== "'") return null;
    
    let end = start + 1;
    let value = "";
    
    while (end < input.length) {
        const char = input[end];
        if (char === quote) {
            return { value, end: end + 1 };
        }
        if (char === "\\" && end + 1 < input.length) {
            value += input[end + 1];
            end += 2;
        } else {
            value += char;
            end++;
        }
    }
    
    return { value, end };
}

function parseToken(input: string, start: number): { value: string; end: number } | null {
    if (start >= input.length) return null;
    
    if (input[start] === '"' || input[start] === "'") {
        return parseQuotedString(input, start);
    }
    
    let end = start;
    while (end < input.length && !isWhitespace(input[end])) {
        end++;
    }
    
    if (end === start) return null;
    return { value: input.slice(start, end), end };
}

function skipWhitespace(input: string, pos: number): number {
    while (pos < input.length && isWhitespace(input[pos])) {
        pos++;
    }
    return pos;
}

function isNextSlashCommand(input: string, pos: number, registry: CommandRegistry): boolean {
    if (input[pos] !== "/") return false;
    if (!isCommandBoundary(input, pos)) return false;
    
    let end = pos + 1;
    while (end < input.length && !isWhitespace(input[end])) {
        end++;
    }
    
    const name = input.slice(pos + 1, end);
    return registry.has(name);
}

function parseArgs(
    input: string,
    start: number,
    registry: CommandRegistry
): { args: ParsedArgs; end: number; argsSpan?: Span } {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};
    
    let pos = skipWhitespace(input, start);
    const argsStart = pos;
    let argsEnd = pos;
    
    while (pos < input.length) {
        if (isNextSlashCommand(input, pos, registry)) {
            break;
        }
        
        const token = parseToken(input, pos);
        if (!token) break;
        
        argsEnd = token.end;
        
        if (token.value.startsWith("--")) {
            const flagName = token.value.slice(2);
            const nextPos = skipWhitespace(input, token.end);
            
            if (nextPos < input.length && !isNextSlashCommand(input, nextPos, registry)) {
                const valueToken = parseToken(input, nextPos);
                if (valueToken && !valueToken.value.startsWith("--")) {
                    flags[flagName] = valueToken.value;
                    pos = skipWhitespace(input, valueToken.end);
                    argsEnd = valueToken.end;
                    continue;
                }
            }
            flags[flagName] = true;
        } else if (token.value.startsWith("-") && token.value.length === 2 && !/^-\d$/.test(token.value)) {
            flags[token.value.slice(1)] = true;
        } else {
            positional.push(token.value);
        }
        
        pos = skipWhitespace(input, token.end);
    }
    
    const hasArgs = positional.length > 0 || Object.keys(flags).length > 0;
    
    return {
        args: { positional, flags },
        end: argsEnd,
        argsSpan: hasArgs ? { start: argsStart, end: argsEnd } : undefined,
    };
}

export function parseCommandInvocations(input: string, registry: CommandRegistry): ParseResult {
    const invocations: ParsedCommand[] = [];
    let pos = 0;
    
    while (pos < input.length) {
        if (input[pos] === "/" && isCommandBoundary(input, pos)) {
            const nameStart = pos + 1;
            let nameEnd = nameStart;
            
            while (nameEnd < input.length && !isWhitespace(input[nameEnd])) {
                nameEnd++;
            }
            
            const name = input.slice(nameStart, nameEnd);
            
            if (registry.has(name)) {
                const { args, end: argsEnd, argsSpan } = parseArgs(input, nameEnd, registry);
                
                invocations.push({
                    name,
                    args,
                    span: { start: pos, end: argsEnd },
                    nameSpan: { start: pos, end: nameEnd },
                    argsSpan,
                });
                
                pos = argsEnd;
                continue;
            }
        }
        pos++;
    }
    
    let remainingText = input;
    for (let i = invocations.length - 1; i >= 0; i--) {
        const { span } = invocations[i];
        remainingText = remainingText.slice(0, span.start) + remainingText.slice(span.end);
    }
    
    return { invocations, remainingText };
}

export interface TokenAtCursor {
    token: string;
    tokenStart: number;
    tokenEnd: number;
    prefix: string;
    isCommand: boolean;
}

export function getTokenAtCursor(value: string, cursorPos: number): TokenAtCursor | null {
    if (cursorPos === 0) return null;
    
    let tokenStart = cursorPos;
    while (tokenStart > 0 && !isWhitespace(value[tokenStart - 1])) {
        tokenStart--;
    }
    
    let tokenEnd = cursorPos;
    while (tokenEnd < value.length && !isWhitespace(value[tokenEnd])) {
        tokenEnd++;
    }
    
    if (tokenStart === cursorPos) return null;
    
    const token = value.slice(tokenStart, tokenEnd);
    const prefix = value.slice(tokenStart, cursorPos);
    const isCommand = token.startsWith("/") && isCommandBoundary(value, tokenStart);
    
    return { token, tokenStart, tokenEnd, prefix, isCommand };
}

