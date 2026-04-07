/**
 * TDD — PROD.1 / PROD.2 / PROD.3 / PROD.8 / PROD.11
 * Pre-flight and production-hardening static checks.
 *
 * PROD.1  deploy.sh validates ANTHROPIC_API_KEY is set for non-local deploys
 * PROD.2  deploy.sh validates VOICE_AGENT_API_KEY is set for non-local deploys
 * PROD.3  deploy.sh has a cycles balance check + top-up step for non-local deploys
 * PROD.8  monitoring canister has a heartbeat that fires staleness alerts
 * PROD.11 vite.config.ts does not define the dead PRICE_CANISTER_ID env var
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ── PROD.1 — ANTHROPIC_API_KEY pre-flight in deploy.sh ───────────────────────

describe("PROD.1 — deploy.sh validates ANTHROPIC_API_KEY for non-local deploys", () => {
  it("deploy.sh exits when ANTHROPIC_API_KEY is unset on non-local network", () => {
    const deploy = read("scripts/deploy.sh");
    // Must reference ANTHROPIC_API_KEY in a guard block for non-local networks
    expect(deploy).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("the ANTHROPIC_API_KEY check is conditional on network != local", () => {
    const deploy = read("scripts/deploy.sh");
    // The guard must only fire for non-local (ic/testnet) deploys
    const anthIdx = deploy.indexOf("ANTHROPIC_API_KEY");
    expect(anthIdx).toBeGreaterThan(-1);
    // Within the surrounding 600 chars there must be a non-local condition
    const window = deploy.slice(Math.max(0, anthIdx - 600), anthIdx + 200);
    expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|\[.*"\$NETWORK".*!=.*"local"\]/);
  });
});

// ── PROD.2 — VOICE_AGENT_API_KEY pre-flight in deploy.sh ─────────────────────

describe("PROD.2 — deploy.sh validates VOICE_AGENT_API_KEY for non-local deploys", () => {
  it("deploy.sh references VOICE_AGENT_API_KEY", () => {
    expect(read("scripts/deploy.sh")).toMatch(/VOICE_AGENT_API_KEY/);
  });

  it("VOICE_AGENT_API_KEY check is conditional on network != local", () => {
    const deploy = read("scripts/deploy.sh");
    const idx = deploy.indexOf("VOICE_AGENT_API_KEY");
    expect(idx).toBeGreaterThan(-1);
    const window = deploy.slice(Math.max(0, idx - 600), idx + 200);
    expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|\[.*"\$NETWORK".*!=.*"local"\]/);
  });
});

// ── PROD.3 — cycles check in deploy.sh ───────────────────────────────────────

describe("PROD.3 — deploy.sh has cycles balance check for non-local deploys", () => {
  it("deploy.sh calls dfx canister status to read cycles balance", () => {
    expect(read("scripts/deploy.sh")).toMatch(/dfx canister status/);
  });

  it("deploy.sh references deposit-cycles for top-up", () => {
    expect(read("scripts/deploy.sh")).toMatch(/deposit-cycles/);
  });

  it("cycles check is skipped for local network", () => {
    const deploy = read("scripts/deploy.sh");
    // The cycles section must be guarded — local uses fabricate-cycles, not deposit-cycles
    const depositIdx = deploy.indexOf("deposit-cycles");
    expect(depositIdx).toBeGreaterThan(-1);
    const window = deploy.slice(Math.max(0, depositIdx - 800), depositIdx + 100);
    expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|\[.*"\$NETWORK".*!=.*"local"\]/);
  });
});

// ── PROD.8 — monitoring canister heartbeat ────────────────────────────────────

describe("PROD.8 — monitoring canister has a heartbeat for staleness detection", () => {
  it("monitoring/main.mo defines system func heartbeat", () => {
    expect(read("backend/monitoring/main.mo")).toMatch(/system func heartbeat/);
  });

  it("heartbeat is throttled with a counter (not running full logic every round)", () => {
    const mo = read("backend/monitoring/main.mo");
    // Must have a tick/count variable and a modulo check
    expect(mo).toMatch(/heartbeatTick|heartbeat_tick|tickCount|tick_count/);
    expect(mo).toMatch(/%\s*\w*[Ii]nterval\w*|%\s*\d+/);
  });

  it("heartbeat checks updatedAt for staleness and fires an alert", () => {
    const mo = read("backend/monitoring/main.mo");
    expect(mo).toMatch(/updatedAt|updated_at/);
    expect(mo).toMatch(/stale|Stale|STALE/);
  });
});

// ── PROD.11 — dead PRICE_CANISTER_ID define removed ──────────────────────────

describe("PROD.11 — vite.config.ts does not define PRICE_CANISTER_ID", () => {
  it("process.env.PRICE_CANISTER_ID is absent from vite.config.ts", () => {
    expect(read("frontend/vite.config.ts")).not.toMatch(/PRICE_CANISTER_ID/);
  });
});
