/**
 * paymentCanister.ts — canister ID resolution
 *
 * CANISTER_ID.1  reads CANISTER_ID_PAYMENT at call time, so a value set after
 *                import (as the Cloudflare Worker does per request) is used
 * CANISTER_ID.2  throws a clear error when CANISTER_ID_PAYMENT is unset,
 *                rather than falling back to a hard-coded canister
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import crypto from "node:crypto";

const mockCreateActor = jest.fn((_idl: unknown, opts: { canisterId: string }) => ({
  consumeAgentCredit: jest.fn(async () => ({ ok: BigInt(1) })),
  _canisterId: opts.canisterId,
}));

jest.mock("@icp-sdk/core/agent", () => {
  const actual = jest.requireActual("@icp-sdk/core/agent") as Record<string, unknown>;
  return { ...actual, Actor: { createActor: (...args: unknown[]) => (mockCreateActor as any)(...args) } };
});

// Imported after the mock so the module picks it up.
import { consumeAgentCredit } from "../paymentCanister";

const PEM = crypto.generateKeyPairSync("ed25519").privateKey
  .export({ format: "pem", type: "pkcs8" }).toString();

describe("CANISTER_ID — payment canister ID resolution", () => {
  beforeEach(() => {
    mockCreateActor.mockClear();
    process.env.DFX_IDENTITY_PEM = PEM;
    delete process.env.CANISTER_ID_PAYMENT;
  });

  it("CANISTER_ID.1 uses CANISTER_ID_PAYMENT set after the module was imported", async () => {
    process.env.CANISTER_ID_PAYMENT = "hnx5s-iyaaa-aaaaj-qsgqa-cai";
    await consumeAgentCredit("aaaaa-aa");
    expect(mockCreateActor).toHaveBeenCalledTimes(1);
    expect((mockCreateActor.mock.calls[0][1] as { canisterId: string }).canisterId)
      .toBe("hnx5s-iyaaa-aaaaj-qsgqa-cai");
  });

  it("CANISTER_ID.2 throws when CANISTER_ID_PAYMENT is unset", async () => {
    await expect(consumeAgentCredit("aaaaa-aa")).rejects.toThrow("CANISTER_ID_PAYMENT is not set");
    expect(mockCreateActor).not.toHaveBeenCalled();
  });
});
