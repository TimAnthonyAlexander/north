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

const OPEN_TAG_REGEX = /<NORTH_FILE\s+path="([^"]+)">/g;
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
        cleanedText = cleanedText.slice(0, adjustedStart) + cleanedText.slice(adjustedStart + blockLength);
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

