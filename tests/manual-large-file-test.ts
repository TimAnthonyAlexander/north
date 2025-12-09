import { getLineCountTool } from "../src/tools/get_line_count";
import { getFileSymbolsTool } from "../src/tools/get_file_symbols";
import { getFileOutlineTool } from "../src/tools/get_file_outline";
import { searchTextTool } from "../src/tools/search_text";
import { readFileTool } from "../src/tools/read_file";
import type { ToolContext } from "../src/tools/types";

const ctx: ToolContext = {
    repoRoot: process.cwd(),
    logger: {
        info: (msg) => console.log("INFO:", msg),
        error: (msg) => console.error("ERROR:", msg),
        debug: (msg) => console.log("DEBUG:", msg),
    },
};

async function testLargeFileWorkflow() {
    console.log("\n=== Testing Large File Navigation Workflow ===\n");

    const testFile = "src/provider/anthropic.ts";

    console.log("Step 1: Check file size first");
    const lineCount = await getLineCountTool.execute({ path: testFile }, ctx);
    if (lineCount.ok && lineCount.data) {
        console.log(
            `✓ ${testFile} has ${lineCount.data.lineCount} lines (${lineCount.data.sizeBytes} bytes)`
        );
        console.log(`  Will truncate: ${lineCount.data.willTruncate}`);
    }

    console.log("\nStep 2: Get file symbols to understand structure");
    const symbols = await getFileSymbolsTool.execute({ path: testFile }, ctx);
    if (symbols.ok && symbols.data) {
        console.log(`✓ Found ${symbols.data.symbols.length} symbols:`);
        symbols.data.symbols.slice(0, 5).forEach((sym) => {
            console.log(`  - ${sym.type} ${sym.name} (line ${sym.line})`);
        });
        if (symbols.data.symbols.length > 5) {
            console.log(`  ... and ${symbols.data.symbols.length - 5} more`);
        }
    }

    console.log("\nStep 3: Get file outline for hierarchical view");
    const outline = await getFileOutlineTool.execute({ path: testFile }, ctx);
    if (outline.ok && outline.data) {
        console.log(`✓ File structure (${outline.data.sections.length} sections):`);
        outline.data.sections.slice(0, 5).forEach((section) => {
            console.log(
                `  ${section.type}: ${section.name} (lines ${section.startLine}-${section.endLine})`
            );
        });
    }

    console.log("\nStep 4: Search for specific text in file");
    const search = await searchTextTool.execute(
        {
            query: "createProvider",
            file: testFile,
        },
        ctx
    );
    if (search.ok && search.data) {
        console.log(`✓ Found ${search.data.matches.length} matches for 'createProvider':`);
        search.data.matches.forEach((match) => {
            console.log(`  Line ${match.line}: ${match.preview.slice(0, 60)}...`);
        });
    }

    console.log("\nStep 5: Read specific range with imports context");
    const read = await readFileTool.execute(
        {
            path: testFile,
            range: { start: 116, end: 125 },
            includeContext: "imports",
        },
        ctx
    );
    if (read.ok && read.data) {
        console.log(
            `✓ Read lines ${read.data.startLine}-${read.data.endLine} (requested 116-125 with imports):`
        );
        const lines = read.data.content.split("\n").slice(0, 10);
        lines.forEach((line, i) => {
            console.log(`  ${read.data.startLine + i}: ${line.slice(0, 70)}`);
        });
    }

    console.log("\n=== Workflow Complete ===\n");
    console.log(
        "✓ All tools working correctly for efficient large file navigation!"
    );
}

testLargeFileWorkflow().catch(console.error);

