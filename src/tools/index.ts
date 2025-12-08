export * from "./types";
export * from "./registry";
export { listRootTool } from "./list_root";
export { readFileTool } from "./read_file";
export { searchTextTool } from "./search_text";
export { findFilesTool } from "./find_files";
export { readReadmeTool } from "./read_readme";
export { detectLanguagesTool } from "./detect_languages";
export { hotfilesTool } from "./hotfiles";

import { createToolRegistry, type ToolRegistry } from "./registry";
import { listRootTool } from "./list_root";
import { readFileTool } from "./read_file";
import { searchTextTool } from "./search_text";
import { findFilesTool } from "./find_files";
import { readReadmeTool } from "./read_readme";
import { detectLanguagesTool } from "./detect_languages";
import { hotfilesTool } from "./hotfiles";

export function createToolRegistryWithAllTools(): ToolRegistry {
  const registry = createToolRegistry();

  registry.register(listRootTool);
  registry.register(readFileTool);
  registry.register(searchTextTool);
  registry.register(findFilesTool);
  registry.register(readReadmeTool);
  registry.register(detectLanguagesTool);
  registry.register(hotfilesTool);

  return registry;
}

