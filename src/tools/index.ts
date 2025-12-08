export * from "./types";
export * from "./registry";
export { listRootTool } from "./list_root";
export { readFileTool } from "./read_file";
export { searchTextTool } from "./search_text";
export { findFilesTool } from "./find_files";
export { readReadmeTool } from "./read_readme";
export { detectLanguagesTool } from "./detect_languages";
export { hotfilesTool } from "./hotfiles";
export { editReplaceExactTool } from "./edit_replace_exact";
export { editInsertAtLineTool } from "./edit_insert_at_line";
export { editCreateFileTool } from "./edit_create_file";
export { editApplyBatchTool } from "./edit_apply_batch";
export { shellRunTool } from "./shell_run";

import { createToolRegistry, type ToolRegistry } from "./registry";
import { listRootTool } from "./list_root";
import { readFileTool } from "./read_file";
import { searchTextTool } from "./search_text";
import { findFilesTool } from "./find_files";
import { readReadmeTool } from "./read_readme";
import { detectLanguagesTool } from "./detect_languages";
import { hotfilesTool } from "./hotfiles";
import { editReplaceExactTool } from "./edit_replace_exact";
import { editInsertAtLineTool } from "./edit_insert_at_line";
import { editCreateFileTool } from "./edit_create_file";
import { editApplyBatchTool } from "./edit_apply_batch";
import { shellRunTool } from "./shell_run";

export function createToolRegistryWithAllTools(): ToolRegistry {
    const registry = createToolRegistry();

    registry.register(listRootTool);
    registry.register(readFileTool);
    registry.register(searchTextTool);
    registry.register(findFilesTool);
    registry.register(readReadmeTool);
    registry.register(detectLanguagesTool);
    registry.register(hotfilesTool);
    registry.register(editReplaceExactTool);
    registry.register(editInsertAtLineTool);
    registry.register(editCreateFileTool);
    registry.register(editApplyBatchTool);
    registry.register(shellRunTool);

    return registry;
}

