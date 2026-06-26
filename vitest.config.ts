import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Keep tests hermetic, no live LLM or chain calls regardless of the local .env.
    env: { LLM_PROVIDER: "none", PERPETUA_LIVE: "0" },
  },
});
