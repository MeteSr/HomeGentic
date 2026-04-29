/**
 * paymentCanister.ts — local replica integration tests (#217)
 *
 * Exercises all three canister call paths against a running dfx local replica.
 * Skipped automatically unless DFX_NETWORK=local and DFX_IDENTITY_PEM are set,
 * so CI and local dev without a replica stay green.
 *
 * Prerequisites (run once before this suite):
 *   dfx start --clean --background
 *   bash scripts/deploy.sh          # deploys payment canister, wires admin
 *   # The deploy identity is automatically admin — no extra seeding needed.
 *
 * Run:
 *   DFX_NETWORK=local DFX_IDENTITY_PEM="$(dfx identity export default)" \
 *     CANISTER_ID_PAYMENT="$(dfx canister id payment)" \
 *     cd agents/voice && npm test -- paymentCanister.integration
 *
 * INTEG.1  activateInCanister — activates a Basic subscription for a test principal
 * INTEG.2  grantAgentCredits  — grants credits to a test principal
 * INTEG.3  consumeAgentCredit — consumes a credit granted in INTEG.2
 */

import "dotenv/config";
import { describe, it, expect, beforeAll } from "@jest/globals";

const configured =
  process.env.DFX_NETWORK === "local" &&
  !!process.env.DFX_IDENTITY_PEM &&
  !!process.env.CANISTER_ID_PAYMENT;

const describeIfConfigured = configured ? describe : describe.skip;

// Use a stable test principal derived from the default dfx identity's textual form.
// Any valid lowercase principal works — it doesn't need a wallet or cycles.
const TEST_PRINCIPAL = process.env.TEST_PRINCIPAL ?? "aaaaa-aa";

// Re-import after env is set so the module picks up the correct IC_HOST.
let activateInCanister: (p: string, t: string, m: number) => Promise<void>;
let grantAgentCredits:  (p: string, a: number)            => Promise<void>;
let consumeAgentCredit: (p: string)                        => Promise<void>;

beforeAll(async () => {
  if (!configured) return;
  const mod = await import("../paymentCanister");
  activateInCanister = mod.activateInCanister;
  grantAgentCredits  = mod.grantAgentCredits;
  consumeAgentCredit = mod.consumeAgentCredit;
});

describeIfConfigured("INTEG.1 — activateInCanister against local replica", () => {
  it("activates a Basic subscription without throwing", async () => {
    await expect(
      activateInCanister(TEST_PRINCIPAL, "Basic", 1),
    ).resolves.toBeUndefined();
  });
});

describeIfConfigured("INTEG.2 — grantAgentCredits against local replica", () => {
  it("grants 5 credits without throwing", async () => {
    await expect(
      grantAgentCredits(TEST_PRINCIPAL, 5),
    ).resolves.toBeUndefined();
  });
});

describeIfConfigured("INTEG.3 — consumeAgentCredit against local replica", () => {
  it("consumes a credit after grant without throwing", async () => {
    // Grant first so there is a credit to consume.
    await grantAgentCredits(TEST_PRINCIPAL, 1);
    await expect(
      consumeAgentCredit(TEST_PRINCIPAL),
    ).resolves.toBeUndefined();
  });
});
