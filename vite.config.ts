import path from "path";
import { createRequire } from "module";
import { defineConfig } from "vite";
import { vitePluginScreeps } from "./plugins/vite-plugin-screeps";

const require = createRequire(import.meta.url);

const dest = process.env.DEST;
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
}

let cfg: object | null = null;
if (dest) {
  try {
    const screepsConfig = require("./screeps.json") as Record<string, object>;
    cfg = { ...screepsConfig[dest] } as Record<string, unknown>;
    if (cfg == null) {
      throw new Error(`Invalid upload destination: ${dest}`);
    }
    // WSL2: localhost in WSL ≠ Windows host. Override hostname to reach server on Windows.
    const hostOverride = process.env.SCREEPS_HOST_OVERRIDE;
    if (hostOverride) {
      (cfg as Record<string, unknown>).hostname = hostOverride;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Invalid")) {
      throw err;
    }
    cfg = null;
  }
}

const srcRoot = path.resolve(__dirname, "src");

export default defineConfig({
  build: {
    target: "es2018",
    minify: true,
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
      name: "main",
      fileName: () => "main.js",
      formats: ["cjs"],
    },
    rollupOptions: {
      external: ["main.js.map"],
      output: {
        format: "cjs",
        entryFileNames: "main.js",
      },
      plugins: [vitePluginScreeps({ config: cfg ?? undefined, dryRun: cfg == null })],
    },
  },
  resolve: {
    alias: {
      utils: path.join(srcRoot, "utils"),
      managers: path.join(srcRoot, "managers"),
      creeps: path.join(srcRoot, "creeps"),
      structures: path.join(srcRoot, "structures"),
      flags: path.join(srcRoot, "flags"),
    },
  },
});
