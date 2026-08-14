import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/main/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  platform: "browser",
  logLevel: "info"
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
