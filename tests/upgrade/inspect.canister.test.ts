/**
 * Ingress size caps in `system func inspect` (cycle-drain audit CD-5,
 * 2026-10-31). The ingress fee is charged once a message is accepted, so
 * oversized junk is refused there: 64 KiB for ordinary methods, 2 MiB for
 * photo.uploadPhoto and report.generateReport. Anonymous callers are refused
 * everywhere except report.getReport (shared links open signed out).
 *
 * Run: cd tests/upgrade && npx vitest run inspect.canister.test.ts
 * (needs .dfx/local/canisters/{auth,photo,report}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { AnonymousIdentity } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { createPic, wasmPath } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { idlFactory as authIdl } from "../../packages/shared/src/declarations/auth";
import { idlFactory as photoIdl } from "../../packages/shared/src/declarations/photo";
import { idlFactory as reportIdl } from "../../packages/shared/src/declarations/report";

const KIB = 1024;
const refused = /inspect|reject|IC0516|rejected the message|canister_inspect_message/i;

describe("inspect: argument size caps", () => {
  let pic: PocketIc;
  let auth: any;
  let photo: any;
  let report: any;
  const user = createIdentity("insp-user");
  const admin = createIdentity("insp-admin");

  beforeAll(async () => {
    pic = await createPic();
    const setup = async (name: string, idlFactory: any) => {
      const { initArgs } = serviceFromWasm(wasmPath(name));
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      const f = await pic.setupCanister({ idlFactory, wasm: wasmPath(name), arg });
      f.actor.setIdentity(user);
      return f.actor;
    };
    auth = await setup("auth", authIdl);
    photo = await setup("photo", photoIdl);
    report = await setup("report", reportIdl);
  }, 120_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("accepts ordinary calls", async () => {
    const r = await auth.register({ role: { Homeowner: null }, email: "a@example.com", phone: "" });
    expect(r).toHaveProperty("ok");
  });

  it("refuses an ordinary method's argument over 64 KiB", async () => {
    await expect(auth.updateProfile({ email: "x".repeat(70 * KIB), phone: "" })).rejects.toThrow(refused);
    await expect(report.revokeShareLink("t".repeat(70 * KIB))).rejects.toThrow(refused);
    await expect(photo.deletePhoto("p".repeat(70 * KIB))).rejects.toThrow(refused);
  });

  it("still lets a method just under the cap through to its own checks", async () => {
    const r = await report.revokeShareLink("t".repeat(60 * KIB));
    expect(r).toHaveProperty("err");
  });

  // A shared report link is opened by buyers who aren't signed in, and
  // getReport is an update call (it counts the view), so inspect must let an
  // anonymous caller reach it. The method itself refuses sign-in-only links.
  it("lets a signed-out viewer open a report link, and nothing else", async () => {
    report.setIdentity(new AnonymousIdentity());
    try {
      expect(await report.getReport("RPT_missing")).toEqual({ err: { NotFound: null } });
      await expect(report.getReport("t".repeat(4 * KIB))).rejects.toThrow(refused);
      await expect(report.revokeShareLink("RPT_missing")).rejects.toThrow(refused);
      await expect(report.listShareLinks("PROP_1")).rejects.toThrow(refused);
    } finally {
      report.setIdentity(user);
    }
  });

  it("lets photo uploads carry up to 2 MiB", async () => {
    const bytes = new Uint8Array(1_200 * KIB).fill(7);
    // Reaches the method (which stops because this lone photo canister isn't
    // wired to property), so inspect let the 1.2 MB argument through.
    const r = await photo.uploadPhoto("JOB_1", "PROP_1", { Finishing: null }, "", "a".repeat(64), bytes);
    expect(JSON.stringify(r)).toMatch(/Photo access checks are unavailable/);
  });
});
