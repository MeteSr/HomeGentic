// Checks packages/shared/src/declarations/<canister>.ts against the Candid
// interface moc generates for backend/<canister>/main.mo.
//
//   node --experimental-strip-types scripts/ci/check-declarations.mjs <did-dir>
//
// For every method a declaration lists, the canister must have it with the
// same query/update mode, accept the arguments the declaration sends, and
// return something the declaration can decode (Candid subtyping: extra record
// fields and opt fields are fine, a missing required field or an unknown
// variant tag is not). Run through check-declarations.sh, which builds the
// .did files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DID_DIR = process.argv[2];
if (!DID_DIR) { console.error("usage: check-declarations.mjs <did-dir>"); process.exit(2); }
const SRC = path.join(ROOT, "packages/shared/src");
const require = createRequire(path.join(process.env.CANDID_FROM ?? ROOT, "package.json"));
const { IDL } = await import(pathToFileURL(require.resolve("@icp-sdk/core/candid")).href);

// ── Load the declarations (Node strips the types; it needs explicit .ts extensions) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "decl-"));
for (const rel of ["serviceTypes.ts", ...fs.readdirSync(path.join(SRC, "declarations")).map((f) => `declarations/${f}`)]) {
  const dest = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fs.readFileSync(path.join(SRC, rel), "utf8").replace(/from "(\.[^"]+)"/g, 'from "$1.ts"'));
}

// ── A small Candid type parser, for both .did text and IDL display() strings ──
const PRIMS = new Set(["nat", "nat8", "nat16", "nat32", "nat64", "int", "int8", "int16", "int32", "int64",
  "text", "bool", "null", "reserved", "empty", "principal", "float32", "float64"]);
const MODES = new Set(["query", "oneway", "composite_query"]);
const tokenize = (s) => s.match(/"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*|\d+|->|[{}();:,=]/g) ?? [];
const unquote = (t) => t.replace(/^"|"$/g, "");

function parseType(tk, i) {
  const t = tk[i];
  if (t === "opt" || t === "vec") { const [inner, j] = parseType(tk, i + 1); return [{ k: t, t: inner }, j]; }
  if (t === "blob") return [{ k: "vec", t: { k: "p", n: "nat8" } }, i + 1];
  if (t === "record" || t === "variant") {
    i += 2; const f = {}; let idx = 0;
    while (tk[i] !== "}") {
      if (tk[i] === undefined) throw new Error(`unterminated ${t}`);
      let name, ty;
      if (tk[i + 1] === ":") { name = unquote(tk[i]); [ty, i] = parseType(tk, i + 2); }
      else if (t === "variant") { name = unquote(tk[i]); ty = { k: "p", n: "null" }; i += 1; }
      else { name = String(idx); [ty, i] = parseType(tk, i); }
      idx++; f[name] = ty; if (tk[i] === ";") i++;
    }
    return [{ k: t, f }, i + 1];
  }
  if (t === "func" || t === "service") throw new Error(`${t} reference types are not supported`);
  if (PRIMS.has(t)) return [{ k: "p", n: t }, i + 1];
  return [{ k: "ref", n: t }, i + 1];
}

function parseArgs(tk, i) {
  i++; const out = [];
  while (tk[i] !== ")") {
    if (tk[i] === undefined) throw new Error("unterminated argument list");
    if (tk[i + 1] === ":" && !["opt", "vec", "record", "variant"].includes(tk[i])) i += 2;   // named argument
    let ty; [ty, i] = parseType(tk, i); out.push(ty); if (tk[i] === ",") i++;
  }
  return [out, i + 1];
}

function parseService(tk, i) {
  i++; const methods = {};
  while (tk[i] !== "}") {
    if (tk[i] === undefined) throw new Error("unterminated service");
    const name = unquote(tk[i]); i += 2;
    let a, r; [a, i] = parseArgs(tk, i); i++; [r, i] = parseArgs(tk, i);
    const mode = []; while (MODES.has(tk[i])) mode.push(tk[i++]);
    methods[name] = { a, r, mode }; if (tk[i] === ";") i++;
  }
  return [methods, i + 1];
}

function parseDid(text) {
  const tk = tokenize(text.replace(/\/\/.*$/gm, ""));
  const types = {}; let i = 0;
  while (i < tk.length) {
    if (tk[i] === "type") {
      const name = tk[i + 1];
      if (tk[i + 3] === "service") { let j = i + 4; while (tk[j] !== "{") j++; const [m, k] = parseService(tk, j); types[name] = { k: "service", m }; i = k; }
      else { const [ty, j] = parseType(tk, i + 3); types[name] = ty; i = j; }
      if (tk[i] === ";") i++;
      continue;
    }
    if (tk[i] === "service") {
      let j = i + 1; while (tk[j] !== "{" && tk[j] !== undefined) j++;
      if (tk[j] === "{") return { types, methods: parseService(tk, j)[0] };
      // Actor class: `service : (init) -> Name` names a service type.
      const ref = tk.filter((t) => t !== ";").at(-1);
      return { types, methods: types[ref].m };
    }
    i++;
  }
  throw new Error("no service in .did");
}

// ── Subtyping: can a value of type `s` be decoded as type `r`? ──
const resolve = (t, types) => (t && t.k === "ref" ? resolve(types[t.n], types) : t);
function accepts(r, s, rTypes, sTypes, at, errs, depth = 0) {
  if (depth > 30) return;
  r = resolve(r, rTypes); s = resolve(s, sTypes);
  if (!r || !s) return void errs.push(`${at}: unresolved type`);
  if (r.k === "p" && r.n === "reserved") return;
  if (r.k === "opt") {
    if (s.k === "opt") return accepts(r.t, s.t, rTypes, sTypes, `${at}?`, errs, depth + 1);
    if (s.k === "p" && s.n === "null") return;
    const inner = []; accepts(r.t, s, rTypes, sTypes, at, inner, depth + 1);
    if (inner.length) errs.push(`${at}: always decodes as null (${inner[0]})`);
    return;
  }
  if (r.k !== s.k) return void errs.push(`${at}: ${s.k === "p" ? s.n : s.k} where ${r.k === "p" ? r.n : r.k} is expected`);
  if (r.k === "p") { if (r.n !== s.n && !(r.n === "int" && s.n === "nat")) errs.push(`${at}: ${s.n} where ${r.n} is expected`); return; }
  if (r.k === "vec") return accepts(r.t, s.t, rTypes, sTypes, `${at}[]`, errs, depth + 1);
  if (r.k === "record") {
    for (const [n, ft] of Object.entries(r.f)) {
      if (n in s.f) { accepts(ft, s.f[n], rTypes, sTypes, `${at}.${n}`, errs, depth + 1); continue; }
      const rf = resolve(ft, rTypes);
      if (!(rf.k === "opt" || (rf.k === "p" && (rf.n === "null" || rf.n === "reserved")))) errs.push(`${at}.${n}: required field missing`);
    }
    return;
  }
  if (r.k === "variant") {
    for (const [n, ft] of Object.entries(s.f)) {
      if (n in r.f) accepts(r.f[n], ft, rTypes, sTypes, `${at}#${n}`, errs, depth + 1);
      else errs.push(`${at}#${n}: tag unknown to the receiver`);
    }
  }
}

function declaredMethods(factory) {
  const conv = (types) => types.map((t) => parseType(tokenize(t.display().replace(/μ[A-Za-z0-9_]+\./g, "")), 0)[0]);
  return Object.fromEntries(factory({ IDL })._fields.map(([name, f]) => [name, { a: conv(f.argTypes), r: conv(f.retTypes), mode: f.annotations }]));
}

let problems = 0;
for (const file of fs.readdirSync(path.join(tmp, "declarations")).sort()) {
  const canister = file.replace(/\.ts$/, "");
  const didPath = path.join(DID_DIR, `${canister}.did`);
  if (!fs.existsSync(didPath)) { console.log(`- ${canister}: no canister in backend/, skipped`); continue; }
  const did = parseDid(fs.readFileSync(didPath, "utf8"));
  const { idlFactory } = await import(pathToFileURL(path.join(tmp, "declarations", file)).href);
  const issues = [];
  for (const [name, d] of Object.entries(declaredMethods(idlFactory))) {
    const c = did.methods[name];
    if (!c) { issues.push(`${name}: not a method of the canister`); continue; }
    if (d.mode.join(",") !== c.mode.join(",")) issues.push(`${name}: declared [${d.mode}] but the canister has [${c.mode}]`);
    const errs = [];
    if (d.a.length > c.a.length) errs.push(`sends ${d.a.length} arguments, the canister takes ${c.a.length}`);
    c.a.forEach((ct, i) => {
      if (i < d.a.length) accepts(ct, d.a[i], did.types, {}, `arg${i}`, errs);
      else if (resolve(ct, did.types).k !== "opt") errs.push(`arg${i}: not sent`);
    });
    d.r.forEach((dt, i) => {
      if (i < c.r.length) accepts(dt, c.r[i], {}, did.types, `result${i}`, errs);
      else errs.push(`result${i}: the canister returns fewer values`);
    });
    for (const e of errs) issues.push(`${name}: ${e}`);
  }
  console.log(`${issues.length ? "✗" : "✓"} ${canister}`);
  for (const i of issues) console.log(`    ${i}`);
  problems += issues.length;
}
fs.rmSync(tmp, { recursive: true, force: true });
if (problems) {
  console.log(`\n${problems} mismatch(es). Update packages/shared/src/declarations/ to match the canister.`);
  process.exit(1);
}
console.log("\nAll shared declarations match their canisters.");
