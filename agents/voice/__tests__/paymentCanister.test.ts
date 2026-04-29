/**
 * paymentCanister.ts — validation unit tests (#213, #217)
 *
 * CANISTER.1  activateInCanister — rejects unknown tier
 * CANISTER.2  activateInCanister — rejects malformed principal
 * CANISTER.3  consumeAgentCredit — rejects malformed principal
 * CANISTER.4  grantAgentCredits  — rejects malformed principal
 * CANISTER.5  grantAgentCredits  — rejects non-integer amount
 * CANISTER.6  grantAgentCredits  — rejects zero or negative amount
 * CANISTER.7  VALID_TIERS        — contains all expected tier names
 * CANISTER.8  identityFromPem    — parses a valid Ed25519 PEM deterministically
 * CANISTER.9  identityFromPem    — rejects a non-Ed25519 PEM with a clear error
 * CANISTER.10 identityFromPem    — same PEM always produces the same principal
 *
 * CANISTER.1–7: guard clauses throw before any network call — no mock needed.
 * CANISTER.8–10: pure Node crypto + @dfinity/identity, no IC connection needed.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import crypto from "node:crypto";
import { activateInCanister, consumeAgentCredit, grantAgentCredits, VALID_TIERS, identityFromPem } from "../paymentCanister";

// ── CANISTER.7 — VALID_TIERS ──────────────────────────────────────────────────

describe("CANISTER.7 — VALID_TIERS", () => {
  const expected = ["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro"];

  it("contains all 8 expected tier names", () => {
    for (const t of expected) {
      expect(VALID_TIERS.has(t)).toBe(true);
    }
  });

  it("does not contain invented tier names", () => {
    expect(VALID_TIERS.has("Enterprise")).toBe(false);
    expect(VALID_TIERS.has("Gold")).toBe(false);
  });
});

// ── CANISTER.1 — activateInCanister rejects unknown tier ─────────────────────

describe("CANISTER.1 — activateInCanister rejects unknown tier", () => {
  it("throws on an unrecognised tier name", async () => {
    await expect(activateInCanister("aaaaa-aa", "Gold", 1)).rejects.toThrow("Invalid tier");
  });

  it("error message includes the bad tier name", async () => {
    await expect(activateInCanister("aaaaa-aa", "SuperPremium", 1)).rejects.toThrow("SuperPremium");
  });
});

// ── CANISTER.2 — activateInCanister rejects malformed principal ───────────────

describe("CANISTER.2 — activateInCanister rejects malformed principal", () => {
  it("throws on an empty string", async () => {
    await expect(activateInCanister("", "Basic", 1)).rejects.toThrow("Invalid principal");
  });

  it("throws on a principal containing uppercase letters", async () => {
    await expect(activateInCanister("AAAAA-BB", "Pro", 1)).rejects.toThrow("Invalid principal");
  });
});

// ── CANISTER.3 — consumeAgentCredit rejects malformed principal ───────────────

describe("CANISTER.3 — consumeAgentCredit rejects malformed principal", () => {
  it("throws on an empty string", async () => {
    await expect(consumeAgentCredit("")).rejects.toThrow("Invalid principal");
  });

  it("throws on a principal with spaces", async () => {
    await expect(consumeAgentCredit("aaaa bbbb")).rejects.toThrow("Invalid principal");
  });
});

// ── CANISTER.4 — grantAgentCredits rejects malformed principal ────────────────

describe("CANISTER.4 — grantAgentCredits rejects malformed principal", () => {
  it("throws on an empty string", async () => {
    await expect(grantAgentCredits("", 10)).rejects.toThrow("Invalid principal");
  });
});

// ── CANISTER.5 — grantAgentCredits rejects non-integer amount ────────────────

describe("CANISTER.5 — grantAgentCredits rejects non-integer amount", () => {
  it("throws on a fractional amount", async () => {
    await expect(grantAgentCredits("aaaaa-aa", 1.5)).rejects.toThrow("Invalid credit amount");
  });

  it("throws on NaN", async () => {
    await expect(grantAgentCredits("aaaaa-aa", NaN)).rejects.toThrow("Invalid credit amount");
  });
});

// ── CANISTER.6 — grantAgentCredits rejects zero or negative amount ────────────

describe("CANISTER.6 — grantAgentCredits rejects zero or negative amount", () => {
  it("throws on 0", async () => {
    await expect(grantAgentCredits("aaaaa-aa", 0)).rejects.toThrow("Invalid credit amount");
  });

  it("throws on a negative integer", async () => {
    await expect(grantAgentCredits("aaaaa-aa", -5)).rejects.toThrow("Invalid credit amount");
  });
});

// ── CANISTER.8 — identityFromPem parses a valid Ed25519 PEM ──────────────────

describe("CANISTER.8 — identityFromPem parses a valid Ed25519 PKCS8 PEM", () => {
  it("returns an identity without throwing", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => identityFromPem(pem)).not.toThrow();
  });

  it("returns an object with a getPrincipal method", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const identity = identityFromPem(pem);
    expect(typeof identity.getPrincipal).toBe("function");
  });
});

// ── CANISTER.9 — identityFromPem rejects non-Ed25519 keys ────────────────────

describe("CANISTER.9 — identityFromPem rejects non-Ed25519 PEM", () => {
  it("throws a clear error for an RSA key", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => identityFromPem(pem)).toThrow("DFX_IDENTITY_PEM must be an Ed25519 key");
  });

  it("error message includes the actual curve name for debugging", () => {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => identityFromPem(pem)).toThrow(/crv=P-256/);
  });
});

// ── CANISTER.10 — identityFromPem is deterministic ───────────────────────────

describe("CANISTER.10 — identityFromPem is deterministic", () => {
  it("produces the same principal for the same PEM", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const id1 = identityFromPem(pem);
    const id2 = identityFromPem(pem);
    expect(id1.getPrincipal().toText()).toBe(id2.getPrincipal().toText());
  });

  it("produces different principals for different keys", () => {
    const pem1 = (crypto.generateKeyPairSync("ed25519").privateKey).export({ type: "pkcs8", format: "pem" }) as string;
    const pem2 = (crypto.generateKeyPairSync("ed25519").privateKey).export({ type: "pkcs8", format: "pem" }) as string;
    const p1 = identityFromPem(pem1).getPrincipal().toText();
    const p2 = identityFromPem(pem2).getPrincipal().toText();
    expect(p1).not.toBe(p2);
  });
});
