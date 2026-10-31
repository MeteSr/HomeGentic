// Generates TypeScript types for every Candid declaration in
// packages/shared/src/declarations/ and writes them to packages/shared/src/types/.
//
//   node --experimental-strip-types --no-warnings scripts/gen-declaration-types.mjs          # write
//   node --experimental-strip-types --no-warnings scripts/gen-declaration-types.mjs --check  # fail on drift
//
// The types describe exactly what the declaration decodes, not the whole
// canister interface: a declaration may list a subset of methods, or leave out
// record fields it doesn't read (Candid subtyping), and the canister-side match
// is checked separately by scripts/ci/check-declarations.sh. Each `const Name =`
// in a factory becomes `export type Name`; `_SERVICE` lists the declared methods
// for `lazyActor<_SERVICE>()`.
//
// Needs Node 22.6+ and @icp-sdk/core installed at the repo root or in frontend/
// (or set CANDID_FROM to a folder that has it).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as prettier from "prettier";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "packages/shared/src");
const OUT = path.join(SRC, "types");
const CHECK = process.argv.includes("--check");

function candidFrom() {
  if (process.env.CANDID_FROM) return process.env.CANDID_FROM;
  for (const d of [ROOT, path.join(ROOT, "frontend")]) {
    if (fs.existsSync(path.join(d, "node_modules/@icp-sdk/core"))) return d;
  }
  console.error("❌ @icp-sdk/core not installed (npm ci at the root or in frontend/, or set CANDID_FROM)");
  process.exit(2);
}
const require = createRequire(path.join(candidFrom(), "package.json"));
const { IDL } = await import(pathToFileURL(require.resolve("@icp-sdk/core/candid")).href);

// ── Name the factory's local types ─────────────────────────────────────────────
// Rewrites `const Name = <expr>;` to `const Name = __name("Name", <expr>);` so the
// generator knows which IDL objects the declaration named.
function nameConsts(src) {
  let out = "";
  let i = 0;
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === "idlFactory") continue; // the factory itself: name the consts inside it
    const start = m.index + m[0].length;
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '"' || c === "'" || c === "`") {
        for (j++; j < src.length && src[j] !== c; j++) if (src[j] === "\\") j++;
        continue;
      }
      if (c === "/" && src[j + 1] === "/") {
        j = src.indexOf("\n", j);
        continue;
      }
      if (c === "/" && src[j + 1] === "*") {
        j = src.indexOf("*/", j) + 1;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === ";" && depth === 0) break;
    }
    if (j >= src.length) throw new Error(`statement for const ${m[1]} has no closing ';'`);
    out += src.slice(i, start) + `__name(${JSON.stringify(m[1])}, ` + src.slice(start, j) + ")";
    i = j;
    re.lastIndex = j;
  }
  return out + src.slice(i);
}

// ── Load the declarations (Node strips the types; it needs explicit .ts extensions) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "decl-types-"));
const names = new Map();
globalThis.__name = (name, value) => {
  if (value instanceof IDL.Type && !names.has(value)) names.set(value, name);
  return value;
};
const files = fs
  .readdirSync(path.join(SRC, "declarations"))
  .filter((f) => f.endsWith(".ts"))
  .sort();
for (const rel of ["serviceTypes.ts", ...files.map((f) => `declarations/${f}`)]) {
  const dest = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let s = fs.readFileSync(path.join(SRC, rel), "utf8").replace(/from "(\.[^"]+)"/g, 'from "$1.ts"');
  if (rel.startsWith("declarations/")) s = nameConsts(s);
  fs.writeFileSync(dest, s);
}

// ── IDL type → TypeScript ──────────────────────────────────────────────────────
const IDENT = /^[A-Za-z_$][\w$]*$/;
const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k));
const TYPED_ARRAYS = {
  nat8: "Uint8Array",
  nat16: "Uint16Array",
  nat32: "Uint32Array",
  nat64: "BigUint64Array",
  int8: "Int8Array",
  int16: "Int16Array",
  int32: "Int32Array",
  int64: "BigInt64Array",
};

function generate(service) {
  const defs = new Map(); // name -> TS text
  const used = new Set();
  const ts = (t, indent) => {
    const named = names.get(t);
    if (named && named !== "__service") {
      if (!defs.has(named)) {
        defs.set(named, null); // reserve first, so recursion terminates
        defs.set(named, body(t, ""));
      }
      return named;
    }
    return body(t, indent);
  };
  const body = (t, indent) => {
    const inner = indent + "  ";
    if (t instanceof IDL.RecClass) return ts(t.getType(), indent);
    if (t instanceof IDL.BoolClass) return "boolean";
    if (t instanceof IDL.NullClass) return "null";
    if (t instanceof IDL.ReservedClass) return "unknown";
    if (t instanceof IDL.EmptyClass) return "never";
    if (t instanceof IDL.TextClass) return "string";
    if (t instanceof IDL.NatClass || t instanceof IDL.IntClass) return "bigint";
    if (t instanceof IDL.FloatClass) return "number";
    if (t instanceof IDL.FixedNatClass || t instanceof IDL.FixedIntClass) return t._bits <= 32 ? "number" : "bigint";
    if (t instanceof IDL.PrincipalClass) {
      used.add("Principal");
      return "Principal";
    }
    if (t instanceof IDL.ServiceClass) {
      used.add("Principal");
      return "Principal";
    }
    if (t instanceof IDL.FuncClass) {
      used.add("Principal");
      return "[Principal, string]";
    }
    if (t instanceof IDL.OptClass) return `[] | [${ts(t._type, indent)}]`;
    if (t instanceof IDL.VecClass) {
      const el = t._type;
      if (el instanceof IDL.FixedNatClass || el instanceof IDL.FixedIntClass) {
        return `${TYPED_ARRAYS[el.name]} | ${el._bits <= 32 ? "number" : "bigint"}[]`;
      }
      const e = ts(el, indent);
      return /^[\w$.]+$/.test(e) ? `${e}[]` : `Array<${e}>`;
    }
    if (t instanceof IDL.TupleClass) return `[${t._components.map((c) => ts(c, indent)).join(", ")}]`;
    if (t instanceof IDL.RecordClass) {
      if (t._fields.length === 0) return "Record<string, never>";
      return `{\n${t._fields.map(([k, f]) => `${inner}${key(k)}: ${ts(f, inner)};`).join("\n")}\n${indent}}`;
    }
    if (t instanceof IDL.VariantClass) {
      return t._fields.map(([k, f]) => `\n${inner}| { ${key(k)}: ${ts(f, inner)} }`).join("");
    }
    throw new Error(`unsupported IDL type ${t.display()}`);
  };

  const methods = service._fields.map(([name, f]) => {
    const args = f.argTypes.map((a) => ts(a, "  ")).join(", ");
    const rets = f.retTypes.map((r) => ts(r, "  "));
    const ret = rets.length === 0 ? "undefined" : rets.length === 1 ? rets[0] : `[${rets.join(", ")}]`;
    return `  ${key(name)}: ActorMethod<[${args}], ${ret}>;`;
  });
  return { defs, used, methods };
}

// Format with the repo's Prettier config so the files pass the new-file check.
const prettierOptions = { ...(await prettier.resolveConfig(path.join(OUT, "x.ts"))), parser: "typescript" };

let drift = 0;
if (!CHECK) fs.mkdirSync(OUT, { recursive: true });
const expected = new Set();
for (const file of files) {
  names.clear();
  const { idlFactory } = await import(pathToFileURL(path.join(tmp, "declarations", file)).href);
  const service = idlFactory({ IDL });
  const { defs, used, methods } = generate(service);
  const imports = ['import type { ActorMethod } from "@icp-sdk/core/agent";'];
  if (used.has("Principal")) imports.push('import type { Principal } from "@icp-sdk/core/principal";');
  const raw = [
    `// Generated from ../declarations/${file} by scripts/gen-declaration-types.mjs. Do not edit;`,
    "// change the declaration and run `npm run gen:declaration-types`.",
    ...imports,
    "",
    ...[...defs].map(([n, d]) => `export type ${n} = ${d};\n`),
    "/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */",
    "export interface _SERVICE {",
    ...methods,
    "}",
    "",
  ].join("\n");
  const text = await prettier.format(raw, prettierOptions);
  const dest = path.join(OUT, file);
  expected.add(file);
  if (CHECK) {
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
    if (current !== text) {
      console.log(`✗ types/${file} is out of date`);
      drift++;
    }
  } else {
    fs.writeFileSync(dest, text);
  }
}
if (CHECK && fs.existsSync(OUT)) {
  for (const f of fs.readdirSync(OUT))
    if (!expected.has(f)) {
      console.log(`✗ types/${f} has no declaration`);
      drift++;
    }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (CHECK) {
  if (drift) {
    console.log("\nRun `npm run gen:declaration-types` and commit packages/shared/src/types/.");
    process.exit(1);
  }
  console.log("✅ packages/shared/src/types/ matches the declarations");
} else {
  console.log(`Wrote ${files.length} files to packages/shared/src/types/`);
}
