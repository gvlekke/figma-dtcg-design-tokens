import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const BUILD_INFO_ID = "virtual:build-info";

/** Serves `virtual:build-info` with a fresh timestamp on every (watch) build. */
function buildInfo(): Plugin {
  return {
    name: "build-info",
    resolveId: (id) => (id === BUILD_INFO_ID ? `\0${BUILD_INFO_ID}` : null),
    load(id) {
      if (id !== `\0${BUILD_INFO_ID}`) return null;
      const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
      return `export const version = ${JSON.stringify(version)};
export const buildTime = ${JSON.stringify(new Date().toISOString())};`;
    }
  };
}

export default defineConfig({
  plugins: [buildInfo(), preact(), viteSingleFile()],
  root: "src/ui",
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
    target: "es2020"
  }
});
