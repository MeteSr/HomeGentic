// Deploy order: canisters → voice Worker → frontend. A frontend that ships
// before the Worker it calls can send requests the old Worker refuses (PR #742:
// lien-waiver PDF uploads; #737–#739 add Worker routes the new pages use).
// Run: npm test --prefix scripts/ops
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../../..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

// The body of one top-level job in a workflow file (two-space indented key).
function jobBlock(yml, name) {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

for (const [wf, env] of [
  [".github/workflows/deploy-testnet.yml", "testnet"],
  [".github/workflows/deploy-mainnet.yml", "ic"],
]) {
  test(`${wf}: deploy.sh deploys the voice Worker itself, before the frontend`, () => {
    const yml = read(wf);
    const deploy = jobBlock(yml, "deploy");
    assert.ok(deploy, "deploy job exists");
    assert.match(deploy, new RegExp(`bash scripts/deploy.sh ${env}`));
    assert.match(deploy, /DEPLOY_VOICE_WORKER: '1'/);
    assert.match(deploy, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    assert.match(deploy, /VOICE_AGENT_URL: \$\{\{ secrets\.VITE_VOICE_AGENT_URL \}\}/);
    // No separate job that deploys the voice Worker after the frontend.
    assert.equal(jobBlock(yml, "deploy-voice-worker"), null);
    for (const [, name] of yml.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)) {
      if (/working-directory: agents\/voice/.test(jobBlock(yml, name)))
        assert.fail(`job ${name} still deploys the voice Worker on its own`);
    }
  });
}

test("deploy.sh runs the Worker deploy (when asked) after canister wiring and before the frontend", () => {
  const sh = read("scripts/deploy.sh");
  const worker = sh.indexOf('deploy-voice-worker.sh" "$ENV"');
  const wiring = sh.indexOf("Wiring Trusted Canister Lists");
  const frontend = sh.indexOf("Frontend Canister Pre-flight");
  assert.ok(worker > 0, "deploy.sh calls deploy-voice-worker.sh");
  assert.ok(wiring > 0 && worker > wiring, "Worker after the canisters are wired");
  assert.ok(frontend > 0 && worker < frontend, "Worker before the frontend");
  assert.match(sh, /DEPLOY_VOICE_WORKER:-/);
});

// ── deploy-voice-worker.sh, against a stand-in npx and curl ────────────────
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "hg-worker-"));
  for (const f of ["scripts/deploy-voice-worker.sh", "scripts/smoke-deployed.sh", "scripts/lib/cycles.sh"]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
  }
  mkdirSync(join(dir, "agents/voice/node_modules"), { recursive: true });
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const sh = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  sh("npx", `echo "$PWD $*" >> "${dir}/npx.log"; exit \${FAKE_WRANGLER_EXIT:-0}`);
  sh("npm", `echo "npm $*" >> "${dir}/npx.log"`);
  sh("curl", `printf '%s' "\${FAKE_HEALTH:-200}"`);
  sh("sleep", "exit 0");
  return { dir, bin };
}

function run(r, args, env = {}) {
  const res = spawnSync("bash", [join(r.dir, "scripts/deploy-voice-worker.sh"), ...args], {
    cwd: r.dir,
    encoding: "utf8",
    env: { PATH: `${r.bin}:${process.env.PATH}`, VOICE_AGENT_URL: "https://voice.example", ...env },
  });
  const log = existsSync(join(r.dir, "npx.log")) ? readFileSync(join(r.dir, "npx.log"), "utf8") : "";
  return { code: res.status, out: res.stdout + res.stderr, log };
}

test("deploy-voice-worker.sh testnet deploys the testnet Worker from agents/voice, then checks /health", () => {
  const r = repo();
  const { code, out, log } = run(r, ["testnet"]);
  assert.equal(code, 0, out);
  assert.equal(log.trim(), `${join(r.dir, "agents/voice")} wrangler deploy --env testnet`);
  assert.match(out, /voice\.example\/health/);
});

test("deploy-voice-worker.sh ic deploys the production Worker (no --env)", () => {
  const r = repo();
  const { code, out, log } = run(r, ["ic"]);
  assert.equal(code, 0, out);
  assert.equal(log.trim(), `${join(r.dir, "agents/voice")} wrangler deploy`);
});

test("deploy-voice-worker.sh fails when wrangler fails or /health is not 200", () => {
  assert.notEqual(run(repo(), ["testnet"], { FAKE_WRANGLER_EXIT: "1" }).code, 0);
  assert.notEqual(run(repo(), ["testnet"], { FAKE_HEALTH: "503" }).code, 0);
});

test("deploy-voice-worker.sh refuses an unknown environment or a missing URL", () => {
  assert.notEqual(run(repo(), ["local"]).code, 0);
  assert.notEqual(run(repo(), []).code, 0);
  const r = repo();
  const res = run(r, ["testnet"], { VOICE_AGENT_URL: "" });
  assert.notEqual(res.code, 0);
  assert.equal(res.log, "", "nothing deployed without a URL to check");
});

test("deploy-voice-worker.sh installs the Worker's dependencies when they're missing", () => {
  const r = repo();
  spawnSync("rm", ["-rf", join(r.dir, "agents/voice/node_modules")]);
  const { code, out, log } = run(r, ["testnet"]);
  assert.equal(code, 0, out);
  assert.match(log, /^npm ci/m);
});

// ── Canister install order ──────────────────────────────────────────────────
// deploy.sh upgrades the canisters one at a time (stop, snapshot, install,
// start). Until a callee is upgraded, a caller already on the new build that
// calls one of the callee's new methods gets a reject. Each pair below is a
// callee the caller needs upgraded first, found by type-checking main's
// callers against the Candid of the build testnet still ran (PR #581,
// 2026-10-07): scripts/ci/check-canister-calls.mjs with one callee's .did
// swapped for the deployed one at a time. Cycles (job <-> photo,
// property <-> photo, property <-> listing) can't be ordered away; the window
// is the few seconds between the two installs.
const BEFORE = [
  ["payment", "property", "property.claimTransfer calls payment.grantHandoffYear"],
  ["property", "job", "every caller reads property.getAccessRoles (Canisters.property)"],
  ["property", "bills", "Canisters.property.getAccessRoles"],
  ["property", "recurring", "Canisters.property.getAccessRoles"],
  ["property", "maintenance", "Canisters.property.getAccessRoles"],
  ["property", "sensor", "Canisters.property.getAccessRoles"],
  ["property", "market", "Canisters.property.getAccessRoles"],
  ["property", "report", "Canisters.property.getAccessRoles"],
  ["property", "listing", "Canisters.property.getAccessRoles"],
  ["fee", "job", "job calls fee.recordReferralAccepted (Contractor Free referral fee)"],
  ["fee", "quote", "quote calls fee.recordReferralAccepted"],
  ["job", "contractor", "contractor calls job.hasJobWithContractor"],
  ["quote", "contractor", "contractor calls quote.hasBidFrom"],
  ["job", "photo", "photo calls job.waiverUploadTarget (#716 lien waivers)"],
  ["job", "report", "report calls job.getCloseoutsForProperty"],
  ["market", "report", "report and market certify scores together"],
  ["sensor", "report", "report calls sensor.getDevicesForReader (risk profile)"],
  ["photo", "listing", "listing checks listing photos with photo"],
  ["listing", "agent", "agent calls listing.getReviewEligibility"],
];

test("deploy.sh installs each callee before the canisters that call its new methods", () => {
  const sh = read("scripts/deploy.sh");
  const m = sh.match(/^CANISTERS=\(([^)]*)\)/m);
  assert.ok(m, "deploy.sh has a CANISTERS=(...) install order");
  const order = m[1].trim().split(/\s+/);
  for (const [callee, caller, why] of BEFORE) {
    assert.ok(order.includes(callee) && order.includes(caller), `${callee} and ${caller} are deployed`);
    assert.ok(order.indexOf(callee) < order.indexOf(caller), `${callee} before ${caller}: ${why}`);
  }
});

test("deploy.sh passes an argument to every canister call, so icp never prompts for one", () => {
  // `icp canister call X m` with no argument opens an interactive prompt,
  // which a CI run answers with nothing: the call fails (report's
  // refreshAttestationKey did, in a local rehearsal of the testnet deploy).
  const sh = read("scripts/deploy.sh");
  const bare = [...sh.matchAll(/icp canister call\s+(\S+)\s+(\w+)\s+(-e\b|--|2>|>|\||\)|$)/gm)].map((x) => `${x[1]}.${x[2]}`);
  assert.deepEqual(bare, []);
});

test("deploy-relays.yml deploys testnet relays only after Deploy Testnet has upgraded the canisters", () => {
  // The relay calls canister methods added since the last deploy (Home Pulse,
  // contractor prefs, quote records); deploying it on every push to main ran
  // it against canisters still waiting for the testnet deploy's approval.
  const yml = read(".github/workflows/deploy-relays.yml");
  const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.doesNotMatch(on, /^ {2}push:/m, "no deploy on a bare push to main");
  assert.match(on, /workflow_run:\s*\n\s+workflows: \[Deploy Testnet\]/);
  const deploy = jobBlock(yml, "deploy");
  assert.match(deploy, /github\.event\.workflow_run\.conclusion == 'success'/);
});

for (const wf of [".github/workflows/deploy-testnet.yml", ".github/workflows/deploy-mainnet.yml"]) {
  test(`${wf}: an interface break can be accepted without waiving the stable-memory check`, () => {
    const yml = read(wf);
    assert.match(yml, /^ {6}allow_candid_break:/m, "has an allow_candid_break input");
    const gate = jobBlock(yml, "upgrade-gate");
    assert.match(gate, /ALLOW_CANDID_BREAK: \$\{\{ \(inputs\.allow_candid_break \|\| inputs\.allow_upgrade_break\) && '1' \|\| '' \}\}/);
    assert.match(gate, /ALLOW_STABLE_BREAK: \$\{\{ inputs\.allow_upgrade_break && '1' \|\| '' \}\}/);
  });
}

test("deploy.sh reads a multi-line ok from report.refreshAttestationKey as success", () => {
  // icp prints a result that carries a value over several lines
  // ("variant {\n    ok = blob ..."), which a one-line "variant { ok" match
  // reported as a failure in the local rehearsal.
  const sh = read("scripts/deploy.sh");
  const block = sh.match(/^if out=\$\(icp canister call report refreshAttestationKey[\s\S]*?^fi$/m);
  assert.ok(block, "deploy.sh refreshes report's signing key");
  const script = `icp() { printf '(\\n  variant {\\n    ok = blob "\\\\4b\\\\82"\\n  },\\n)\\n'; }\nENV=testnet\n${block[0]}\n`;
  const res = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.match(res.stdout, /✓ report signing key published/, res.stdout + res.stderr);
});

// A deploy whose canisters all upgraded must not fail because a top-up did:
// a failed run skips the smoke test and the testnet-*/mainnet-* tag (so the
// next upgrade gate compares against an older build) and the relay deploy
// that waits for a successful Deploy Testnet. The 2026-10-24 testnet run
// upgraded everything, then failed here. The low canisters are still named,
// as a GitHub warning and in the run summary.
function reportTopups(failed, { githubActions = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hg-topup-report-"));
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  const r = spawnSync(
    "bash",
    ["-c", 'source scripts/lib/cycles.sh; cycles_report_topup_failures testnet "$1"; echo "rc=$?"', "_", failed],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: githubActions ? "true" : "", GITHUB_STEP_SUMMARY: githubActions ? summary : "" },
    },
  );
  return { ...r, summary: readFileSync(summary, "utf8") };
}

test("a failed cycle top-up is reported as a warning naming the canisters, not an error", () => {
  const r = reportTopups(" payment photo");
  assert.match(r.stdout, /rc=0/);
  assert.match(r.stdout, /::warning[^\n]*payment photo/);
  assert.match(r.stdout, /ICP_ENV=testnet bash scripts\/top-up-canisters\.sh/);
  assert.match(r.summary, /payment photo/);
});

test("no top-up failures prints nothing", () => {
  const r = reportTopups("");
  assert.equal(r.stdout.trim(), "rc=0");
  assert.equal(r.summary, "");
});

test("outside GitHub Actions the top-up warning is plain text", () => {
  const r = reportTopups(" fee", { githubActions: false });
  assert.match(r.stdout, /rc=0/);
  assert.doesNotMatch(r.stdout, /::warning/);
  assert.match(r.stdout, /fee/);
});

test("deploy.sh reports top-up failures without failing the deploy", () => {
  const sh = read("scripts/deploy.sh");
  assert.match(sh, /cycles_report_topup_failures "\$ENV" "\$\{CYCLES_TOPUP_FAILED:-\}"/);
  assert.doesNotMatch(sh, /CYCLES_TOPUP_FAILED[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*exit 1/);
});
