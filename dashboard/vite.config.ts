import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execFileSync } from "child_process";

/**
 * Local network root key + API URL, read from `icp network status --json` at
 * dev/build time so the browser never calls fetchRootKey() (canister-security
 * skill, pitfall 7). IC_ROOT_KEY / IC_API_URL in .env override it. Mainnet
 * builds get nothing and the agent uses its built-in mainnet root key.
 */
function localNetwork(env: Record<string, string>): { rootKey: string; apiUrl: string } {
  if (env.IC_ROOT_KEY) return { rootKey: env.IC_ROOT_KEY, apiUrl: env.IC_API_URL || "" };
  try {
    const out = execFileSync("icp", ["network", "status", "--json"], {
      cwd: path.resolve(__dirname, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
    });
    const s = JSON.parse(out);
    return { rootKey: String(s.root_key || ""), apiUrl: String(s.api_url || env.IC_API_URL || "") };
  } catch {
    console.warn("[dashboard] could not read the local root key (is `icp network start` running?)");
    return { rootKey: "", apiUrl: env.IC_API_URL || "" };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const network = env.DFX_NETWORK || "local";
  const local = network === "local" ? localNetwork(env) : { rootKey: "", apiUrl: "" };

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, ".."),
    server: {
      port: 3002,
    },
    define: {
      "process.env.DFX_NETWORK":         JSON.stringify(network),
      "process.env.AUTH_CANISTER_ID":     JSON.stringify(env.CANISTER_ID_AUTH     || env.AUTH_CANISTER_ID     || ""),
      "process.env.PAYMENT_CANISTER_ID":  JSON.stringify(env.CANISTER_ID_PAYMENT  || env.PAYMENT_CANISTER_ID  || ""),
      "process.env.MONITORING_CANISTER_ID": JSON.stringify(env.CANISTER_ID_MONITORING || env.MONITORING_CANISTER_ID || ""),
      "process.env.IC_ROOT_KEY":         JSON.stringify(local.rootKey),
      "process.env.IC_API_URL":          JSON.stringify(local.apiUrl),
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});
