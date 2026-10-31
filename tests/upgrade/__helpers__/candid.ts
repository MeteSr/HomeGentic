/**
 * The Candid interface a canister's Wasm declares (its `candid:service`
 * metadata, which moc embeds), turned into an IDL factory. Lets a test sweep
 * every method a canister really exports, including the admin methods the
 * shared declarations leave out.
 *
 * Handles the subset of Candid text moc emits: type definitions, records
 * (named or tuple fields), variants, opt, vec, blob, func and service types,
 * and every primitive.
 */

import { readFileSync } from "fs";
import { IDL } from "@icp-sdk/core/candid";

/** Custom sections of a Wasm module, by name. */
export function wasmCustomSections(path: string): Map<string, string> {
  const b = readFileSync(path);
  const out = new Map<string, string>();
  let i = 8;
  const leb = () => { let r = 0, s = 0, x: number; do { x = b[i++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); return r >>> 0; };
  while (i < b.length) {
    const id = b[i++];
    const size = leb();
    const end = i + size;
    if (id === 0) {
      const nameLen = leb();
      const name = b.subarray(i, i + nameLen).toString("utf8");
      out.set(name, b.subarray(i + nameLen, end).toString("utf8"));
    }
    i = end;
  }
  return out;
}

export interface ParsedService {
  /** IDL factory for the service (methods only). */
  idlFactory: (a: { IDL: typeof IDL }) => IDL.ServiceClass;
  /** Init argument types (empty for a plain actor). */
  initArgs: IDL.Type[];
}

const PRIMS: Record<string, () => IDL.Type> = {
  nat: () => IDL.Nat, int: () => IDL.Int, bool: () => IDL.Bool, text: () => IDL.Text,
  null: () => IDL.Null, reserved: () => IDL.Reserved, empty: () => IDL.Empty, principal: () => IDL.Principal,
  nat8: () => IDL.Nat8, nat16: () => IDL.Nat16, nat32: () => IDL.Nat32, nat64: () => IDL.Nat64,
  int8: () => IDL.Int8, int16: () => IDL.Int16, int32: () => IDL.Int32, int64: () => IDL.Int64,
  float32: () => IDL.Float32, float64: () => IDL.Float64, blob: () => IDL.Vec(IDL.Nat8),
};

export function parseCandid(src: string): ParsedService {
  const toks = src.match(/"(?:[^"\\]|\\.)*"|->|[A-Za-z_][A-Za-z0-9_]*|\d+|[:;,(){}=]/g) ?? [];
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const eat = (t: string) => { if (toks[p] !== t) throw new Error(`candid: expected ${t}, got ${toks[p]} at ${p}`); p++; };
  const name = () => { const t = next(); return t.startsWith('"') ? JSON.parse(t) : t; };

  // `type T = int;` style aliases resolve to the aliased type itself (a Rec
  // wrapping a primitive can't be encoded); everything else is a Rec, so
  // definitions can refer to each other in any order.
  const aliases = new Map<string, string>();
  for (let i = 0; i + 4 < toks.length; i++) {
    if (toks[i] === "type" && toks[i + 2] === "=" && toks[i + 4] === ";" && /^[A-Za-z_]/.test(toks[i + 3])) aliases.set(toks[i + 1], toks[i + 3]);
  }
  const defs = new Map<string, IDL.RecClass>();
  const def = (n: string): IDL.Type => {
    const a = aliases.get(n);
    if (a !== undefined) return PRIMS[a] ? PRIMS[a]() : def(a);
    if (!defs.has(n)) defs.set(n, IDL.Rec());
    return defs.get(n)!;
  };

  function type(): IDL.Type {
    const t = next();
    if (t === "opt") return IDL.Opt(type());
    if (t === "vec") return IDL.Vec(type());
    if (t === "record") return record();
    if (t === "variant") return variant();
    if (t === "func") return funcSig();
    if (t === "service") return service();
    if (PRIMS[t]) return PRIMS[t]();
    return def(t);
  }
  function fields(isVariant: boolean): [string, IDL.Type][] {
    eat("{");
    const fs: [string, IDL.Type][] = [];
    let idx = 0;
    while (peek() !== "}") {
      // `name: T`, `name` (variant, null), or `T` (tuple field)
      const save = p;
      const first = next();
      if (peek() === ":") { next(); fs.push([first.startsWith('"') ? JSON.parse(first) : first, type()]); }
      else if (isVariant) fs.push([first.startsWith('"') ? JSON.parse(first) : first, IDL.Null]);
      else { p = save; fs.push([String(idx), type()]); }
      idx++;
      if (peek() === ";") next();
    }
    eat("}");
    return fs;
  }
  function record(): IDL.Type {
    const fs = fields(false);
    if (fs.length > 0 && fs.every(([k], i) => k === String(i))) return IDL.Tuple(...fs.map(([, t]) => t));
    return IDL.Record(Object.fromEntries(fs));
  }
  function variant(): IDL.Type { return IDL.Variant(Object.fromEntries(fields(true))); }
  function argList(): IDL.Type[] {
    eat("(");
    const ts: IDL.Type[] = [];
    while (peek() !== ")") {
      if (toks[p + 1] === ":") { next(); next(); }   // named argument
      ts.push(type());
      if (peek() === ",") next();
    }
    eat(")");
    return ts;
  }
  function funcSig(): IDL.FuncClass {
    const args = argList();
    eat("->");
    const rets = argList();
    const modes: string[] = [];
    while (peek() === "query" || peek() === "composite_query" || peek() === "oneway") modes.push(next());
    return IDL.Func(args, rets, modes as any);
  }
  function methods(): Record<string, IDL.FuncClass> {
    eat("{");
    const ms: Record<string, IDL.FuncClass> = {};
    while (peek() !== "}") {
      const n = name();
      eat(":");
      ms[n] = peek() === "(" ? funcSig() : (type() as IDL.FuncClass);
      if (peek() === ";") next();
    }
    eat("}");
    return ms;
  }
  function service(): IDL.ServiceClass { return IDL.Service(methods()); }

  let svc: Record<string, IDL.FuncClass> = {};
  let initArgs: IDL.Type[] = [];
  while (p < toks.length) {
    const t = next();
    if (t === "type") {
      const n = name();
      eat("=");
      const body = type();
      if (!aliases.has(n)) (def(n) as IDL.RecClass).fill(body as any);
      if (peek() === ";") next();
    } else if (t === "service") {
      eat(":");
      if (peek() === "(") { initArgs = argList(); eat("->"); }
      svc = peek() === "{" ? methods() : {};
      if (peek() === ";") next();
    }
  }
  return { idlFactory: () => IDL.Service(svc), initArgs };
}

/** The canister's own Candid interface, read from its Wasm. */
export function serviceFromWasm(path: string): ParsedService {
  const s = wasmCustomSections(path);
  const did = s.get("icp:public candid:service") ?? s.get("icp:private candid:service");
  if (!did) throw new Error(`no candid:service metadata in ${path}`);
  const parsed = parseCandid(did);
  // moc keeps the init arguments in their own section, e.g. "(initDeployer: principal)".
  const args = s.get("icp:public candid:args") ?? s.get("icp:private candid:args");
  if (args && parsed.initArgs.length === 0) {
    parsed.initArgs = parseCandid(`${did}\nservice : ${args} -> {}`).initArgs;
  }
  return parsed;
}

/**
 * A plausible value for `t`: valid enough that input checks usually pass, so
 * what refuses a call is the permission check. Principals are `self`, which
 * catches a caller granting itself something.
 */
/** Text that passes common input checks, by record field name. */
const TEXT_HINTS: [RegExp, string][] = [
  [/email/i, "sam@example.com"], [/phone/i, "+15555550100"], [/zip/i, "32801"], [/^state$/i, "FL"],
  [/url|link/i, "https://example.com/x"], [/date/i, "2026-01-01"], [/address/i, "1 Sample St"],
  [/city/i, "Orlando"], [/county/i, "Orange"], [/name/i, "Sam Sample"],
];

export function sampleValue(t: IDL.Type, self: unknown, depth = 0, field = ""): unknown {
  if (t instanceof IDL.RecClass) return sampleValue((t as any)._type, self, depth, field);
  if (depth > 6) {
    if (t instanceof IDL.OptClass) return [];
    if (t instanceof IDL.VecClass) return [];
  }
  if (t instanceof IDL.TextClass) return TEXT_HINTS.find(([re]) => re.test(field))?.[1] ?? "x";
  if (t instanceof IDL.BoolClass) return true;
  if (t instanceof IDL.PrincipalClass) return self;
  if (t instanceof IDL.NatClass || t instanceof IDL.IntClass) return 1n;
  if (t instanceof IDL.FixedNatClass || t instanceof IDL.FixedIntClass) return (t as any)._bits > 32 ? 1n : 1;
  if (t instanceof IDL.FloatClass) return 1;
  if (t instanceof IDL.NullClass || t instanceof IDL.ReservedClass) return null;
  if (t instanceof IDL.OptClass) return [];
  if (t instanceof IDL.VecClass) return [];
  if (t instanceof IDL.TupleClass) return (t as any)._components.map((c: IDL.Type) => sampleValue(c, self, depth + 1));
  if (t instanceof IDL.RecordClass) return Object.fromEntries((t as any)._fields.map(([k, f]: [string, IDL.Type]) => [k, sampleValue(f, self, depth + 1, k)]));
  if (t instanceof IDL.VariantClass) {
    const [k, f] = (t as any)._fields[0];
    return { [k]: sampleValue(f, self, depth + 1) };
  }
  throw new Error(`sampleValue: unsupported type ${t.display()}`);
}
