/**
 * The real web app against real canisters: all 20 canisters on PocketIC,
 * wired as CI wires them (deployAll), PocketIC's HTTP gateway live, and the
 * Vite dev server pointed at it (LOCAL_IC_HOST, CANISTER_ID_*). Sign-in uses
 * the dev login button (a fixed local key; window.__e2e_local_seed picks
 * another person). Nothing is mocked: no window.__e2e_* data is injected.
 */

import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { createIdentity, PocketIc } from "@dfinity/pic";
import { createPic } from "./setup";
import { deployAll, ALL_CANISTERS, type Deployment } from "./deployAll";

const ROOT = resolve(__dirname, "../../..");

export interface LiveApp {
  pic: PocketIc;
  deployment: Deployment;
  admin: ReturnType<typeof createIdentity>;
  baseUrl: string;
  gatewayUrl: string;
  stop: () => Promise<void>;
}

async function waitFor(url: string, ms: number, proc: ChildProcess, log: () => string) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`Vite exited (${proc.exitCode}):\n${log()}`);
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite didn't start within ${ms} ms:\n${log()}`);
}

export async function startLiveApp(port = 3123): Promise<LiveApp> {
  const pic = await createPic();
  // Wall-clock time, so the browser's request expiry and certificates line up.
  await pic.setTime(Date.now());
  await pic.tick();
  const admin = createIdentity("live-admin");
  const deployment = await deployAll(pic, admin);
  const gatewayUrl = `http://localhost:${await pic.makeLive()}`;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    DFX_NETWORK: "local",
    LOCAL_IC_HOST: gatewayUrl,
    // No voice agent or Stripe in these tests.
    VITE_VOICE_AGENT_URL: "",
  };
  for (const name of ALL_CANISTERS) env[`CANISTER_ID_${name.toUpperCase()}`] = deployment.ids[name].toText();

  const baseUrl = `http://localhost:${port}`;
  // Another server already on the port would answer for ours, pointed at
  // the wrong canisters.
  if (await fetch(baseUrl).then(() => true, () => false)) {
    await pic.tearDown();
    throw new Error(`Something is already listening on ${baseUrl}`);
  }
  let out = "";
  const vite = spawn(process.execPath, [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], {
    cwd: resolve(ROOT, "frontend"), env, stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout!.on("data", (d) => { out += d; });
  vite.stderr!.on("data", (d) => { out += d; });
  try {
    await waitFor(baseUrl, 60_000, vite, () => out);
  } catch (e) {
    vite.kill();
    await pic.tearDown();
    throw e;
  }

  // The PocketIC server stops itself after a minute without calls to its own
  // API; browser traffic goes to the gateway, so keep the server busy.
  const heartbeat = setInterval(() => { pic.getTime().catch(() => {}); }, 15_000);

  return {
    pic, deployment, admin, baseUrl, gatewayUrl,
    stop: async () => {
      clearInterval(heartbeat);
      vite.kill();
      await pic.stopLive().catch(() => {});
      await pic.tearDown();
    },
  };
}
