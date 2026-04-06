import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // PocketIC ops (Wasm install, canister calls) are slow in CI
    testTimeout: 60_000,
    hookTimeout: 30_000,
    include: ["**/*.upgrade.test.ts"],
    // Run upgrade tests sequentially — each spins up its own PocketIC instance
    // but parallel instances can exhaust the pocket-ic server port range
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
