import type {
    ToolDefinition,
    ToolContext,
    ToolResult,
    DetectLanguagesOutput,
    LanguageEntry,
} from "./types";
import { createIgnoreChecker, walkDirectory } from "../utils/ignore";
import { extname } from "path";

const EXTENSION_MAP: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".swift": "Swift",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".hxx": "C++",
    ".cs": "C#",
    ".rb": "Ruby",
    ".php": "PHP",
    ".scala": "Scala",
    ".clj": "Clojure",
    ".cljs": "ClojureScript",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".erl": "Erlang",
    ".hrl": "Erlang",
    ".hs": "Haskell",
    ".lhs": "Haskell",
    ".ml": "OCaml",
    ".mli": "OCaml",
    ".lua": "Lua",
    ".r": "R",
    ".R": "R",
    ".jl": "Julia",
    ".pl": "Perl",
    ".pm": "Perl",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".fish": "Shell",
    ".ps1": "PowerShell",
    ".sql": "SQL",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "SCSS",
    ".less": "Less",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".xml": "XML",
    ".md": "Markdown",
    ".markdown": "Markdown",
    ".rst": "reStructuredText",
    ".toml": "TOML",
    ".ini": "INI",
    ".cfg": "INI",
    ".dockerfile": "Dockerfile",
    ".tf": "Terraform",
    ".proto": "Protocol Buffers",
    ".graphql": "GraphQL",
    ".gql": "GraphQL",
    ".zig": "Zig",
    ".nim": "Nim",
    ".d": "D",
    ".dart": "Dart",
    ".groovy": "Groovy",
    ".gradle": "Gradle",
    ".cmake": "CMake",
    ".make": "Makefile",
    ".mk": "Makefile",
};

function getLanguage(filename: string): string | null {
    const ext = extname(filename).toLowerCase();

    if (ext && EXTENSION_MAP[ext]) {
        return EXTENSION_MAP[ext];
    }

    const lowerName = filename.toLowerCase();
    if (lowerName === "dockerfile" || lowerName.startsWith("dockerfile.")) {
        return "Dockerfile";
    }
    if (lowerName === "makefile" || lowerName === "gnumakefile") {
        return "Makefile";
    }
    if (lowerName === "cmakelists.txt") {
        return "CMake";
    }

    return null;
}

export const detectLanguagesTool: ToolDefinition<void, DetectLanguagesOutput> = {
    name: "detect_languages",
    description:
        "Detect the approximate language composition of the repository based on file extensions and sizes.",
    inputSchema: {
        type: "object",
        properties: {},
    },
    async execute(_args: void, ctx: ToolContext): Promise<ToolResult<DetectLanguagesOutput>> {
        const checker = createIgnoreChecker(ctx.repoRoot);
        const entries = walkDirectory(ctx.repoRoot, checker, { maxFiles: 20000, maxDepth: 15 });

        const bytesByLanguage = new Map<string, number>();
        let totalBytes = 0;

        for (const entry of entries) {
            if (entry.isDir) continue;

            const language = getLanguage(entry.relativePath);
            if (!language) continue;

            const currentBytes = bytesByLanguage.get(language) || 0;
            bytesByLanguage.set(language, currentBytes + entry.size);
            totalBytes += entry.size;
        }

        if (totalBytes === 0) {
            return {
                ok: true,
                data: { languages: [] },
            };
        }

        const languages: LanguageEntry[] = Array.from(bytesByLanguage.entries())
            .map(([language, bytes]) => ({
                language,
                bytes,
                percent: (bytes / totalBytes) * 100,
            }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 15);

        return {
            ok: true,
            data: { languages },
        };
    },
};
