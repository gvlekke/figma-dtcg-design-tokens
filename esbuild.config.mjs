import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

/** Serves `virtual:build-info` with a fresh timestamp on every (watch) build. */
const buildInfo = {
  name: "build-info",
  setup(build) {
    build.onResolve({ filter: /^virtual:build-info$/ }, (args) => ({
      path: args.path,
      namespace: "build-info"
    }));
    build.onLoad({ filter: /.*/, namespace: "build-info" }, () => {
      const { version } = JSON.parse(readFileSync("package.json", "utf8"));
      return {
        contents: `export const version = ${JSON.stringify(version)};
export const buildTime = ${JSON.stringify(new Date().toISOString())};`,
        loader: "js"
      };
    });
  }
};

const options = {
  entryPoints: ["src/main/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  platform: "browser",
  logLevel: "info",
  plugins: [buildInfo]
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
