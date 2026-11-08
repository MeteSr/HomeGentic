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
