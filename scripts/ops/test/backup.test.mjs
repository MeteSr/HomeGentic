// backup-canisters.sh and restore-drill.sh against a stand-in icp-cli
// (fake-icp.sh) and a local backup folder. Run: npm test --prefix scripts/ops
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../../..");
const haveAge = spawnSync("age", ["--version"]).status === 0;

const tmp = mkdtempSync(join(tmpdir(), "hg-backup-"));
const state = join(tmp, "state");
const dest = join(tmp, "dest");
const bin = join(tmp, "bin");
const key = join(tmp, "age.key");
let recipient = "";

function env(extra = {}) {
  return {
    PATH: `${bin}:${process.env.PATH}`, FAKE_ICP_STATE: state, ICP_ENV: "testnet", ICP_NETWORK_ARGS: "-n local",
    BACKUP_DEST: dest, BACKUP_AGE_RECIPIENT: recipient, BACKUP_AGE_IDENTITY_FILE: key,
    BACKUP_CANISTERS: "job bills", CANISTER_ID_JOB: "job-id", CANISTER_ID_BILLS: "bills-id", ...extra,
  };
}
const run = (script, args, extra) => spawnSync("bash", [`scripts/ops/${script}`, ...args], { cwd: ROOT, env: env(extra), encoding: "utf8" });
const data = (id, v) => { mkdirSync(join(state, id, "snaps"), { recursive: true }); writeFileSync(join(state, id, "data"), v); writeFileSync(join(state, id, "status"), "Running"); };
const status = (id) => readFileSync(join(state, id, "status"), "utf8").trim();
const today = () => new Date().toISOString().slice(0, 10);

before(() => {
  if (!haveAge) return;
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(HERE, "fake-icp.sh"), join(bin, "icp"));
  execFileSync("age-keygen", ["-o", key], { stdio: "pipe" });
  recipient = /public key: (age1\w+)/.exec(readFileSync(key, "utf8"))[1];
  data("job-id", "job records v1");
  data("bills-id", "bills v1");
  data("scratch-id", "empty");
});

test("backs up every canister encrypted, restarts each, and leaves no snapshot behind", { skip: !haveAge }, () => {
  const r = run("backup-canisters.sh", []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(dest, "testnet", today());
  assert.deepEqual(readdirSync(dir).sort(), ["bills.tar.gz.age", "job.tar.gz.age", "manifest.tsv"]);
  assert.equal(readFileSync(join(dir, "job.tar.gz.age")).subarray(0, 21).toString(), "age-encryption.org/v1");
  assert.ok(!readFileSync(join(dir, "job.tar.gz.age")).includes("job records"), "archive is not plaintext");
  const manifest = readFileSync(join(dir, "manifest.tsv"), "utf8");
  assert.match(manifest, /^job\tjob-id\t0xfeed\t\d+\t[0-9a-f]{64}$/m);
  for (const id of ["job-id", "bills-id"]) {
    assert.equal(status(id), "Running");
    assert.deepEqual(readdirSync(join(state, id, "snaps")), []);
  }
});

test("a canister that can't be snapshotted is restarted and fails the run; the others are still backed up", { skip: !haveAge }, () => {
  const r = run("backup-canisters.sh", [], { FAKE_FAIL_SNAPSHOT: "bills-id", BACKUP_DATE: "2099-01-01" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Not backed up: bills/);
  assert.equal(status("bills-id"), "Running");
  assert.ok(existsSync(join(dest, "testnet", "2099-01-01", "job.tar.gz.age")));
  assert.ok(!existsSync(join(dest, "testnet", "2099-01-01", "bills.tar.gz.age")));
});

test("deletes backups older than the retention period", { skip: !haveAge }, () => {
  mkdirSync(join(dest, "testnet", "2000-01-01"), { recursive: true });
  const r = run("backup-canisters.sh", [], { BACKUP_DATE: today() });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dest, "testnet", "2000-01-01")));
  assert.ok(existsSync(join(dest, "testnet", "2099-01-01")), "newer folders are kept");
});

test("restores a backup into a scratch canister", { skip: !haveAge }, () => {
  const r = run("restore-drill.sh", ["job", "scratch-id", today()]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Restored job/);
  assert.equal(readFileSync(join(state, "scratch-id", "data"), "utf8"), "job records v1");
  assert.equal(status("scratch-id"), "Running");
  assert.deepEqual(readdirSync(join(state, "scratch-id", "snaps")), [], "uploaded snapshot removed");
});

test("refuses a tampered archive", { skip: !haveAge }, () => {
  appendFileSync(join(dest, "testnet", today(), "bills.tar.gz.age"), "x");
  const r = run("restore-drill.sh", ["bills", "scratch-id", today()]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /checksum mismatch/);
});

test("refuses to restore over a live canister without --production", { skip: !haveAge }, () => {
  const ids = JSON.parse(readFileSync(join(ROOT, "canister_ids.json"), "utf8"));
  const live = ids.job?.testnet ?? ids.job?.ic;
  if (!live) return;
  const r = run("restore-drill.sh", ["job", live]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /live/);
});
