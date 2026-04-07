/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// PROD.10 — strip dev-only localhost endpoints from the meta-tag CSP in production.
// In dev the Vite dev server does NOT serve HTTP response headers, so the only CSP
// in effect is the <meta> tag. http://localhost:4943 must stay there for the ICP
// agent to connect to the local replica.
// In production the assets canister serves a stricter HTTP header CSP (from
// .ic-assets.json5) that does NOT include localhost. Both policies are enforced
// simultaneously; the meta tag localhost entries are therefore unreachable anyway,
// but they still leak dev topology. This plugin removes them from the built HTML.
const stripDevCsp = {
  name: "strip-dev-csp",
  transformIndexHtml(html: string, ctx: { server?: unknown }): string {
    if (ctx.server) return html; // dev server running — keep localhost entries
    return html
      .replace(/\s*http:\/\/localhost:\d+/g, "")
      .replace(/\s*ws:\/\/localhost:\*/g, "");
  },
};

export default defineConfig(({ mode }) => {
  // Load .env from project root (where dfx outputs canister IDs after deploy)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    plugins: [react(), stripDevCsp],
    envDir: path.resolve(__dirname, ".."),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
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
      "process.env.AUTH_CANISTER_ID": JSON.stringify(env.CANISTER_ID_AUTH || env.AUTH_CANISTER_ID || ""),
      "process.env.PROPERTY_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PROPERTY || env.PROPERTY_CANISTER_ID || ""),
      "process.env.JOB_CANISTER_ID": JSON.stringify(env.CANISTER_ID_JOB || env.JOB_CANISTER_ID || ""),
      "process.env.CONTRACTOR_CANISTER_ID": JSON.stringify(env.CANISTER_ID_CONTRACTOR || env.CONTRACTOR_CANISTER_ID || ""),
      "process.env.QUOTE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_QUOTE || env.QUOTE_CANISTER_ID || ""),
      "process.env.PAYMENT_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PAYMENT || env.PAYMENT_CANISTER_ID || ""),
      "process.env.PHOTO_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PHOTO || env.PHOTO_CANISTER_ID || ""),
      "process.env.MONITORING_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MONITORING || env.MONITORING_CANISTER_ID || ""),
      "process.env.REPORT_CANISTER_ID": JSON.stringify(env.CANISTER_ID_REPORT || env.REPORT_CANISTER_ID || ""),
      "process.env.MAINTENANCE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MAINTENANCE || env.MAINTENANCE_CANISTER_ID || ""),
      "process.env.SENSOR_CANISTER_ID":     JSON.stringify(env.CANISTER_ID_SENSOR     || env.SENSOR_CANISTER_ID     || ""),
      "process.env.LISTING_CANISTER_ID":    JSON.stringify(env.CANISTER_ID_LISTING    || env.LISTING_CANISTER_ID    || ""),
      "process.env.AGENT_CANISTER_ID":     JSON.stringify(env.CANISTER_ID_AGENT     || env.AGENT_CANISTER_ID     || ""),
      "process.env.AI_PROXY_CANISTER_ID":  JSON.stringify(env.CANISTER_ID_AI_PROXY  || env.AI_PROXY_CANISTER_ID  || ""),
      // VITE_ prefix exposes this to import.meta.env in the browser bundle
      // (useVoiceAgent reads it as VITE_VOICE_AGENT_API_KEY, not via process.env)
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@dfinity/")) return "vendor-dfinity";
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
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      pool: "threads",
      minThreads: 2,
      maxThreads: 8,
      setupFiles: ["./src/__tests__/setup.ts", "./src/__tests__/helmet-mock-setup.ts"],
      include: ["src/__tests__/**/*.test.{ts,tsx}"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      coverage: {
        provider: "v8",
        // Only measure coverage for service-layer files that have unit tests
        include: ["src/services/**/*.ts"],
        exclude: [
          "src/services/actor.ts",       // ICP transport layer — not unit-testable
          "src/services/agentTools.ts",  // Claude API schema definitions — not unit-testable
          "src/services/index.ts",       // Re-export barrel — no logic to test
        ],
        reporter: ["text", "html", "lcov"],   // terminal summary + browsable HTML + CI/tooling
        reportsDirectory: "./coverage",
        thresholds: {
          lines:     50,
          functions: 65,
          branches:  75,
          statements: 50,
        },
      },
    },
  };
});
