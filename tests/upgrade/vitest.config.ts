import { defineConfig } from "vitest/config";
import { resolve } from "path";

// The mobile app's services run here against PocketIC, but its dependencies
// (Expo and all) aren't installed in CI. Its one runtime dependency these
// files need, @icp-sdk/core, is resolved from the frontend's install (same
// version); everything else they import is dependency-free or hoisted.
const FRONTEND = resolve(__dirname, "../../frontend/package.json");
const mobileDeps = {
  name: "mobile-deps-from-frontend",
  enforce: "pre" as const,
  async resolveId(this: any, source: string, importer?: string) {
    if (!importer || !importer.includes("/mobile/src/") || !source.startsWith("@icp-sdk/core")) return null;
    return this.resolve(source, FRONTEND, { skipSelf: true });
  },
};

export default defineConfig({
  plugins: [mobileDeps],
  // mobile/tsconfig.json extends expo/tsconfig.base, which isn't installed
  // here; these files need no tsconfig to strip their types.
  oxc: { tsconfig: false } as any,
  // dashboard/src and mobile/src import the shared declarations by their package name.
  resolve: { alias: { "@homegentic/shared": resolve(__dirname, "../../packages/shared/src") } },
  test: {
    environment: "node",
    globals: true,
    // PocketIC ops (Wasm install, canister calls) are slow in CI
    testTimeout: 60_000,
    hookTimeout: 30_000,
    include: ["**/*.upgrade.test.ts", "**/*.perf.test.ts", "**/*.canister.test.ts"],
    // Run upgrade tests sequentially — each spins up its own PocketIC instance
    // but parallel instances can exhaust the pocket-ic server port range
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
