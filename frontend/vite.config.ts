/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Canisters the frontend calls; each maps to a process.env.<NAME>_CANISTER_ID below.
const REQUIRED_CANISTERS = [
  "AUTH", "PROPERTY", "JOB", "CONTRACTOR", "QUOTE", "PAYMENT", "PHOTO", "MONITORING",
  "REPORT", "MAINTENANCE", "SENSOR", "LISTING", "AGENT", "FEE", "AI_PROXY", "MARKET",
  "BILLS", "REFERRALS", "RECURRING",
];

export default defineConfig(({ mode, command }) => {
  // Load .env from project root (where dfx outputs canister IDs after deploy)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  // deploy.sh sets REQUIRE_CANISTER_IDS for testnet/mainnet builds. A missing
  // ID would make that service fall back to mock or empty data in production,
  // so the build fails instead.
  if (command === "build" && process.env.REQUIRE_CANISTER_IDS === "1") {
    const missing = REQUIRED_CANISTERS.filter(
      (c) => !(env[`CANISTER_ID_${c}`] || env[`${c}_CANISTER_ID`]),
    );
    if (missing.length) {
      throw new Error(`Missing canister IDs for a ${env.DFX_NETWORK || "network"} build: ${missing.join(", ")}`);
    }
  }

  // PROD.10 — strip dev-only localhost endpoints from the meta-tag CSP.
  // Only strip on IC mainnet builds (DFX_NETWORK=ic). Local and testnet builds
  // keep localhost so the asset canister can still reach the local replica at
  // localhost:4943. On mainnet the assets canister serves a stricter HTTP-header
  // CSP (.ic-assets.json5) that already excludes localhost.
  const stripDevCsp = {
    name: "strip-dev-csp",
    transformIndexHtml(html: string, ctx: { server?: unknown }): string {
      if (ctx.server) {
        // dev server running — keep localhost entries, plus the live browser
        // tests' PocketIC gateway (LOCAL_IC_HOST) when one is set.
        const extra = env.LOCAL_IC_HOST ? new URL(env.LOCAL_IC_HOST).origin : "";
        return extra ? html.replace(/http:\/\/localhost:4943/g, `http://localhost:4943 ${extra}`) : html;
      }
      if ((env.DFX_NETWORK || "local") !== "ic") return html; // local/testnet — keep localhost
      return html
        .replace(/\s*http:\/\/localhost:\d+/g, "")
        .replace(/\s*ws:\/\/localhost:\*/g, "");
    },
  };

  // The notification relay and IoT gateway are optional, so their CSP entries
  // can't use Vite's %VITE_…% substitution (an unset variable is left in as a
  // literal).
  const originOf = (url: string | undefined): string => {
    try {
      return url ? new URL(url).origin : "";
    } catch { return ""; /* malformed URL — leave it out of the CSP */ }
  };
  const notificationsCsp = {
    name: "notifications-csp",
    transformIndexHtml(html: string): string {
      const relay   = originOf(env.VITE_NOTIFICATIONS_URL);
      const gateway = originOf(env.VITE_IOT_GATEWAY_URL);
      return html
        .replace(" __NOTIFICATIONS_ORIGIN__", relay ? ` ${relay}` : "")
        .replace(" __IOT_GATEWAY_ORIGIN__", gateway ? ` ${gateway}` : "");
    },
  };

  return {
    plugins: [react(), stripDevCsp, notificationsCsp],
    envDir: path.resolve(__dirname, ".."),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@homegentic/shared": path.resolve(__dirname, "../packages/shared/src"),
      },
    },
    server: {
      port: 3000,
      // packages/shared lives outside the Vite root.
      fs: { allow: [path.resolve(__dirname, "..")] },
      proxy: {
        "/api": {
          target: "http://localhost:4943",
          changeOrigin: true,
        },
      },
    },
    define: {
      // dfx outputs CANISTER_ID_<NAME>; map to the names services expect
      "process.env.DFX_NETWORK": JSON.stringify(env.DFX_NETWORK || "local"),
      "process.env.LOCAL_IC_HOST": JSON.stringify(env.LOCAL_IC_HOST || ""),
      "process.env.AUTH_CANISTER_ID": JSON.stringify(env.CANISTER_ID_AUTH || env.AUTH_CANISTER_ID || ""),
      "process.env.PROPERTY_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PROPERTY || env.PROPERTY_CANISTER_ID || ""),
      "process.env.JOB_CANISTER_ID": JSON.stringify(env.CANISTER_ID_JOB || env.JOB_CANISTER_ID || ""),
      "process.env.CONTRACTOR_CANISTER_ID": JSON.stringify(env.CANISTER_ID_CONTRACTOR || env.CONTRACTOR_CANISTER_ID || ""),
      "process.env.QUOTE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_QUOTE || env.QUOTE_CANISTER_ID || ""),
      // In test mode, fall back to a placeholder ID so service code paths
      // reach the mocked actor rather than returning early on !CANISTER_ID.
      "process.env.PAYMENT_CANISTER_ID": JSON.stringify(
        mode === "test"
          ? (env.CANISTER_ID_PAYMENT || env.PAYMENT_CANISTER_ID || "rrkah-fqaaa-aaaaa-aaaaq-cai")
          : (env.CANISTER_ID_PAYMENT || env.PAYMENT_CANISTER_ID || "")
      ),
      "process.env.PHOTO_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PHOTO || env.PHOTO_CANISTER_ID || ""),
      "process.env.MONITORING_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MONITORING || env.MONITORING_CANISTER_ID || ""),
      "process.env.REPORT_CANISTER_ID": JSON.stringify(env.CANISTER_ID_REPORT || env.REPORT_CANISTER_ID || ""),
      "process.env.MAINTENANCE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MAINTENANCE || env.MAINTENANCE_CANISTER_ID || ""),
      "process.env.SENSOR_CANISTER_ID":     JSON.stringify(env.CANISTER_ID_SENSOR     || env.SENSOR_CANISTER_ID     || ""),
      "process.env.LISTING_CANISTER_ID":    JSON.stringify(env.CANISTER_ID_LISTING    || env.LISTING_CANISTER_ID    || ""),
      "process.env.AGENT_CANISTER_ID":      JSON.stringify(env.CANISTER_ID_AGENT      || env.AGENT_CANISTER_ID      || ""),
      "process.env.FEE_CANISTER_ID":        JSON.stringify(env.CANISTER_ID_FEE        || env.FEE_CANISTER_ID        || ""),
      "process.env.AI_PROXY_CANISTER_ID":  JSON.stringify(env.CANISTER_ID_AI_PROXY  || env.AI_PROXY_CANISTER_ID  || ""),
      "process.env.MARKET_CANISTER_ID":    JSON.stringify(env.CANISTER_ID_MARKET    || env.MARKET_CANISTER_ID    || ""),
      "process.env.BILLS_CANISTER_ID":      JSON.stringify(env.CANISTER_ID_BILLS      || env.BILLS_CANISTER_ID      || ""),
      "process.env.REFERRALS_CANISTER_ID":  JSON.stringify(env.CANISTER_ID_REFERRALS  || env.REFERRALS_CANISTER_ID  || ""),
      // Was missing: Vite turns an undefined process.env.X into {}.X, so the
      // recurring service always ran with an empty canister ID in builds.
      "process.env.RECURRING_CANISTER_ID":  JSON.stringify(env.CANISTER_ID_RECURRING  || env.RECURRING_CANISTER_ID  || ""),
      "process.env.INTERNET_IDENTITY_CANISTER_ID": JSON.stringify(env.CANISTER_ID_INTERNET_IDENTITY || ""),
      // VITE_ prefix exposes this to import.meta.env in the browser bundle
      // (useVoiceAgent reads it as VITE_VOICE_AGENT_API_KEY, not via process.env)
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // @icp-sdk/auth stays out: it loads on demand, at sign-in.
            if (id.includes("@dfinity/") || id.includes("@icp-sdk/core/")) return "vendor-dfinity";
            if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
            if (
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/zustand") ||
              id.includes("node_modules/react-hot-toast") ||
              id.includes("node_modules/lucide-react")
            ) return "vendor-ui";
          },
        },
      },
    },
    optimizeDeps: {
      rolldownOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      pool: "threads",
      testTimeout: 30000,
      hookTimeout: 30000,
      setupFiles: ["./src/__tests__/setup.ts"],
      include: ["src/__tests__/**/*.test.{ts,tsx}"],
      exclude: ["src/__tests__/integration/**"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@homegentic/shared": path.resolve(__dirname, "../packages/shared/src"),
      },
      coverage: {
        provider: "istanbul",
        // Widened from src/services/** only — that scope let hooks/, components/,
        // pages/, and contexts/ (185 files, the bulk of the app's actual user-facing
        // logic) go completely unmeasured and ungated by CI. Thresholds below are
        // the real measured baseline at widen-time (rounded down a few points so
        // routine changes don't flake the gate); raise them as coverage improves,
        // never lower them to make a PR pass.
        include: ["src/{services,hooks,components,pages,contexts}/**/*.{ts,tsx}"],
        exclude: [
          "src/services/actor.ts",       // ICP transport layer — not unit-testable
          "src/services/agentTools.ts",  // Claude API schema definitions — not unit-testable
          "src/services/index.ts",       // Re-export barrel — no logic to test
        ],
        reporter: ["text", "html", "lcov", "json-summary"],   // terminal + browsable HTML + CI/tooling + PR comments
        reportsDirectory: "./coverage",
        thresholds: {
          lines:      74,
          functions:  66,
          branches:   65,
          statements: 71,
        },
      },
    },
  };
});
