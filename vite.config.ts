import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset URLs, so the build works both at a domain root and under
  // GitHub Pages' /museum-broken-physics/ subpath.
  base: "./",
  // The repo's star count at build time, for the GitHub link on the cards (CI sets REPO_STARS).
  define: { BUILD_REPO_STARS: JSON.stringify(Number(process.env.REPO_STARS) || 0) },
  build: {
    // Rapier's -compat build inlines its WASM as base64, so the bundle is ~5 MB
    // (~1.8 MB gzipped). Fine for now; split it out if load time becomes a problem.
    chunkSizeWarningLimit: 6000,
    // harness/budget.ts reads it to check download sizes (run after every build).
    manifest: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
