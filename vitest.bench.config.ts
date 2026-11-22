// Config for the physics step-time benchmark (`npm run bench`), kept apart from
// the unit tests so `npm test` stays fast.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["bench/**/*.bench.test.ts"],
  },
});
