import { defineConfig } from "tsup";

// Bundles first-party server code into dist-server/ as ESM; dependencies stay
// external and are resolved from node_modules at runtime.
export default defineConfig({
  entry: ["server/index.ts", "server/migrate.ts"],
  outDir: "dist-server",
  format: "esm",
  target: "node22",
  clean: true,
});
