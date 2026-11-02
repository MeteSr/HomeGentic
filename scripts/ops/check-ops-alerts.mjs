#!/usr/bin/env node
// Hourly ops check (run by .github/workflows/cycle-watchdog.yml): reads the
// monitoring canister's critical alerts, service errors and frontend errors
// (rules in opsAlerts.mjs) and checks the relays' /health. Prints what it
// found and exits 1 when anything needs a human, so the watchdog emails.
//
//   node --experimental-strip-types scripts/ops/check-ops-alerts.mjs
//
// Environment:
//   ICP_ENV            canister_ids.json environment (ic | testnet; default ic)
//   IDENTITY_PEM       an admin of the monitoring canister (the deploy identity)
//   CANISTER_ID_MONITORING  overrides canister_ids.json
//   IC_HOST            default https://icp-api.io (a localhost host fetches the root key)
//   WINDOW_MINUTES     look-back, default 65
//   NOTIFICATIONS_URL, IOT_GATEWAY_URL  relay origins; skipped when unset
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "../../packages/shared/src/declarations/monitoring.ts";
import { identityFromPem } from "./identity.mjs";
import { evaluate } from "./opsAlerts.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function monitoringId(env) {
  if (process.env.CANISTER_ID_MONITORING) return process.env.CANISTER_ID_MONITORING;
  try {
    return JSON.parse(readFileSync(`${ROOT}canister_ids.json`, "utf8")).monitoring?.[env] ?? "";
  } catch {
    return "";
  }
}

async function checkHealth(name, origin) {
  if (!origin) return { line: `${name}: no URL set, skipped`, ok: true };
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(20_000) });
    return { line: `${name} /health → ${res.status}`, ok: res.status === 200 };
  } catch (err) {
    return { line: `${name} /health → unreachable (${err?.cause?.code ?? err?.name ?? "error"})`, ok: false };
  }
}

async function main() {
  const env = process.env.ICP_ENV || "ic";
  const problems = [];
  const lines = [];

  for (const [name, url] of [
    ["Notification relay", process.env.NOTIFICATIONS_URL],
    ["IoT gateway", process.env.IOT_GATEWAY_URL],
  ]) {
    const h = await checkHealth(name, url);
    lines.push(h.line);
    if (!h.ok) problems.push({ kind: "health", text: h.line });
  }

  const canisterId = monitoringId(env);
  if (!canisterId) {
    lines.push(`No monitoring canister ID for ${env}, skipped the canister checks`);
  } else if (!process.env.IDENTITY_PEM) {
    problems.push({ kind: "config", text: "IDENTITY_PEM is not set, so monitoring could not be read" });
  } else {
    const host = process.env.IC_HOST || "https://icp-api.io";
    const local = /localhost|127\.0\.0\.1/.test(host);
    const agent = await HttpAgent.create({
      host,
      identity: identityFromPem(process.env.IDENTITY_PEM),
      shouldFetchRootKey: local,
    });
    const monitoring = Actor.createActor(idlFactory, { agent, canisterId });
    try {
      const [alerts, serviceErrors, frontendErrors] = await Promise.all([
        monitoring.getActiveAlerts(),
        monitoring.getServiceErrors(0n, 200n),
        monitoring.getFrontendErrors(0n, 200n),
      ]);
      // The reads are admin-only and answer [] to anyone else, which would look
      // like "all clear". Resolving an empty fingerprint is answered NotFound
      // for an admin and NotAuthorized for anyone else, and changes nothing.
      const probe = await monitoring.resolveServiceError("");
      if ("err" in probe && "NotAuthorized" in probe.err) {
        throw new Error("the identity is not a monitoring admin, so its alerts can't be read");
      }
      lines.push(
        `Monitoring ${canisterId}: ${alerts.length} active alert(s), ${serviceErrors.length} service error(s), ${frontendErrors.length} frontend error(s) on record`,
      );
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      problems.push(
        ...evaluate({
          alerts,
          serviceErrors,
          frontendErrors,
          nowNs,
          windowMinutes: Number(process.env.WINDOW_MINUTES || 65),
        }),
      );
    } catch (err) {
      problems.push({ kind: "config", text: `could not read monitoring: ${err?.message?.split("\n")[0] ?? err}` });
    }
  }

  for (const l of lines) console.log(`  ${l}`);
  if (problems.length === 0) {
    console.log("✅  No new ops alerts");
    return 0;
  }
  console.log(`❌  ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p.text}`);
  return 1;
}

process.exitCode = await main();
