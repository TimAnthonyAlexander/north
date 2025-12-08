import type { Logger } from "../logging/index";

export interface ToolContext {
  repoRoot: string;
  logger: Logger;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    items?: { type: string };
    properties?: Record<string, unknown>;
  }>;
  required?: string[];
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute(args: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

export interface ListRootOutput {
  entries: Array<{ name: string; type: "file" | "dir" }>;
}

export interface FindFilesInput {
  pattern: string;
  limit?: number;
}

export interface FindFilesOutput {
  files: string[];
  truncated: boolean;
}

export interface SearchTextInput {
  query: string;
  path?: string;
  regex?: boolean;
  limit?: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface SearchTextOutput {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface ReadFileInput {
  path: string;
  range?: { start: number; end: number };
}

export interface ReadFileOutput {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
}

export interface ReadReadmeOutput {
  path: string;
  content: string;
  truncated: boolean;
}

export interface LanguageEntry {
  language: string;
  bytes: number;
  percent: number;
}

export interface DetectLanguagesOutput {
  languages: LanguageEntry[];
}

export interface HotfilesInput {
  limit?: number;
}

export interface HotfileEntry {
  path: string;
  score: number;
  reason: string;
}

export interface HotfilesOutput {
  files: HotfileEntry[];
  method: "git" | "fallback";
}

