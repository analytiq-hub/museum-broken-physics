// Config for harness reports (`npm run solve`): human-readable output, not CI gates.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["harness/**/*.report.test.ts"],
    testTimeout: 120_000,
  },
});
