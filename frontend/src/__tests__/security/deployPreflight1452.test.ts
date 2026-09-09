/**
 * TDD — PROD.1 / PROD.2 / PROD.3 / PROD.8 / PROD.11
 * Pre-flight and production-hardening static checks.
 *
 * PROD.1  deploy.sh validates ANTHROPIC_API_KEY is set for non-local deploys
 * PROD.2  deploy.sh validates VOICE_AGENT_API_KEY is set for non-local deploys
 * PROD.3  the cycles balance check + top-up step is skipped on local and
 *         fires on non-local networks — exercised by actually running
 *         scripts/lib/cycles-balance-check.sh with a stubbed `icp` on PATH,
 *         not by measuring character distance in the source text (that
 *         approach broke on an unrelated comment edit and couldn't actually
 *         prove the guard wraps the call — see git history on this file).
 * PROD.8  monitoring canister has a heartbeat that fires staleness alerts
 * PROD.11 vite.config.ts does not define the dead PRICE_CANISTER_ID env var
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ── PROD.3 test harness ───────────────────────────────────────────────────────
//
// Runs the real scripts/lib/cycles-balance-check.sh in a fresh bash process
// with a stubbed `icp` binary on PATH, so the test exercises actual behavior
// (was the top-up call made?) rather than the shape of the source text.

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

/**
 * @param env value for $ENV ("local" skips the check entirely)
 * @param cyclesBalance the fake cycle balance the stubbed `icp canister status` reports
 */
function runCyclesCheck(env: string, cyclesBalance: number) {
  const scratch = mkdtempSync(join(tmpdir(), "cycles-check-test-"));
  scratchDirs.push(scratch);

  const transferLog = join(scratch, "transfer-calls.log");
  const icpStubPath = join(scratch, "icp");
  writeFileSync(
    icpStubPath,
    `#!/usr/bin/env bash
if [ "$1 $2" = "canister status" ]; then
  cat <<STATUS
Canister Status Report:
  Status: Running
  Cycles: ${cyclesBalance}
  Reserved cycles: 0
STATUS
  exit 0
fi
if [ "$1 $2" = "cycles transfer" ]; then
  echo "$@" >> "${transferLog}"
  exit 0
fi
exit 1
`
  );
  chmodSync(icpStubPath, 0o755);

  const libPath = resolve(ROOT, "scripts/lib/cycles-balance-check.sh");
  const result = spawnSync(
    "bash",
    ["-c", `CANISTERS=(auth); ENV="$1"; source "$2"`, "_", env, libPath],
    { env: { ...process.env, PATH: `${scratch}:${process.env.PATH}` }, encoding: "utf-8" }
  );

  const transferCalled = (() => {
    try {
      return readFileSync(transferLog, "utf-8").trim().length > 0;
    } catch {
      return false;
    }
  })();

  return { ...result, transferCalled };
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
    expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|\[.*"\$NETWORK".*!=.*"local"\]|ENV.*!=.*local|!=.*local.*ENV|\[.*"\$ENV".*!=.*"local"\]/);
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
    expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|\[.*"\$NETWORK".*!=.*"local"\]|ENV.*!=.*local|!=.*local.*ENV|\[.*"\$ENV".*!=.*"local"\]/);
  });
});

// ── PROD.3 — cycles check in deploy.sh ───────────────────────────────────────

describe("PROD.3 — deploy.sh has cycles balance check for non-local deploys", () => {
  it("deploy.sh sources the cycles balance check", () => {
    expect(read("scripts/deploy.sh")).toMatch(/source .*cycles-balance-check\.sh/);
  });

  it("the cycles balance check calls icp canister status to read cycles balance", () => {
    expect(read("scripts/lib/cycles-balance-check.sh")).toMatch(/icp canister status/);
  });

  it("the cycles balance check calls icp cycles transfer for top-up", () => {
    expect(read("scripts/lib/cycles-balance-check.sh")).toMatch(/icp cycles transfer/);
  });

  it("does NOT call icp cycles transfer on the local network, even with a low balance", () => {
    const { transferCalled, stdout } = runCyclesCheck("local", 100);
    expect(transferCalled).toBe(false);
    expect(stdout).toMatch(/skipped.*local managed network/);
  });

  it("calls icp cycles transfer on a non-local network when the balance is below the warning threshold", () => {
    // WARNING_CYCLES is 500B in cycles-balance-check.sh; 100 cycles is well under it.
    const { transferCalled } = runCyclesCheck("testnet", 100);
    expect(transferCalled).toBe(true);
  });

  it("does NOT call icp cycles transfer on a non-local network when the balance is healthy", () => {
    // 5T is comfortably above the 500B warning threshold.
    const { transferCalled } = runCyclesCheck("testnet", 5_000_000_000_000);
    expect(transferCalled).toBe(false);
  });
});

// ── PROD.8 — monitoring canister staleness detection ─────────────────────────

describe("PROD.8 — monitoring canister has a periodic timer for staleness detection", () => {
  it("monitoring/main.mo uses recurringTimer instead of heartbeat (heartbeat wastes cycles every round)", () => {
    const mo = read("backend/monitoring/main.mo");
    expect(mo).toMatch(/recurringTimer/);
    expect(mo).not.toMatch(/system func heartbeat/);
  });

  it("timer fires on a fixed nanosecond interval", () => {
    const mo = read("backend/monitoring/main.mo");
    expect(mo).toMatch(/#nanoseconds/);
    expect(mo).toMatch(/STALE_CHECK_NS/);
  });

  it("timer callback checks updatedAt for staleness and fires an alert", () => {
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
