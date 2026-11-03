// The deploy gates' helpers: the post-deploy wiring probe (check-ic-env.mjs)
// and how the deploy workflows find the build that is running
// (scripts/ci/deployed-ref.sh). Run: npm test --prefix scripts/ops
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIcEnvCookie, wiringProblems } from "../check-ic-env.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../../..");

const cookie = (vars) =>
  "ic_env=" +
  encodeURIComponent(
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("&"),
  ) +
  "; Path=/; SameSite=Lax";

test("parseIcEnvCookie reads the ic_env cookie the frontend canister sets", () => {
  const headers = [
    "HTTP/2 200",
    "content-type: text/html",
    "set-cookie: other=1",
    "set-cookie: " +
      cookie({ ic_root_key: "abcd", "PUBLIC_CANISTER_ID:job": "aaaaa-aa", "PUBLIC_CANISTER_ID:auth": "bbbbb-bb" }),
  ].join("\r\n");
  assert.deepEqual(parseIcEnvCookie(headers), {
    ic_root_key: "abcd",
    "PUBLIC_CANISTER_ID:job": "aaaaa-aa",
    "PUBLIC_CANISTER_ID:auth": "bbbbb-bb",
  });
  assert.equal(parseIcEnvCookie("HTTP/2 200\r\ncontent-type: text/html"), null);
});

test("wiringProblems: none when every canister's variable matches canister_ids.json", () => {
  const ids = { job: { testnet: "aaaaa-aa" }, auth: { testnet: "bbbbb-bb" }, frontend: { testnet: "ccccc-cc" } };
  const env = { ic_root_key: "x", "PUBLIC_CANISTER_ID:job": "aaaaa-aa", "PUBLIC_CANISTER_ID:auth": "bbbbb-bb" };
  assert.deepEqual(wiringProblems(env, ids, "testnet", ["job", "auth"]), []);
});

test("wiringProblems names a missing variable, a wrong ID and a missing cookie", () => {
  const ids = { job: { testnet: "aaaaa-aa" }, auth: { testnet: "bbbbb-bb" } };
  assert.deepEqual(wiringProblems({ "PUBLIC_CANISTER_ID:job": "zzzzz-zz" }, ids, "testnet", ["job", "auth"]), [
    "PUBLIC_CANISTER_ID:job is zzzzz-zz, canister_ids.json has aaaaa-aa",
    "PUBLIC_CANISTER_ID:auth is missing",
  ]);
  assert.deepEqual(wiringProblems(null, ids, "testnet", ["job"]), [
    "the frontend sets no ic_env cookie, so the canisters' PUBLIC_CANISTER_ID variables can't be checked",
  ]);
  // A canister with no ID for this environment isn't deployed there: nothing to check.
  assert.deepEqual(wiringProblems({}, { job: {} }, "testnet", ["job"]), []);
});

test("deployed-ref.sh picks the newest well-formed tag for the prefix", () => {
  const repo = mkdtempSync(join(tmpdir(), "hg-tags-"));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
  for (const t of ["testnet-20261007-120000", "testnet-20261102-090000", "testnet-latest", "mainnet-20260101-000000"])
    git("tag", t);
  const ref = (prefix) =>
    execFileSync("bash", [join(ROOT, "scripts/ci/deployed-ref.sh"), prefix], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(ref("testnet"), "testnet-20261102-090000");
  assert.equal(ref("mainnet"), "mainnet-20260101-000000");
  assert.equal(ref("staging"), "");
});
