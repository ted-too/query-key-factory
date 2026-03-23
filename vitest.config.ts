import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: "src",
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.types.ts"],
    coverage: {
      exclude: ["**/types.ts", "**/*.spec.ts", "**/*.types.ts"],
    },
    typecheck: {
      include: ["__tests__/**/*.typecheck.spec.ts"],
    },
  },
});
