/**
 * The Candid backward-compatibility check (candid-compat.upgrade.test.ts)
 * rests on `serviceBreaks(newer, older)`: it lists every way a client built
 * against `older` could fail against `newer`. These cases follow the Candid
 * spec's subtyping rules (https://github.com/dfinity/candid/blob/master/spec/Candid.md#upgrading-and-subtyping),
 * except that `opt` is checked strictly, because a client that gets `null`
 * for a field it relied on is broken even if decoding succeeds.
 *
 * Run: cd tests/upgrade && npx vitest run candid-subtype
 */

import { describe, it, expect } from "vitest";
import { IDL } from "@icp-sdk/core/candid";
import { parseCandid } from "./__helpers__/candid";
import { serviceBreaks } from "./__helpers__/candidSubtype";

const svc = (src: string) => parseCandid(src).idlFactory({ IDL });
const breaks = (newer: string, older: string) => serviceBreaks(svc(newer), svc(older));

describe("serviceBreaks", () => {
  it("an identical service has no breaks", () => {
    const s = "type R = record { id : text; n : nat }; service : { get : (text) -> (opt R) query; put : (R) -> () }";
    expect(breaks(s, s)).toEqual([]);
  });

  it("adding a method is fine, removing one is a break", () => {
    expect(breaks("service : { a : () -> (); b : () -> () }", "service : { a : () -> () }")).toEqual([]);
    expect(breaks("service : { a : () -> () }", "service : { a : () -> (); b : () -> () }")).toEqual(["b: removed"]);
  });

  it("changing query to update (or back) is a break", () => {
    expect(breaks("service : { a : () -> () }", "service : { a : () -> () query }")).toEqual([
      "a: annotations query → none",
    ]);
  });

  it("a result may gain record fields but not lose them", () => {
    const old = "service : { get : () -> (record { a : nat }) query }";
    expect(breaks("service : { get : () -> (record { a : nat; b : text }) query }", old)).toEqual([]);
    expect(breaks("service : { get : () -> (record { b : text }) query }", old)).toEqual([
      "get: result 0: field a missing",
    ]);
  });

  it("an argument may gain only optional fields", () => {
    const old = "service : { put : (record { a : nat }) -> () }";
    expect(breaks("service : { put : (record { a : nat; b : opt text }) -> () }", old)).toEqual([]);
    expect(breaks("service : { put : (record { a : nat; b : text }) -> () }", old)).toEqual([
      "put: argument 0: field b now required",
    ]);
  });

  it("a method may take extra trailing optional arguments, not required ones", () => {
    const old = "service : { put : (text) -> () }";
    expect(breaks("service : { put : (text, opt nat) -> () }", old)).toEqual([]);
    expect(breaks("service : { put : (text, nat) -> () }", old)).toEqual(["put: argument 1 added and not optional"]);
  });

  it("a result variant may not gain tags, an argument variant may", () => {
    const res = (tags: string) => `service : { get : () -> (variant { ${tags} }) query }`;
    expect(breaks(res("ok : nat"), res("ok : nat; err : text"))).toEqual([]);
    expect(breaks(res("ok : nat; err : text; extra"), res("ok : nat; err : text"))).toEqual([
      "get: result 0: tag extra not known to old clients",
    ]);
    const arg = (tags: string) => `service : { put : (variant { ${tags} }) -> () }`;
    expect(breaks(arg("A; B; C"), arg("A; B"))).toEqual([]);
    expect(breaks(arg("A"), arg("A; B"))).toEqual(["put: argument 0: tag B no longer accepted"]);
  });

  it("nat widens to int in a result only the other way round", () => {
    expect(breaks("service : { f : () -> (nat) }", "service : { f : () -> (int) }")).toEqual([]);
    expect(breaks("service : { f : () -> (int) }", "service : { f : () -> (nat) }")).toEqual([
      "f: result 0: int is not nat",
    ]);
    expect(breaks("service : { f : (int) -> () }", "service : { f : (nat) -> () }")).toEqual([]);
  });

  it("opt is strict: a required result field can't become optional", () => {
    expect(
      breaks("service : { f : () -> (record { a : opt nat }) }", "service : { f : () -> (record { a : nat }) }"),
    ).toEqual(["f: result 0: field a: opt nat is not nat"]);
    expect(
      breaks("service : { f : () -> (record { a : nat }) }", "service : { f : () -> (record { a : opt nat }) }"),
    ).toEqual([]);
  });

  it("follows recursive types without looping", () => {
    const s = "type T = record { kids : vec T; name : text }; service : { tree : () -> (T) query }";
    expect(breaks(s, s)).toEqual([]);
    const lost = "type T = record { kids : vec T }; service : { tree : () -> (T) query }";
    expect(breaks(lost, s)).toEqual(["tree: result 0: field name missing"]);
  });

  it("names nested paths", () => {
    const old = "service : { f : () -> (vec record { inner : variant { a; b } }) }";
    const neu = "service : { f : () -> (vec record { inner : variant { a; b; c } }) }";
    expect(breaks(neu, old)).toEqual(["f: result 0: [ ]: field inner: tag c not known to old clients"]);
  });
});
