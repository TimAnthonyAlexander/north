import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const distDir = join(projectRoot, "dist");
const libDir = join(distDir, "lib");

const platform = process.platform;
const arch = process.arch;

let libFileName: string;
if (platform === "darwin") {
    libFileName = arch === "arm64" ? "librust_pty_arm64.dylib" : "librust_pty.dylib";
} else if (platform === "linux") {
    libFileName = arch === "arm64" ? "librust_pty_arm64.so" : "librust_pty.so";
} else if (platform === "win32") {
    libFileName = "rust_pty.dll";
} else {
    console.warn(`Warning: Unsupported platform ${platform}-${arch}. Shell commands may not work.`);
    process.exit(0);
}

const sourceLib = join(projectRoot, "node_modules", "bun-pty", "rust-pty", "target", "release", libFileName);
const targetLib = join(libDir, libFileName);

if (!existsSync(sourceLib)) {
    console.error(`Error: Native library not found at ${sourceLib}`);
    console.error("Please run 'bun install' to install dependencies.");
    process.exit(1);
}

if (!existsSync(libDir)) {
    mkdirSync(libDir, { recursive: true });
}

try {
    copyFileSync(sourceLib, targetLib);
    console.log(`✓ Copied ${libFileName} to dist/lib/`);
} catch (error) {
    console.error(`Error copying native library: ${error}`);
    process.exit(1);
}

