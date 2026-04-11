/**
 * Vitest configuration for integration tests.
 *
 * Integration tests call the real ICP canisters running on the local replica.
 * They require:
 *   1. A running local replica:  dfx start --background
 *   2. Deployed canisters:       make deploy  (or bash scripts/deploy.sh)
 *   3. Canister IDs exported:    BILLS_CANISTER_ID=<id> npm run test:integration
 *
 * Quickstart (from repo root):
 *   make deploy && npm run test:integration
 *
 * Key differences from the unit test config (vite.config.ts `test` block):
 *   - environment: "node"   — no jsdom; ICP SDK works in Node fine
 *   - No `process.env.VITEST` trickery — real CANISTER_ID bypasses mock path directly
 *   - Longer timeouts — canister calls over HTTP are slower than in-memory
 *   - setupFiles creates a real agent with a deterministic Ed25519 identity
 *   - Tests skip themselves if CANISTER_IDs are not set (safe for CI without replica)
 */

import { defineConfig } from "vitest/config";
import path from "path";
import { config as dotenvConfig } from "dotenv";

// Load canister IDs written by `dfx deploy` / `make deploy`.
// dfx writes CANISTER_ID_<NAME> vars to .env in the repo root.
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Mirror vite.config.ts mappings so services read the right env var names.
    // Integration tests do NOT go through Vite's transform, so we define here.
    "process.env.DFX_NETWORK":        JSON.stringify(process.env.DFX_NETWORK        || "local"),
    "process.env.BILLS_CANISTER_ID":  JSON.stringify(process.env.CANISTER_ID_BILLS  || process.env.BILLS_CANISTER_ID  || ""),
    "process.env.LISTING_CANISTER_ID":JSON.stringify(process.env.CANISTER_ID_LISTING || process.env.LISTING_CANISTER_ID|| ""),
    "process.env.JOB_CANISTER_ID":    JSON.stringify(process.env.CANISTER_ID_JOB    || process.env.JOB_CANISTER_ID    || ""),
    "process.env.PROPERTY_CANISTER_ID":JSON.stringify(process.env.CANISTER_ID_PROPERTY||process.env.PROPERTY_CANISTER_ID||""),
    "process.env.PAYMENT_CANISTER_ID":JSON.stringify(process.env.CANISTER_ID_PAYMENT || process.env.PAYMENT_CANISTER_ID|| ""),
    // VITE_ vars used by billsIntelligence and other services
    "import.meta.env.VITE_VOICE_AGENT_URL": JSON.stringify(process.env.VITE_VOICE_AGENT_URL || "http://localhost:3001"),
    "import.meta.env.DEV": JSON.stringify(true),
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/integration/**/*.integration.test.ts"],
    setupFiles: ["./src/__tests__/integration/setup.ts"],
    testTimeout:  30_000,   // canister calls can be slow on cold replica
    hookTimeout:  30_000,
    reporters: ["verbose"],
    // Run integration tests serially — shared canister state means parallel
    // writes can produce unexpected interleaving across test files.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
