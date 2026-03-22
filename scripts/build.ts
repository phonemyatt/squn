import { $ } from "bun";

// Clean previous build
await $`rm -rf dist`;

// Bundle JS — single entry point, ESM, targeting Bun
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: true,
  minify: false,
  sourcemap: "external",
  external: ["mssql"],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Generate declaration files
await $`bunx tsc -p tsconfig.build.json`;

console.log("Build complete — dist/index.js + declarations emitted.");
