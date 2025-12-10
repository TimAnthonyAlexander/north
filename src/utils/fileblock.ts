export interface FileBlock {
    path: string;
    content: string;
    startIndex: number;
    endIndex: number;
}

export interface IncompleteBlock {
    path: string;
    partialContent: string;
    startIndex: number;
}

export interface ParseResult {
    blocks: FileBlock[];
    incompleteBlock?: IncompleteBlock;
    cleanedText: string;
}

const OPEN_TAG_REGEX = /<NORTH_FILE\s+path="([^"]+)"(?:\s+mode="(append)")?>/g;
const CLOSE_TAG = "</NORTH_FILE>";

export function parseFileBlocks(text: string): ParseResult {
    const blocks: FileBlock[] = [];
    let cleanedText = text;
    let offset = 0;

    OPEN_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = OPEN_TAG_REGEX.exec(text)) !== null) {
        const openTagStart = match.index;
        const openTagEnd = openTagStart + match[0].length;
        const path = match[1];

        const closeTagIndex = text.indexOf(CLOSE_TAG, openTagEnd);

        if (closeTagIndex === -1) {
            const partialContent = text.slice(openTagEnd);
            return {
                blocks,
                incompleteBlock: {
                    path,
                    partialContent,
                    startIndex: openTagStart,
                },
                cleanedText: cleanedText.slice(0, openTagStart - offset),
            };
        }

        const content = text.slice(openTagEnd, closeTagIndex);
        const blockEnd = closeTagIndex + CLOSE_TAG.length;

        blocks.push({
            path,
            content: trimFileContent(content),
            startIndex: openTagStart,
            endIndex: blockEnd,
        });

        const blockLength = blockEnd - openTagStart;
        const adjustedStart = openTagStart - offset;
        cleanedText =
            cleanedText.slice(0, adjustedStart) + cleanedText.slice(adjustedStart + blockLength);
        offset += blockLength;

        OPEN_TAG_REGEX.lastIndex = blockEnd;
    }

    return { blocks, cleanedText };
}

function trimFileContent(content: string): string {
    if (content.startsWith("\n")) {
        content = content.slice(1);
    }
    if (content.endsWith("\n")) {
        content = content.slice(0, -1);
    }
    return content;
}

export type StreamingMode = "create" | "append";

export interface SessionStartEvent {
    type: "session_start";
    path: string;
    mode: StreamingMode;
}

export interface SessionContentEvent {
    type: "session_content";
    path: string;
    chunk: string;
}

export interface SessionCompleteEvent {
    type: "session_complete";
    path: string;
}

export interface DisplayTextEvent {
    type: "display_text";
    text: string;
}

export type StreamEvent =
    | SessionStartEvent
    | SessionContentEvent
    | SessionCompleteEvent
    | DisplayTextEvent;

interface ActiveSession {
    path: string;
    mode: StreamingMode;
    contentBuffer: string;
    tagEndIndex: number;
}

export class StreamingFileBlockParser {
    private buffer = "";
    private activeSession: ActiveSession | null = null;
    private displayedLength = 0;

    append(chunk: string): StreamEvent[] {
        const events: StreamEvent[] = [];
        this.buffer += chunk;

        while (true) {
            if (this.activeSession) {
                const closeIndex = this.buffer.indexOf(CLOSE_TAG);

                if (closeIndex !== -1) {
                    const contentBeforeClose = this.buffer.slice(0, closeIndex);
                    if (contentBeforeClose.length > 0) {
                        events.push({
                            type: "session_content",
                            path: this.activeSession.path,
                            chunk: contentBeforeClose,
                        });
                    }

                    events.push({
                        type: "session_complete",
                        path: this.activeSession.path,
                    });

                    this.buffer = this.buffer.slice(closeIndex + CLOSE_TAG.length);
                    this.activeSession = null;
                    this.displayedLength = 0;
                    continue;
                } else {
                    const safeLength = Math.max(0, this.buffer.length - CLOSE_TAG.length);
                    if (safeLength > 0) {
                        const safeContent = this.buffer.slice(0, safeLength);
                        events.push({
                            type: "session_content",
                            path: this.activeSession.path,
                            chunk: safeContent,
                        });
                        this.buffer = this.buffer.slice(safeLength);
                    }
                    break;
                }
            } else {
                OPEN_TAG_REGEX.lastIndex = 0;
                const match = OPEN_TAG_REGEX.exec(this.buffer);

                if (match) {
                    const textBefore = this.buffer.slice(0, match.index);
                    const newDisplayText = textBefore.slice(this.displayedLength);
                    if (newDisplayText.length > 0) {
                        events.push({ type: "display_text", text: newDisplayText });
                    }

                    const path = match[1];
                    const mode: StreamingMode = match[2] === "append" ? "append" : "create";

                    events.push({ type: "session_start", path, mode });

                    this.activeSession = {
                        path,
                        mode,
                        contentBuffer: "",
                        tagEndIndex: match.index + match[0].length,
                    };

                    this.buffer = this.buffer.slice(match.index + match[0].length);
                    const leadingNewline = this.buffer.startsWith("\n");
                    if (leadingNewline) {
                        this.buffer = this.buffer.slice(1);
                    }
                    this.displayedLength = 0;
                } else {
                    const safeLength = Math.max(0, this.buffer.length - 50);
                    const newDisplayText = this.buffer.slice(this.displayedLength, safeLength);
                    if (newDisplayText.length > 0) {
                        events.push({ type: "display_text", text: newDisplayText });
                        this.displayedLength = safeLength;
                    }
                    break;
                }
            }
        }

        return events;
    }

    hasActiveSession(): boolean {
        return this.activeSession !== null;
    }

    getActiveSessionPath(): string | null {
        return this.activeSession?.path ?? null;
    }

    getActiveSessionMode(): StreamingMode | null {
        return this.activeSession?.mode ?? null;
    }

    flush(): StreamEvent[] {
        const events: StreamEvent[] = [];

        if (!this.activeSession && this.buffer.length > this.displayedLength) {
            events.push({
                type: "display_text",
                text: this.buffer.slice(this.displayedLength),
            });
            this.displayedLength = this.buffer.length;
        }

        return events;
    }

    reset(): void {
        this.buffer = "";
        this.activeSession = null;
        this.displayedLength = 0;
    }
}

export class FileBlockAccumulator {
    private buffer = "";
    private processedBlocks: FileBlock[] = [];

    append(chunk: string): FileBlock[] {
        this.buffer += chunk;
        const result = parseFileBlocks(this.buffer);

        if (result.blocks.length > 0) {
            this.processedBlocks.push(...result.blocks);
            this.buffer = result.cleanedText;
            if (result.incompleteBlock) {
                this.buffer += `<NORTH_FILE path="${result.incompleteBlock.path}">${result.incompleteBlock.partialContent}`;
            }
        }

        return result.blocks;
    }

    getIncompleteBlock(): IncompleteBlock | undefined {
        const result = parseFileBlocks(this.buffer);
        return result.incompleteBlock;
    }

    getCleanedText(): string {
        const result = parseFileBlocks(this.buffer);
        return result.cleanedText;
    }

    getAllBlocks(): FileBlock[] {
        return [...this.processedBlocks];
    }

    reset(): void {
        this.buffer = "";
        this.processedBlocks = [];
    }
}
