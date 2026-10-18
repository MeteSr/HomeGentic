import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import crypto from "node:crypto";

// Read at call time, not module load: the Cloudflare Worker copies its env
// bindings into process.env per request, after this module is imported, so a
// module-level read always saw it unset. No fallback ID — a missing ID should
// fail loudly, not quietly target some other environment's canister.
function paymentCanisterId(): string {
  const id = process.env.CANISTER_ID_PAYMENT;
  if (!id) throw new Error("CANISTER_ID_PAYMENT is not set — cannot call the payment canister");
  return id;
}

export const PRINCIPAL_RE = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;

export const VALID_TIERS = new Set([
  "Free", "Pro",
  "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro",
]);

// ── Identity ──────────────────────────────────────────────────────────────────
// Parse DFX_IDENTITY_PEM (Ed25519 SEC1 or PKCS8) into an @icp-sdk/core/identity.
// The principal of this identity must be registered in the payment canister —
// preferably as a Stripe relay (payment.addStripeRelay), which may only call
// stripeActivateSubscription / stripeGrantAgentCredits / consumeAgentCredit and
// free-tier downgrades, rather than as a full admin (F-9).
export function identityFromPem(pem: string): Ed25519KeyIdentity {
  const keyObj = crypto.createPrivateKey({ key: pem, format: "pem" });
  const jwk = keyObj.export({ format: "jwk" }) as { crv?: string; d?: string };
  if (jwk.crv !== "Ed25519" || !jwk.d) {
    throw new Error(
      `DFX_IDENTITY_PEM must be an Ed25519 key (got crv=${jwk.crv ?? "unknown"})`,
    );
  }
  const seed = Buffer.from(jwk.d, "base64url");
  // Use slice to get an owned ArrayBuffer — seed.buffer may point to Node's
  // shared pool (up to 8 KiB), which @noble/curves rejects as too large.
  const seedBuffer = seed.buffer.slice(seed.byteOffset, seed.byteOffset + seed.byteLength);
  return Ed25519KeyIdentity.fromSecretKey(new Uint8Array(seedBuffer));
}

// ── Agent (lazy singleton) ────────────────────────────────────────────────────
// Route to local dfx replica when DFX_NETWORK=local; otherwise IC mainnet.
const IC_HOST = process.env.DFX_NETWORK === "local"
  ? "http://localhost:4943"
  : "https://ic0.app";

let _agentPromise: Promise<HttpAgent> | undefined;

async function getAgent(): Promise<HttpAgent> {
  if (_agentPromise) return _agentPromise;
  const pem = process.env.DFX_IDENTITY_PEM;
  if (!pem) {
    throw new Error(
      "DFX_IDENTITY_PEM is not set — cannot make authenticated canister calls",
    );
  }
  _agentPromise = (async () => {
    const agent = new HttpAgent({ host: IC_HOST, identity: identityFromPem(pem) });
    // Local replica uses a self-signed root key; mainnet has a hardcoded one.
    if (process.env.DFX_NETWORK === "local") {
      await agent.fetchRootKey();
    }
    return agent;
  })();
  return _agentPromise;
}

// ── Minimal IDL for the three admin methods ───────────────────────────────────
const idlFactory = ({ IDL }: { IDL: any }) => {
  const Tier = IDL.Variant({
    Free: IDL.Null, Pro: IDL.Null,
    ContractorFree: IDL.Null, ContractorPro: IDL.Null,
    RealtorFree: IDL.Null, RealtorPro: IDL.Null,
  });
  const Err = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null,
    PaymentFailed: IDL.Text, RateLimited: IDL.Null, InvalidInput: IDL.Text,
  });
  const Sub = IDL.Record({
    owner: IDL.Principal, tier: Tier,
    expiresAt: IDL.Int, createdAt: IDL.Int, cancelledAt: IDL.Opt(IDL.Int),
  });
  return IDL.Service({
    adminActivateStripeSubscription: IDL.Func(
      [IDL.Principal, Tier, IDL.Nat],
      [IDL.Variant({ ok: Sub, err: Err })],
      [],
    ),
    consumeAgentCredit: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Nat, err: Err })],
      [],
    ),
    adminGrantAgentCredits: IDL.Func(
      [IDL.Principal, IDL.Nat],
      [IDL.Variant({ ok: IDL.Nat, err: Err })],
      [],
    ),
    stripeActivateSubscription: IDL.Func(
      [IDL.Principal, Tier, IDL.Int, IDL.Text],
      [IDL.Variant({ ok: Sub, err: Err })],
      [],
    ),
    stripeGrantAgentCredits: IDL.Func(
      [IDL.Principal, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Nat, err: Err })],
      [],
    ),
    stripeRecordGift: IDL.Func(
      [IDL.Text, Tier, IDL.Variant({ Monthly: IDL.Null, Yearly: IDL.Null }), IDL.Record({
        recipientEmail: IDL.Text, recipientName: IDL.Text, senderName: IDL.Text,
        giftMessage: IDL.Text, deliveryDate: IDL.Text,
      })],
      [IDL.Variant({ ok: IDL.Null, err: Err })],
      [],
    ),
    getTierForPrincipal: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ Free: IDL.Null, Pro: IDL.Null, ContractorFree: IDL.Null, ContractorPro: IDL.Null, RealtorFree: IDL.Null, RealtorPro: IDL.Null })],
      ["query"],
    ),
  });
};

type PaymentActor = {
  adminActivateStripeSubscription(
    user: Principal,
    tier: Record<string, null>,
    months: bigint,
  ): Promise<{ ok: unknown } | { err: unknown }>;
  consumeAgentCredit(
    user: Principal,
  ): Promise<{ ok: bigint } | { err: unknown }>;
  adminGrantAgentCredits(
    user: Principal,
    amount: bigint,
  ): Promise<{ ok: bigint } | { err: unknown }>;
  stripeActivateSubscription(
    user: Principal,
    tier: Record<string, null>,
    expiresAtNs: bigint,
    stripeRef: string,
  ): Promise<{ ok: unknown } | { err: unknown }>;
  stripeGrantAgentCredits(
    user: Principal,
    amount: bigint,
    stripeRef: string,
  ): Promise<{ ok: bigint } | { err: unknown }>;
  getTierForPrincipal(user: Principal): Promise<Record<string, null>>;
  stripeRecordGift(
    giftToken: string,
    tier: Record<string, null>,
    billing: Record<string, null>,
    meta: GiftMetaArg,
  ): Promise<{ ok: null } | { err: unknown }>;
};

export type GiftMetaArg = {
  recipientEmail: string; recipientName: string; senderName: string;
  giftMessage: string; deliveryDate: string;
};

async function getActor(): Promise<PaymentActor> {
  const canisterId = paymentCanisterId();
  return Actor.createActor(idlFactory, {
    agent: await getAgent(),
    canisterId,
  }) as unknown as PaymentActor;
}

// ── Public helpers (replace dfx shell-outs in server.ts) ─────────────────────

export async function activateInCanister(
  principal: string,
  tier: string,
  months: number,
): Promise<void> {
  if (!VALID_TIERS.has(tier)) throw new Error(`Invalid tier: ${tier}`);
  if (!PRINCIPAL_RE.test(principal)) throw new Error("Invalid principal format");
  const result = await (await getActor()).adminActivateStripeSubscription(
    Principal.fromText(principal),
    { [tier]: null },
    BigInt(months),
  );
  if ("err" in result)
    throw new Error(`Canister activation failed: ${JSON.stringify(result.err)}`);
}

export async function consumeAgentCredit(principal: string): Promise<void> {
  if (!PRINCIPAL_RE.test(principal)) throw new Error("Invalid principal format");
  const result = await (await getActor()).consumeAgentCredit(Principal.fromText(principal));
  if ("err" in result) throw new Error("No agent credits available");
}

export async function grantAgentCredits(
  principal: string,
  amount: number,
): Promise<void> {
  if (!PRINCIPAL_RE.test(principal)) throw new Error("Invalid principal format");
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error("Invalid credit amount");
  const result = await (await getActor()).adminGrantAgentCredits(
    Principal.fromText(principal),
    BigInt(amount),
  );
  if ("err" in result)
    throw new Error(`Credit grant failed: ${JSON.stringify(result.err)}`);
}

/** Paid tiers a Stripe subscription can activate. */
export const PAID_TIERS = new Set(["Pro", "ContractorPro"]);

/**
 * Activate a Stripe-paid subscription until Stripe's period end. Idempotent
 * per `stripeRef` in the canister (P-2): replaying the same reference changes
 * nothing, and the expiry always comes from Stripe, never "now + N months".
 */
export async function activateSubscriptionUntil(
  principal: string,
  tier: string,
  periodEndSeconds: number,
  stripeRef: string,
): Promise<void> {
  if (!PAID_TIERS.has(tier)) throw new Error(`Invalid tier: ${tier}`);
  if (!PRINCIPAL_RE.test(principal)) throw new Error("Invalid principal format");
  if (!Number.isInteger(periodEndSeconds) || periodEndSeconds <= 0) throw new Error("Invalid period end");
  const result = await (await getActor()).stripeActivateSubscription(
    Principal.fromText(principal),
    { [tier]: null },
    BigInt(periodEndSeconds) * 1_000_000_000n,
    stripeRef,
  );
  if ("err" in result) throw new Error("Canister activation failed");
}

/**
 * Register a paid gift checkout in the payment canister so the recipient can
 * redeem it on-chain with redeemGift(giftToken). Idempotent in the canister
 * (an existing gift is never overwritten). Stripe relay only.
 */
export async function recordGift(
  giftToken: string,
  tier: string,
  billing: string,
  meta: GiftMetaArg,
): Promise<void> {
  if (!PAID_TIERS.has(tier)) throw new Error(`Invalid tier: ${tier}`);
  const b = billing === "Yearly" ? "Yearly" : "Monthly";
  const result = await (await getActor()).stripeRecordGift(giftToken, { [tier]: null }, { [b]: null }, meta);
  if ("err" in result) throw new Error("Gift registration failed");
}

/** Thrown when a Stripe reference has already produced a grant. */
export class AlreadyConsumedError extends Error {
  constructor() { super("already_consumed"); this.name = "AlreadyConsumedError"; }
}

/**
 * Grant a credit pack once per Stripe reference (F-2). Throws
 * AlreadyConsumedError on a replay.
 */
export async function grantAgentCreditsOnce(
  principal: string,
  amount: number,
  stripeRef: string,
): Promise<void> {
  if (!PRINCIPAL_RE.test(principal)) throw new Error("Invalid principal format");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid credit amount");
  const result = await (await getActor()).stripeGrantAgentCredits(
    Principal.fromText(principal),
    BigInt(amount),
    stripeRef,
  );
  if ("err" in result) {
    const err = result.err as Record<string, unknown>;
    if (err && (err as any).InvalidInput === "already_consumed") throw new AlreadyConsumedError();
    throw new Error("Credit grant failed");
  }
}

/**
 * The caller's effective tier, read from the payment canister. Throws if the
 * canister can't be reached, so callers can tell "Free" from "unknown" (e.g.
 * to avoid caching a transient failure as Free).
 */
export async function fetchSubscriptionTier(principal: string): Promise<string> {
  if (!PRINCIPAL_RE.test(principal)) return "Free";
  const result = await (await getActor()).getTierForPrincipal(Principal.fromText(principal));
  const tier = Object.keys(result)[0];
  return VALID_TIERS.has(tier) ? tier : "Free";
}

export async function getSubscriptionTier(principal: string): Promise<string> {
  try {
    return await fetchSubscriptionTier(principal);
  } catch {
    return "Free"; // fail-safe: downgrade to Free on canister error
  }
}
