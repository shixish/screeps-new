#!/usr/bin/env node
/**
 * Deploy built code to a local folder (for servers where API auth doesn't work).
 *
 * Usage:
 *   pnpm run deploy:local   (or: pnpm run build && pnpm run deploy-local)
 *
 * If SCREEPS_LOCAL_PATH is not set, on WSL we try to find your Windows
 * Screeps script folder under /mnt/c/Users/.../AppData/Local/Screeps/scripts/.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

function findScreepsScriptFolder() {
  const base = "/mnt/c/Users";
  if (!existsSync(base)) return null;
  let candidates = [];
  try {
    const users = readdirSync(base);
    for (const u of users) {
      const scriptsDir = join(base, u, "AppData", "Local", "Screeps", "scripts");
      if (!existsSync(scriptsDir)) continue;
      const subdirs = readdirSync(scriptsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(scriptsDir, d.name));
      candidates.push(...subdirs);
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const byMtime = [...candidates].sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return byMtime[0];
  } catch {
    return null;
  }
}

const targetPath = process.env.SCREEPS_LOCAL_PATH || findScreepsScriptFolder();

if (!targetPath) {
  console.error("Set SCREEPS_LOCAL_PATH to your server's script folder.");
  console.error("");
  console.error("Example (WSL):");
  console.error('  export SCREEPS_LOCAL_PATH="/mnt/c/Users/YOU/AppData/Local/Screeps/scripts/YourName___12345"');
  console.error("");
  console.error("Find it: Screeps client → script editor → Open local folder.");
  process.exit(1);
}

const fromEnv = !!process.env.SCREEPS_LOCAL_PATH;
if (!fromEnv && targetPath) {
  console.log("Using auto-detected folder:", targetPath);
  console.log("(Set SCREEPS_LOCAL_PATH if you have multiple servers and need a different one.)");
}

const files = ["main.js", "main.js.map.js"];
for (const file of files) {
  const src = join(distDir, file);
  if (!existsSync(src)) {
    console.error("Run 'pnpm run build' first. Missing:", src);
    process.exit(1);
  }
}

// Client reads from the "default" branch folder (e.g. .../127_0_0_1___21025/default/)
const defaultPath = join(targetPath, "default");
mkdirSync(defaultPath, { recursive: true });

for (const file of files) {
  const src = join(distDir, file);
  const dest = join(defaultPath, file);
  copyFileSync(src, dest);
  console.log("Copied", file, "->", dest);
}

// Also deploy to sim so code appears in the simulator
const simPath = join(targetPath, "sim");
mkdirSync(simPath, { recursive: true });
for (const file of files) {
  const src = join(distDir, file);
  const dest = join(simPath, file);
  copyFileSync(src, dest);
  console.log("Copied", file, "->", dest);
}

console.log("Deploy complete (default + sim).");
