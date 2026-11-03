// smoke-deployed.sh and release-manifest.sh (test-gap audit 2026-11-03, L1),
// run in a scratch copy of the repo with its own canister_ids.json and
// stand-in icp, curl and sleep commands, so every pass and fail branch can be
// driven without a network. Run: npm test --prefix scripts/ops
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const ALL = [
  "auth",
  "property",
  "job",
  "contractor",
  "quote",
  "payment",
  "photo",
  "report",
  "maintenance",
  "market",
  "sensor",
  "monitoring",
  "listing",
  "agent",
  "fee",
  "recurring",
  "bills",
  "ai_proxy",
  "audit",
  "referrals",
  "frontend",
];

function repo({ missing = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hg-deploycheck-"));
  for (const f of ["scripts/smoke-deployed.sh", "scripts/ops/release-manifest.sh", "scripts/lib/cycles.sh"]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
  }
  const ids = Object.fromEntries(
    ALL.filter((c) => !missing.includes(c)).map((c) => [c, { testnet: `${c}-id`, ic: `${c}-ic` }]),
  );
  writeFileSync(join(dir, "canister_ids.json"), JSON.stringify(ids));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      canisters: [
        { name: "property", id: "property-id" },
        { name: "job", id: "job-id" },
      ],
    }),
  );

  const bin = join(dir, "bin");
  mkdirSync(bin);
  const sh = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // icp canister status <name|id> ... / icp canister call <name> <method> ...
  sh(
    "icp",
    `echo "$*" >> "${dir}/icp.log"
case "$2" in
  status)
    [ "$3" = "\${FAKE_UNREACHABLE:-}" ] && { echo "connection refused" >&2; exit 1; }
    if [ "$3" = "\${FAKE_STOPPED:-}" ]; then echo "Status: Stopped"; else echo "Status: Running"; fi
    echo "Module hash: 0x\${3}hash" ;;
  call)
    case "$4" in
      getAllPricing) printf '%s\\n' "\${FAKE_PRICING-(vec { record { tier = variant { Free } } })}" ;;
      getApiDoc) [ "$3" = "\${FAKE_NO_DOC:-}" ] && { echo "method not found" >&2; exit 1; }; echo '("# HomeGentic '$3' canister")' ;;
    esac ;;
esac`,
  );
  sh(
    "curl",
    `url="\${@: -1}"; echo "$url" >> "${dir}/curl.log"
case "$url" in
  */health) printf '%s' "\${FAKE_HEALTH:-200}" ;;
  */.well-known/ic-architecture) if [ -n "\${FAKE_MANIFEST+x}" ]; then printf '%s' "$FAKE_MANIFEST"; else cat "${dir}/manifest.json"; fi ;;
  */.well-known/ii-derivation-origin) printf '%s\\n' "\${FAKE_ORIGIN:-https://frontend-id.icp0.io}" ;;
  *) printf '%s' "\${FAKE_INDEX-<div id=\\"root\\"></div>}" ;;
esac`,
  );
  sh("sleep", "exit 0");
  return { dir, bin };
}

function run(r, script, env = {}) {
  const res = spawnSync("bash", [join(r.dir, script)], {
    cwd: r.dir,
    encoding: "utf8",
    env: { PATH: `${r.bin}:${process.env.PATH}`, ICP_ENV: "testnet", ...env },
  });
  return { code: res.status, out: res.stdout + res.stderr };
}
const log = (r, f) => {
  try {
    return readFileSync(join(r.dir, f), "utf8");
  } catch {
    return "";
  }
};

// ── smoke-deployed.sh ──────────────────────────────────────────────────────

test("smoke: a healthy deploy passes every check", () => {
  const r = repo();
  const { code, out } = run(r, "scripts/smoke-deployed.sh", { VOICE_AGENT_URL: "https://voice.example/" });
  assert.equal(code, 0, out);
  assert.match(out, /✅ Smoke test passed/);
  assert.match(out, /✓ property listed, getApiDoc answers/);
  assert.match(out, /✓ https:\/\/voice\.example\/health/);
});

test("smoke: a stopped canister, a canister with no ID and an unreachable one each fail", () => {
  const r = repo({ missing: ["fee"] });
  const { code, out } = run(r, "scripts/smoke-deployed.sh", { FAKE_STOPPED: "photo", FAKE_UNREACHABLE: "bills" });
  assert.equal(code, 1);
  assert.match(out, /✗ photo is Stopped/);
  assert.match(out, /✗ bills is unreachable/);
  assert.match(out, /✗ fee has no ID for testnet/);
  assert.match(out, /Smoke test failed: 3 check\(s\)/);
});

test("smoke: an empty pricing table fails (the code didn't really deploy)", () => {
  const { code, out } = run(repo(), "scripts/smoke-deployed.sh", { FAKE_PRICING: "(vec {})" });
  assert.equal(code, 1);
  assert.match(out, /✗ payment\.getAllPricing/);
});

test("smoke: a frontend serving something other than the app fails", () => {
  const { code, out } = run(repo(), "scripts/smoke-deployed.sh", { FAKE_INDEX: "<h1>502</h1>" });
  assert.equal(code, 1);
  assert.match(out, /did not serve the app/);
});

test("smoke: the ICP MCP manifest must be JSON naming this environment's IDs, and each listed canister must answer getApiDoc", () => {
  let res = run(repo(), "scripts/smoke-deployed.sh", { FAKE_MANIFEST: "<!doctype html>" });
  assert.match(res.out, /ic-architecture is missing or not JSON/);
  res = run(repo(), "scripts/smoke-deployed.sh", { FAKE_MANIFEST: '{"canisters":[{"name":"job","id":"job-ic"}]}' });
  assert.match(res.out, /lists job as job-ic, canister_ids\.json has job-id/);
  res = run(repo(), "scripts/smoke-deployed.sh", { FAKE_NO_DOC: "property" });
  assert.equal(res.code, 1);
  assert.match(res.out, /✗ property\.getApiDoc/);
});

test("smoke: a wrong II derivation origin fails; ICP_MCP_DISABLED skips the MCP checks", () => {
  let res = run(repo(), "scripts/smoke-deployed.sh", { FAKE_ORIGIN: "https://elsewhere.example" });
  assert.equal(res.code, 1);
  assert.match(res.out, /ii-derivation-origin is 'https:\/\/elsewhere\.example'/);
  const r = repo();
  res = run(r, "scripts/smoke-deployed.sh", { ICP_MCP_DISABLED: "1", FAKE_ORIGIN: "wrong" });
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /skipped: ICP_MCP_DISABLED=1/);
  assert.doesNotMatch(log(r, "curl.log"), /well-known/);
});

test("smoke: the Worker check retries /health five times before failing", () => {
  const r = repo();
  const { code, out } = run(r, "scripts/smoke-deployed.sh", {
    ONLY: "worker",
    VOICE_AGENT_URL: "https://voice.example",
    FAKE_HEALTH: "503",
  });
  assert.equal(code, 1);
  assert.match(out, /voice Worker \/health returned 503/);
  assert.equal(log(r, "curl.log").trim().split("\n").length, 5);
  assert.equal(log(r, "icp.log"), "", "ONLY=worker checks no canisters");
});

test("smoke: ONLY=worker without VOICE_AGENT_URL fails instead of passing vacuously", () => {
  const { code, out } = run(repo(), "scripts/smoke-deployed.sh", { ONLY: "worker" });
  assert.equal(code, 1);
  assert.match(out, /VOICE_AGENT_URL is not set/);
});

// ── release-manifest.sh ────────────────────────────────────────────────────

test("release-manifest: one TSV row per canister with its module hash", () => {
  const r = repo();
  const { code, out } = run(r, "scripts/ops/release-manifest.sh", { ICP_ENV: "ic" });
  assert.equal(code, 0, out);
  const rows = out
    .trim()
    .split("\n")
    .map((l) => l.split("\t"));
  assert.deepEqual(rows[0], ["canister", "canister_id", "module_hash"]);
  assert.equal(rows.length, ALL.length + 1);
  assert.deepEqual(
    rows.find((x) => x[0] === "job"),
    ["job", "job-ic", "0xjob-ichash"],
  );
  assert.match(log(r, "icp.log"), /canister status job-ic -n ic/);
});

test("release-manifest: an unreachable canister is 'unknown' and a canister with no ID is left out", () => {
  const { out } = run(repo({ missing: ["referrals"] }), "scripts/ops/release-manifest.sh", {
    ICP_ENV: "ic",
    FAKE_UNREACHABLE: "audit-ic",
  });
  const rows = out
    .trim()
    .split("\n")
    .map((l) => l.split("\t"));
  assert.deepEqual(
    rows.find((x) => x[0] === "audit"),
    ["audit", "audit-ic", "unknown"],
  );
  assert.equal(
    rows.find((x) => x[0] === "referrals"),
    undefined,
  );
});
