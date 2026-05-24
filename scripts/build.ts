import { $ } from "bun";
import * as esbuild from "esbuild";

// Clean previous build
await $`rm -rf dist`;

// Bundle JS — single entry point, ESM, targeting Node-compatible consumers
await esbuild.build({
  entryPoints: ["./src/index.ts"],
  outfile: "./dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["mssql", "bun", "bun:sqlite"],
  sourcemap: true,
  minify: false,
  logLevel: "warning",
});

// Generate declaration files
await $`bunx tsc -p tsconfig.build.json`;

console.log("Build complete — dist/index.js + declarations emitted.");
