/**
 * X-1 (security review 2026-11-11): the photo migration and orphan sweep
 * run under their own identity, PHOTO_CRON_IDENTITY_PEM, which the photo
 * canister grants with addCronRelay. They never fall back to the request-path
 * key (DFX_IDENTITY_PEM), so a leak of that key can't erase or drop photos.
 *
 * PCRON.1 without PHOTO_CRON_IDENTITY_PEM every cron call fails before any
 *         network call, even when DFX_IDENTITY_PEM is set
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import { photoMigrationCanister, photoSweepCanister } from "../photoCanister";

const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const saved = { ...process.env };

describe("photo cron identity", () => {
  beforeEach(() => {
    process.env.DFX_IDENTITY_PEM = pem;
    process.env.CANISTER_ID_PHOTO = "aaaaa-aa";
    process.env.IC_HOST = "http://127.0.0.1:9";
    delete process.env.PHOTO_CRON_IDENTITY_PEM;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("PCRON.1 refuses to run cron calls under the request-path key", async () => {
    const calls = [
      () => photoMigrationCanister.page(null),
      () => photoMigrationCanister.confirm([["p", "h"]]),
      () => photoSweepCanister.known(["p"]),
      () => photoSweepCanister.offChainPage(null),
      () => photoSweepCanister.dropUnuploaded(["p"]),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toThrow(/PHOTO_CRON_IDENTITY_PEM/);
    }
  });
});
