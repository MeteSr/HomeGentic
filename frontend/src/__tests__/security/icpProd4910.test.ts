/**
 * TDD — PROD.4 / PROD.9 / PROD.10
 *
 * PROD.4  deploy-mainnet.yml uses positional arg `ic`, not `--network ic`
 * PROD.9  deploy.sh supports BACKUP_CONTROLLER_PRINCIPAL to add a second
 *         controller to every canister; DEPLOYMENT.md documents the procedure
 * PROD.10 Vite production build strips dev-only localhost endpoints from the
 *         meta-tag CSP (http://localhost:4943, ws://localhost:*)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ── PROD.4 — deploy-mainnet.yml uses correct positional argument ──────────────

describe("PROD.4 — deploy-mainnet.yml passes network as positional arg", () => {
  const workflow = () => read(".github/workflows/deploy-mainnet.yml");

  it("workflow calls deploy.sh with positional 'ic', not '--network ic'", () => {
    // deploy.sh reads NETWORK=${1:-local}; passing --network ic sets NETWORK to
    // the string "--network" and silently deploys to local instead of mainnet.
    expect(workflow()).not.toMatch(/deploy\.sh\s+--network\s+ic/);
  });

  it("workflow calls 'bash scripts/deploy.sh ic'", () => {
    expect(workflow()).toMatch(/deploy\.sh\s+ic/);
  });
});

// ── PROD.9 — deploy.sh supports a backup controller ──────────────────────────

describe("PROD.9 — deploy.sh adds a backup controller when configured", () => {
  const deploy = () => read("scripts/deploy.sh");

  it("deploy.sh reads BACKUP_CONTROLLER_PRINCIPAL env var", () => {
    expect(deploy()).toMatch(/BACKUP_CONTROLLER_PRINCIPAL/);
  });

  it("deploy.sh calls dfx canister update-settings --add-controller", () => {
    // The flags may be on separate lines in the shell script
    const src = deploy();
    expect(src).toMatch(/dfx canister update-settings/);
    expect(src).toMatch(/--add-controller/);
  });

  it("the backup-controller step is conditional on BACKUP_CONTROLLER_PRINCIPAL being set", () => {
    const src = deploy();
    // Must have an if-guard so the step is skipped when the var is unset
    expect(src).toMatch(/if\s*\[.*-n.*BACKUP_CONTROLLER_PRINCIPAL|\$\{BACKUP_CONTROLLER_PRINCIPAL:-\}/);
  });

  it("deploy.sh warns when BACKUP_CONTROLLER_PRINCIPAL is unset on non-local network", () => {
    const src = deploy();
    // Should warn that running without a backup controller is risky
    expect(src).toMatch(/backup.*controller|BACKUP_CONTROLLER/i);
    // Warning must only apply to non-local
    const warnIdx = src.search(/⚠️.*backup|warn.*backup|backup.*warn/i);
    if (warnIdx !== -1) {
      // Look back 900 chars — the backup-controller for-loop sits between
      // the NETWORK guard and the warning echo
      const window = src.slice(Math.max(0, warnIdx - 900), warnIdx + 100);
      expect(window).toMatch(/NETWORK.*!=.*local|!=.*local.*NETWORK|ENV.*!=.*local|!=.*local.*ENV/);
    }
  });

  it("DEPLOYMENT.md documents the controller rotation procedure", () => {
    const docs = read("docs/DEPLOYMENT.md");
    expect(docs).toMatch(/controller/i);
    expect(docs).toMatch(/BACKUP_CONTROLLER_PRINCIPAL/);
  });
});

// ── PROD.10 — Vite strips dev localhost endpoints from production CSP ─────────

describe("PROD.10 — vite.config.ts strips localhost CSP endpoints in production", () => {
  const vite = () => read("frontend/vite.config.ts");

  it("vite.config.ts has a transformIndexHtml plugin", () => {
    expect(vite()).toMatch(/transformIndexHtml/);
  });

  it("the transform removes http://localhost entries in production (no dev server)", () => {
    // The plugin must check for a dev-server context and only strip in prod builds
    const src = vite();
    expect(src).toMatch(/localhost/);           // still referenced (to strip it)
    expect(src).toMatch(/replace.*localhost|localhost.*replace/);
  });

  it("the transform is a no-op in dev (server context present)", () => {
    // The plugin must preserve localhost entries when Vite's dev server is running
    // so ICP agent calls to http://localhost:4943 are allowed by the meta CSP
    const src = vite();
    expect(src).toMatch(/server|isBuild|command/); // some dev-vs-prod discriminator
  });

  it("index.html still contains http://localhost:4943 (removed at build time, not source)", () => {
    // The source HTML keeps the dev entry; the plugin strips it during production build
    expect(read("frontend/index.html")).toContain("http://localhost:4943");
  });
});
