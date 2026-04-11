const build = await Bun.build({
  entrypoints: [
    "./src/lib/create-query-key-store.ts",
    "./src/lib/create-query-keys.ts",
    "./src/lib/merge-query-keys.ts",
    "./src/lib/tuple-key.ts",
  ],
  outdir: "./dist",
  format: "esm",
  target: "node",
});

if (!build.success) {
  for (const log of build.logs) {
    console.error(log);
  }

  process.exit(1);
}

for (const log of build.logs) {
  console.warn(log);
}

await Bun.write(
  "./dist/index.js",
  `export { createQueryKeyStore } from "./create-query-key-store.js";
export { createQueryKeys } from "./create-query-keys.js";
export { mergeQueryKeys } from "./merge-query-keys.js";
export { tupleKey } from "./tuple-key.js";
`
);
