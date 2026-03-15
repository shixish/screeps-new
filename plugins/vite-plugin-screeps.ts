/**
 * Vite-compatible Screeps upload plugin.
 * Adapts rollup-plugin-screeps for Vite's output structure (dir + entryFileNames vs file).
 */
import type { Plugin } from "vite";
import screeps from "rollup-plugin-screeps";

export function vitePluginScreeps(options: {
  config?: object;
  configFile?: string;
  dryRun?: boolean;
}): Plugin {
  const screepsPlugin = screeps(options) as Plugin & {
    generateBundle?: (options: unknown, bundle: unknown, isWrite: boolean) => void;
    writeBundle?: (options: unknown, bundle: unknown) => void;
  };

  return {
    name: "vite-plugin-screeps",
    apply: "build",
    generateBundle(outputOptions, bundle) {
      screepsPlugin.generateBundle?.(outputOptions, bundle, true);
    },
    writeBundle(outputOptions, bundle) {
      // Vite lib mode uses output.dir + chunk.fileName; rollup-plugin-screeps expects output.file
      const dir = (outputOptions as { dir?: string }).dir ?? "dist";
      const chunks = Object.values(bundle).filter((c) => (c as { type?: string }).type === "chunk");
      const mainChunk = chunks.find((c) => (c as { fileName?: string }).fileName?.endsWith(".js"));
      const fileName = (mainChunk as { fileName?: string })?.fileName ?? "main.js";
      const outputFile = `${dir}/${fileName}`.replace(/\/+/g, "/");

      // Patch options for screeps plugin
      const patchedOptions = { ...outputOptions, file: outputFile };
      screepsPlugin.writeBundle?.(patchedOptions, bundle);
    },
  };
}
