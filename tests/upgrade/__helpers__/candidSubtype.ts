/**
 * Candid backward compatibility: every way a client built against `older`
 * could fail against `newer`.
 *
 * Follows the Candid spec's subtyping rules
 * (https://github.com/dfinity/candid/blob/master/spec/Candid.md#upgrading-and-subtyping):
 * results must be subtypes of what old clients expect (newer <: older), and
 * arguments old clients send must still be accepted (older <: newer). One
 * deliberate difference: `opt` is strict. The spec lets anything turn into
 * `opt` (the value then decodes as null), but a client that suddenly gets
 * null for a field it relied on is broken, so `opt T` is only a subtype of
 * `opt U` (when T <: U), and `T` of `opt U` (when T <: U).
 */

import { IDL } from "@icp-sdk/core/candid";

type Side = "result" | "argument";

const unrec = (t: IDL.Type): IDL.Type => {
  let x = t;
  for (let i = 0; x instanceof IDL.RecClass && i < 100; i++) x = (x as IDL.RecClass).getType() as IDL.Type;
  return x;
};

const isOptional = (t: IDL.Type) => {
  const u = unrec(t);
  return u instanceof IDL.OptClass || u instanceof IDL.NullClass || u instanceof IDL.ReservedClass;
};

const show = (t: IDL.Type): string => {
  const u = unrec(t);
  if (u instanceof IDL.OptClass) return `opt ${show((u as any)._type)}`;
  if (u instanceof IDL.VecClass) return `vec ${show((u as any)._type)}`;
  if (u instanceof IDL.RecordClass) return "record";
  if (u instanceof IDL.VariantClass) return "variant";
  return u.display();
};

/** Primitive classes that are only subtypes of themselves. */
const PRIMITIVES = [
  IDL.BoolClass,
  IDL.TextClass,
  IDL.NullClass,
  IDL.PrincipalClass,
  IDL.FloatClass,
  IDL.FixedNatClass,
  IDL.FixedIntClass,
];

class Checker {
  private assumed = new Map<IDL.Type, Set<IDL.Type>>();

  /**
   * Breaks if a value of type `t` is read as type `u`. On the result side `t`
   * is the new type; on the argument side it is the old one.
   */
  sub(t0: IDL.Type, u0: IDL.Type, side: Side, path: string[]): string[] {
    const t = unrec(t0);
    const u = unrec(u0);
    if (t === u) return [];
    const seen = this.assumed.get(t) ?? new Set();
    if (seen.has(u)) return [];
    seen.add(u);
    this.assumed.set(t, seen);
    const at = (msg: string) => [[...path, msg].join(": ")];

    if (u instanceof IDL.ReservedClass || t instanceof IDL.EmptyClass) return [];
    if (u instanceof IDL.OptClass) {
      if (t instanceof IDL.NullClass) return [];
      const inner = (u as any)._type as IDL.Type;
      if (t instanceof IDL.OptClass) return this.sub((t as any)._type, inner, side, path);
      if (t instanceof IDL.ReservedClass) return at(`reserved is not ${show(u)}`);
      return this.sub(t, inner, side, path);
    }
    if (t instanceof IDL.OptClass) return at(`${show(t)} is not ${show(u)}`);
    if (t instanceof IDL.NatClass && (u instanceof IDL.NatClass || u instanceof IDL.IntClass)) return [];
    if (t instanceof IDL.IntClass && u instanceof IDL.IntClass) return [];
    for (const P of PRIMITIVES) {
      if (t instanceof P && u instanceof P) {
        // Fixed-width numbers and floats must keep their width.
        return (t as any)._bits === (u as any)._bits ? [] : at(`${show(t)} is not ${show(u)}`);
      }
    }
    if (t instanceof IDL.VecClass && u instanceof IDL.VecClass)
      return this.sub((t as any)._type, (u as any)._type, side, [...path, "[ ]"]);
    if (t instanceof IDL.RecordClass && u instanceof IDL.RecordClass) {
      const have = new Map(t._fields);
      const out: string[] = [];
      for (const [k, ut] of u._fields) {
        const tt = have.get(k);
        if (tt === undefined) {
          if (!isOptional(ut)) out.push(...at(`field ${k} ${side === "result" ? "missing" : "now required"}`));
          continue;
        }
        out.push(...this.sub(tt, ut, side, [...path, `field ${k}`]));
      }
      return out;
    }
    if (t instanceof IDL.VariantClass && u instanceof IDL.VariantClass) {
      const accepts = new Map(u._fields);
      const out: string[] = [];
      for (const [k, tt] of t._fields) {
        const ut = accepts.get(k);
        if (ut === undefined) {
          out.push(...at(`tag ${k} ${side === "result" ? "not known to old clients" : "no longer accepted"}`));
          continue;
        }
        out.push(...this.sub(tt, ut, side, [...path, `tag ${k}`]));
      }
      return out;
    }
    if (t instanceof IDL.FuncClass && u instanceof IDL.FuncClass) {
      const breaks = this.func(t, u);
      return breaks.map((b) => [...path, b].join(": "));
    }
    if (t instanceof IDL.ServiceClass && u instanceof IDL.ServiceClass) {
      return serviceBreaks(t, u).map((b) => [...path, b].join(": "));
    }
    return at(`${show(t)} is not ${show(u)}`);
  }

  /** Breaks between a method's new (`n`) and old (`o`) signature. */
  func(n: IDL.FuncClass, o: IDL.FuncClass): string[] {
    const out: string[] = [];
    const ann = (f: IDL.FuncClass) => [...f.annotations].sort().join(",") || "none";
    if (ann(n) !== ann(o)) out.push(`annotations ${ann(o)} → ${ann(n)}`);
    n.argTypes.forEach((nt, i) => {
      const ot = o.argTypes[i];
      if (ot === undefined) {
        if (!isOptional(nt)) out.push(`argument ${i} added and not optional`);
      } else out.push(...this.sub(ot, nt, "argument", [`argument ${i}`]));
    });
    o.retTypes.forEach((ot, i) => {
      const nt = n.retTypes[i];
      if (nt === undefined) {
        if (!isOptional(ot)) out.push(`result ${i} removed`);
      } else out.push(...this.sub(nt, ot, "result", [`result ${i}`]));
    });
    return out;
  }
}

/** Every method of `older` that clients built against it could no longer call on `newer`, with why. */
export function serviceBreaks(newer: IDL.ServiceClass, older: IDL.ServiceClass): string[] {
  const now = new Map(newer._fields);
  const out: string[] = [];
  for (const [m, of] of older._fields) {
    const nf = now.get(m);
    if (!nf) {
      out.push(`${m}: removed`);
      continue;
    }
    for (const b of new Checker().func(nf, of)) out.push(`${m}: ${b}`);
  }
  return out;
}
