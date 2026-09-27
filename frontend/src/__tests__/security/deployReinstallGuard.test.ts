/**
 * Upgrade safety — a reinstall deletes a canister's data, so deploy.sh may only
 * reinstall on testnet, and only after an in-place upgrade has just failed as
 * memory-incompatible (so it can't repeat once the canister is back in step).
 * The stable-compat CI workflow keeps new incompatible changes from merging.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");

/** Shell lines (comments stripped) — so prose about reinstalling doesn't count. */
function codeLines(src: string): string[] {
  return src.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "")).filter((l) => l.trim());
}

describe("deploy.sh — reinstall guard", () => {
  const deploy = read("scripts/deploy.sh");
  const code = codeLines(deploy).join("\n");

  it("only ever reinstalls through the single guarded branch", () => {
    expect(code.match(/--mode reinstall/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/--mode\s+"\$INSTALL_MODE"/);
  });

  it("tries an in-place upgrade before any reinstall", () => {
    expect(code.indexOf("--mode auto")).toBeGreaterThan(-1);
    expect(code.indexOf("--mode auto")).toBeLessThan(code.indexOf("--mode reinstall"));
  });

  it("guards the reinstall on testnet, an allow-list, and a memory-incompatible failure", () => {
    const guard = code.slice(code.lastIndexOf("elif", code.indexOf("--mode reinstall")), code.indexOf("--mode reinstall"));
    expect(guard).toContain('"$ENV" = "testnet"');
    expect(guard).toContain("TESTNET_REINSTALL_OK");
    expect(guard).toContain("Memory-incompatible program upgrade");
  });
});

describe("stable-compat CI gate", () => {
  it("runs on pull requests to main, including label changes", () => {
    const wf = read(".github/workflows/stable-compat.yml");
    expect(wf).toMatch(/pull_request:[\s\S]*branches: \[main\]/);
    expect(wf).toMatch(/types: \[.*labeled.*unlabeled.*\]/);
    expect(wf).toContain("scripts/ci/check-stable-compat.sh");
  });

  it("checks every canister with moc --stable-compatible", () => {
    const script = read("scripts/ci/check-stable-compat.sh");
    expect(script).toContain("--stable-types");
    expect(script).toContain("--stable-compatible");
    expect(script).toContain("icp.yaml");
  });
});
