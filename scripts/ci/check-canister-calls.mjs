// Checks every canister-to-canister call against the callee's real interface.
//
// The canisters call each other through actor types written at the call
// site (`actor(propCanisterId) : actor { getPropertyAddress : ... }`) or in
// backend/shared/Canisters.mo. Motoko trusts those types: if the callee
// renames a method or changes a field, the caller still compiles and the
// call fails at run time, often inside a try/catch that hides it.
//
// This copies backend/ to a temp folder and points each such actor
// reference at the callee's Candid instead (`import CHECK_property
// "canister:property"`), so moc checks that the callee's real type is a
// subtype of the type the caller declared. Then it type-checks every
// canister.
//
//   node scripts/ci/check-canister-calls.mjs <did-dir> <moc> [moc package flags...]
//
// <did-dir> holds <canister>.did for all canisters (check-canister-calls.sh
// builds them). Needs @icp-sdk/core in $CANDID_FROM (for principal text).

import { readFileSync, writeFileSync, readdirSync, cpSync, mkdtempSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const [didDir, moc, ...pkgFlags] = process.argv.slice(2);
if (!didDir || !moc) { console.error("usage: check-canister-calls.mjs <did-dir> <moc> [package flags]"); process.exit(2); }
const require = createRequire(join(resolve(process.env.CANDID_FROM ?? "."), "package.json"));
const { Principal } = require("@icp-sdk/core/principal");

/** Which canister each id expression at a call site names. */
const CALLEE = {
  propCanisterId: "property", jobCanisterId: "job", riskJobCanisterId: "job", "jid.toText()": "job",
  contrCanisterId: "contractor", feeCanisterId: "fee", agentCanisterId: "agent",
  listingCanisterId: "listing", marketCanisterId: "market", payCanisterId: "payment",
  paymentCanisterId: "payment", quoteCanisterId: "quote", reportCanisterId: "report",
  sensorCanisterId: "sensor",
};
/** backend/shared/Canisters.mo: constructor function, or the audit helper's id, → canister. */
const SHARED = { "func payment": "payment", "func property": "property", "func fee": "fee", "id.toText()": "audit" };

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), "canister-calls-"));
const idl = join(work, "idl");
cpSync(join(root, "backend"), join(work, "backend"), { recursive: true });
cpSync(join(root, "did"), idl, { recursive: true });

const canisters = readdirSync(join(root, "backend")).filter((c) => existsSync(join(root, "backend", c, "main.mo"))).sort();
const aliases = [];
canisters.forEach((c, i) => {
  const p = Principal.fromUint8Array(new Uint8Array([0, 0, 0, 0, 0, 0x10, 0, i + 1, 1, 1])).toText();
  copyFileSync(join(didDir, `${c}.did`), join(idl, `${p}.did`));
  aliases.push("--actor-alias", c, p);
});

/** Rewrites one file's actor references; returns how many it pointed at a callee. */
function rewrite(file, isShared) {
  let src = readFileSync(file, "utf8");
  const used = new Set();
  let n = 0;
  src = src.replace(/(?<![\w"])actor\s*\(\s*([A-Za-z_][\w.()]*)\s*\)/g, (whole, id) => {
    const callee = CALLEE[id] ?? (isShared ? SHARED[id] : undefined);
    if (!callee) return whole;
    used.add(callee); n++;
    return `CHECK_${callee}`;
  });
  if (isShared) {
    src = src.replace(/public func (\w+)\(id : Text\) : (\w+) = actor \(id\);/g, (whole, name, type) => {
      const callee = SHARED[`func ${name}`];
      if (!callee) return whole;
      used.add(callee); n++;
      return `public func ${name}(_id : Text) : ${type} = CHECK_${callee};`;
    });
  }
  const imports = [...used].sort().map((c) => `import CHECK_${c} "canister:${c}";`).join("\n");
  writeFileSync(file, (imports ? imports + "\n" : "") + src);
  return n;
}

let refs = rewrite(join(work, "backend/shared/Canisters.mo"), true);
for (const c of canisters) refs += rewrite(join(work, "backend", c, "main.mo"), false);

// Every actor(<id>) left in a main.mo is a call this check doesn't know the
// callee of: fail, so a new call site gets a CALLEE entry.
const unknown = [];
for (const c of canisters) {
  for (const m of readFileSync(join(work, "backend", c, "main.mo"), "utf8").matchAll(/(?<![\w"])actor\s*\(\s*([A-Za-z_][\w.()]*)\s*\)/g)) {
    unknown.push(`backend/${c}/main.mo: actor(${m[1]})`);
  }
}

const failures = [];
for (const c of canisters) {
  try {
    execFileSync(moc, ["--check", "--hide-warnings", "--actor-idl", idl, ...aliases, ...pkgFlags, join(work, "backend", c, "main.mo")],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch (e) {
    // moc prints the callee's whole interface; keep where and why.
    const out = String(e.stderr || e.stdout).split(work + "/").join("");
    const where = out.split("\n")[0];
    const why = out.slice(out.indexOf("cannot produce expected type") >>> 0);
    failures.push(`── ${c} ──\n${where}\n${out.includes("cannot produce") ? why : out}`);
  }
}
rmSync(work, { recursive: true, force: true });

console.log(`Checked ${refs} canister-to-canister actor references across ${canisters.length} canisters.`);
if (unknown.length) {
  console.error(`❌ Calls to a canister this check can't name (add the id to CALLEE in scripts/ci/check-canister-calls.mjs):\n  ${unknown.join("\n  ")}`);
}
if (failures.length) {
  console.error("❌ A caller's declared actor type doesn't match the callee's interface:\n" + failures.join("\n"));
}
if (unknown.length || failures.length) process.exit(1);
console.log("✅ Every cross-canister call matches its callee's interface.");
