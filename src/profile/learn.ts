import type { Provider, ToolSchema, Message } from "../provider/index";
import type { ToolRegistry } from "../tools/registry";
import type { Logger } from "../logging/index";

interface DiscoveryTopic {
    id: string;
    title: string;
    prompt: string;
}

const FULL_TOPICS: DiscoveryTopic[] = [
    {
        id: "summary",
        title: "Project Summary",
        prompt: "Find out for this project what it is, who it is for, what the main user workflows are, and what it explicitly does not do. Write a short, concrete summary.",
    },
    {
        id: "architecture",
        title: "Architecture Map",
        prompt: "Find out for this project what the major modules/subsystems are, how they relate, and where the main entry points are (apps, commands, servers, workers). Summarize the structure in a compact map.",
    },
    {
        id: "conventions",
        title: "Code Style and Conventions",
        prompt: "Find out for this project what the coding conventions are: naming, folder layout, formatting, patterns for errors/logging, and any lint/format rules. Write rules the assistant should follow when editing code here.",
    },
    {
        id: "vocabulary",
        title: "Domain Model Vocabulary",
        prompt: "Find out for this project the key domain concepts and entities, the terms used in code, and where those concepts live in the repo. List the vocabulary and point to the canonical locations.",
    },
    {
        id: "data_flow",
        title: "Data Flow and State",
        prompt: "Find out for this project where state is stored and how data flows through the system (persistence, caches, files, in-memory state). Describe the main data paths and boundaries.",
    },
    {
        id: "dependencies",
        title: "External Dependencies and Integrations",
        prompt: "Find out for this project the important dependencies and external integrations (frameworks, libraries, services, APIs). Note where configuration lives and where integration code is implemented.",
    },
    {
        id: "workflow",
        title: "Build, Run, and Test Workflow",
        prompt: "Find out for this project how to run it locally, how to run tests, lint/format, and build/release. Provide the core commands and where to look for details.",
    },
    {
        id: "hotspots",
        title: "Hot Spots and Change Patterns",
        prompt: "Find out for this project which files and areas change most often and what kinds of changes typically happen there. Identify any sensitive areas that need extra caution.",
    },
    {
        id: "playbook",
        title: "Common Tasks Playbook",
        prompt: "Find out for this project where to implement common changes (new feature, new endpoint, new UI view, new command, new background job, new migration/config). Write a short 'where to put things' playbook.",
    },
    {
        id: "safety",
        title: "Safety Rails and Footguns",
        prompt: "Find out for this project the known pitfalls: security constraints, performance traps, invariants, migration gotchas, cross-platform issues, and any strict rules. Write a checklist the assistant should respect.",
    },
];

const COMPACT_PROMPT = `Explore this codebase and create a project profile. Use tools to examine the code, then write a comprehensive profile with these sections:

## Project Summary
What is it, who is it for, main workflows, what it does NOT do.

## Architecture & Structure  
Major modules, how they relate, entry points, folder layout.

## Code Conventions
Naming, formatting, error handling patterns, lint rules.

## Key Concepts & Vocabulary
Domain terms, important entities, where they live in code.

## Development Workflow
How to run, test, build. Key commands.

## Important Notes
Dependencies, sensitive areas, known pitfalls, things to be careful about.

Be concise. Use bullet points. Focus on what's actually useful for someone coding in this project.`;

const MEDIUM_TOPICS: DiscoveryTopic[] = [
    {
        id: "overview",
        title: "Project Overview",
        prompt: "Explore this codebase. What is it, who is it for, what are the main modules/subsystems, and where are the entry points? Write a concise overview covering purpose, structure, and architecture.",
    },
    {
        id: "conventions",
        title: "Code Conventions",
        prompt: "What are the coding conventions in this project? Look at naming, folder layout, formatting, error handling patterns, and any lint/format config. Write rules to follow when editing code here.",
    },
    {
        id: "domain",
        title: "Domain & Data Flow",
        prompt: "What are the key domain concepts/entities in this codebase? Where is state stored and how does data flow through the system? List the vocabulary and describe the main data paths.",
    },
    {
        id: "workflow",
        title: "Development Workflow",
        prompt: "How do you run, test, and build this project? What are the key dependencies and integrations? Provide the core commands and note where config lives.",
    },
    {
        id: "pitfalls",
        title: "Hot Spots & Pitfalls",
        prompt: "What are the sensitive areas in this codebase? Any known pitfalls, security constraints, performance traps, or strict rules? Where do common changes go? Write a safety checklist and brief playbook.",
    },
];

const READ_ONLY_TOOLS = [
    "list_root",
    "read_file",
    "search_text",
    "find_files",
    "read_readme",
    "detect_languages",
    "hotfiles",
    "get_line_count",
    "get_file_symbols",
    "get_file_outline",
];

const SIZE_TINY = 15;
const SIZE_SMALL = 50;
const SIZE_MEDIUM = 150;

async function getProjectFileCount(
    toolRegistry: ToolRegistry,
    repoRoot: string,
    logger: Logger
): Promise<number> {
    try {
        const result = await toolRegistry.execute(
            "find_files",
            { pattern: "*" },
            { repoRoot, logger }
        );
        if (result.ok && Array.isArray(result.data)) {
            return result.data.length;
        }
        if (result.ok && result.data && typeof result.data === "object" && "files" in result.data) {
            return (result.data as { files: string[] }).files.length;
        }
    } catch {
        // Fall back to medium size if we can't count
    }
    return SIZE_SMALL + 1;
}

export async function runLearningSession(
    repoRoot: string,
    toolRegistry: ToolRegistry,
    provider: Provider,
    logger: Logger,
    onProgress: (percent: number, topic: string) => void
): Promise<string> {
    const allSchemas = toolRegistry.getSchemas();
    const readOnlySchemas = allSchemas.filter((schema) => READ_ONLY_TOOLS.includes(schema.name));

    onProgress(5, "Analyzing project size...");
    const fileCount = await getProjectFileCount(toolRegistry, repoRoot, logger);
    logger.info("learning_project_size", { fileCount });

    if (fileCount <= SIZE_TINY) {
        return runCompactSession(
            repoRoot,
            toolRegistry,
            provider,
            readOnlySchemas,
            logger,
            onProgress
        );
    } else if (fileCount <= SIZE_MEDIUM) {
        return runMediumSession(
            repoRoot,
            toolRegistry,
            provider,
            readOnlySchemas,
            logger,
            onProgress
        );
    } else {
        return runFullSession(
            repoRoot,
            toolRegistry,
            provider,
            readOnlySchemas,
            logger,
            onProgress
        );
    }
}

async function runCompactSession(
    repoRoot: string,
    toolRegistry: ToolRegistry,
    provider: Provider,
    toolSchemas: ToolSchema[],
    logger: Logger,
    onProgress: (percent: number, topic: string) => void
): Promise<string> {
    onProgress(20, "Learning project...");

    try {
        const response = await queryWithTools(
            COMPACT_PROMPT,
            toolSchemas,
            provider,
            toolRegistry,
            repoRoot,
            logger,
            3
        );

        onProgress(100, "Complete");

        if (response && response.trim()) {
            return `# Project Profile\n\nGenerated by North project learning.\n\n${response.trim()}`;
        }
        return "# Project Profile\n\nGenerated by North project learning.\n\nNo information gathered.";
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("learning_compact_error", err as Error, {});
        return `# Project Profile\n\nGenerated by North project learning.\n\nLearning error: ${errorMsg.slice(0, 200)}`;
    }
}

async function runMediumSession(
    repoRoot: string,
    toolRegistry: ToolRegistry,
    provider: Provider,
    toolSchemas: ToolSchema[],
    logger: Logger,
    onProgress: (percent: number, topic: string) => void
): Promise<string> {
    const sections: string[] = [];

    for (let i = 0; i < MEDIUM_TOPICS.length; i++) {
        const topic = MEDIUM_TOPICS[i];
        const percent = Math.round(20 + ((i + 1) / MEDIUM_TOPICS.length) * 80);

        onProgress(percent, topic.title);

        try {
            const response = await queryWithTools(
                topic.prompt,
                toolSchemas,
                provider,
                toolRegistry,
                repoRoot,
                logger,
                4
            );

            if (response && response.trim()) {
                sections.push(`## ${topic.title}\n\n${response.trim()}`);
            } else {
                sections.push(`## ${topic.title}\n\nNo information gathered for this topic.`);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("learning_topic_error", err as Error, { topicId: topic.id });
            sections.push(`## ${topic.title}\n\nLearning error: ${errorMsg.slice(0, 200)}`);
        }
    }

    return "# Project Profile\n\nGenerated by North project learning.\n\n" + sections.join("\n\n");
}

async function runFullSession(
    repoRoot: string,
    toolRegistry: ToolRegistry,
    provider: Provider,
    toolSchemas: ToolSchema[],
    logger: Logger,
    onProgress: (percent: number, topic: string) => void
): Promise<string> {
    const sections: string[] = [];

    for (let i = 0; i < FULL_TOPICS.length; i++) {
        const topic = FULL_TOPICS[i];
        const percent = Math.round(10 + ((i + 1) / FULL_TOPICS.length) * 90);

        onProgress(percent, topic.title);

        try {
            const response = await queryWithTools(
                topic.prompt,
                toolSchemas,
                provider,
                toolRegistry,
                repoRoot,
                logger,
                5
            );

            if (response && response.trim()) {
                sections.push(`## ${topic.title}\n\n${response.trim()}`);
            } else {
                sections.push(`## ${topic.title}\n\nNo information gathered for this topic.`);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("learning_topic_error", err as Error, { topicId: topic.id });
            sections.push(`## ${topic.title}\n\nLearning error: ${errorMsg.slice(0, 200)}`);
        }
    }

    return "# Project Profile\n\nGenerated by North project learning.\n\n" + sections.join("\n\n");
}

async function queryWithTools(
    prompt: string,
    toolSchemas: ToolSchema[],
    provider: Provider,
    toolRegistry: ToolRegistry,
    repoRoot: string,
    logger: Logger,
    maxIterations: number
): Promise<string> {
    const conversationMessages: Message[] = [];

    conversationMessages.push({
        role: "user",
        content: prompt,
    });

    const systemPrompt =
        "You are helping North learn about a codebase. Use tools to explore the code. After exploring, provide a concise summary with bullet points. Be direct and factual. Do not narrate your exploration steps.";

    let iteration = 0;
    let lastAssistantText = "";
    let didUseTools = false;

    while (iteration < maxIterations) {
        iteration++;

        const streamResult = await streamToCompletion(
            provider,
            conversationMessages,
            toolSchemas,
            systemPrompt
        );

        lastAssistantText = streamResult.text;

        if (streamResult.stopReason === "tool_use" && streamResult.toolCalls.length > 0) {
            didUseTools = true;

            conversationMessages.push(
                provider.buildAssistantMessage(streamResult.text, streamResult.toolCalls)
            );

            const toolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> =
                [];

            for (const toolCall of streamResult.toolCalls) {
                const result = await toolRegistry.execute(toolCall.name, toolCall.input, {
                    repoRoot,
                    logger,
                });

                let resultContent: string;
                if (result.ok && result.data) {
                    if (typeof result.data === "string") {
                        resultContent = result.data.slice(0, 5000);
                    } else {
                        resultContent = JSON.stringify(result.data).slice(0, 5000);
                    }
                } else {
                    resultContent = `ERROR: ${result.error || "Unknown error"}`;
                }

                toolResults.push({
                    toolCallId: toolCall.id,
                    result: resultContent,
                    isError: !result.ok,
                });
            }

            conversationMessages.push(provider.buildToolResultMessage(toolResults));
        } else {
            break;
        }
    }

    if (lastAssistantText.trim()) {
        return lastAssistantText.trim();
    }

    if (didUseTools) {
        conversationMessages.push({
            role: "user",
            content:
                "Based on what you found, please provide a concise summary answering the original question. Use bullet points.",
        });

        const summaryResult = await streamToCompletion(
            provider,
            conversationMessages,
            [],
            systemPrompt
        );

        return summaryResult.text.trim();
    }

    return "";
}

async function streamToCompletion(
    provider: Provider,
    messages: Message[],
    tools: ToolSchema[],
    systemOverride: string
): Promise<{
    text: string;
    toolCalls: Array<{ id: string; name: string; input: unknown }>;
    stopReason: string | null;
}> {
    return new Promise((resolve, reject) => {
        let text = "";
        const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];

        provider
            .stream(
                messages,
                {
                    onChunk: (chunk) => {
                        text += chunk;
                    },
                    onToolCall: (toolCall) => {
                        toolCalls.push(toolCall);
                    },
                    onComplete: (result) => {
                        resolve({
                            text,
                            toolCalls: result.toolCalls,
                            stopReason: result.stopReason,
                        });
                    },
                    onError: (error) => {
                        reject(error);
                    },
                },
                {
                    tools: tools.length > 0 ? tools : undefined,
                    systemOverride,
                }
            )
            .catch(reject);
    });
}
