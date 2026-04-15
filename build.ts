const build = await Bun.build({
  entrypoints: ["./src/lib/q.ts"],
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
