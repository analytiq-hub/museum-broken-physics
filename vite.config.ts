import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    // Rapier's -compat build inlines its WASM as base64, so the bundle is ~5 MB
    // (~1.8 MB gzipped). Fine for now; split it out if load time becomes a problem.
    chunkSizeWarningLimit: 6000,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
