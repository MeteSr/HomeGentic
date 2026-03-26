/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load .env from project root (where dfx outputs canister IDs after deploy)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    plugins: [react()],
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
      "process.env.PRICE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PRICE || env.PRICE_CANISTER_ID || ""),
      "process.env.PAYMENT_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PAYMENT || env.PAYMENT_CANISTER_ID || ""),
      "process.env.PHOTO_CANISTER_ID": JSON.stringify(env.CANISTER_ID_PHOTO || env.PHOTO_CANISTER_ID || ""),
      "process.env.MONITORING_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MONITORING || env.MONITORING_CANISTER_ID || ""),
      "process.env.REPORT_CANISTER_ID": JSON.stringify(env.CANISTER_ID_REPORT || env.REPORT_CANISTER_ID || ""),
      "process.env.MAINTENANCE_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MAINTENANCE || env.MAINTENANCE_CANISTER_ID || ""),
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
      setupFiles: ["./src/__tests__/setup.ts"],
      include: ["src/__tests__/**/*.test.ts"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
