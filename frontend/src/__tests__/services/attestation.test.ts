/**
 * Signed records: the browser-side check of the report canister's Ed25519
 * signatures, and the signed-copy file format /verify-record reads.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  verifySignature, toSignedCopy, parseSignedCopy, checkSignedCopy, toHex, fromHex,
  type Attestation,
} from "@/services/attestation";

let att: Attestation;
let otherKey: Uint8Array;

async function keypair() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { kp, pub };
}

beforeAll(async () => {
  const { kp, pub } = await keypair();
  const message = JSON.stringify({ type: "homegentic.report", v: 1, score: 72, jobs: [{ serviceType: "HVAC", verified: true }] });
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, kp.privateKey, new TextEncoder().encode(message)));
  att = { message, signature, publicKey: pub, keyName: "test_key_1", signedAt: Date.now() };
  otherKey = (await keypair()).pub;
});

describe("verifySignature", () => {
  it("accepts the signer's signature", async () => {
    expect(await verifySignature(att.message, att.signature, att.publicKey)).toBe(true);
  });

  it("rejects a changed message", async () => {
    expect(await verifySignature(att.message.replace("72", "92"), att.signature, att.publicKey)).toBe(false);
  });

  it("rejects another key", async () => {
    expect(await verifySignature(att.message, att.signature, otherKey)).toBe(false);
  });

  it("rejects malformed input instead of throwing", async () => {
    expect(await verifySignature(att.message, new Uint8Array(10), att.publicKey)).toBe(false);
  });
});

describe("signed copies", () => {
  it("round-trips through the file format and checks out", async () => {
    const text = JSON.stringify(toSignedCopy(att));
    const res = await checkSignedCopy(parseSignedCopy(text), { keyName: "test_key_1", publicKey: att.publicKey });
    expect(res).toEqual({ status: "valid", publishedKey: true, statement: JSON.parse(att.message) });
  });

  it("flags a valid signature whose key isn't the published one", async () => {
    const res = await checkSignedCopy(toSignedCopy(att), { keyName: "key_1", publicKey: otherKey });
    expect(res.status).toBe("valid");
    expect(res.status === "valid" && res.publishedKey).toBe(false);
  });

  it("catches an edited statement", async () => {
    const copy = toSignedCopy(att);
    const res = await checkSignedCopy({ ...copy, message: copy.message.replace("72", "92") }, null);
    expect(res.status).toBe("invalid");
  });

  it("explains files that aren't signed copies", () => {
    expect(() => parseSignedCopy("not json")).toThrow(/valid JSON/);
    expect(() => parseSignedCopy(JSON.stringify({ hello: 1 }))).toThrow(/signed copy/);
  });

  it("hex helpers round-trip and reject junk", () => {
    expect(toHex(fromHex("00ff10"))).toBe("00ff10");
    expect(() => fromHex("zz")).toThrow();
  });
});
