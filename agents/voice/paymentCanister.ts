import { HttpAgent, Actor } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import crypto from "node:crypto";

// Testnet ID is the fallback; override with CANISTER_ID_PAYMENT in Railway env vars.
const PAYMENT_CANISTER_ID =
  process.env.CANISTER_ID_PAYMENT ?? "a3shm-xiaaa-aaaaj-a6moa-cai";

const PRINCIPAL_RE = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;

export const VALID_TIERS = new Set([
  "Free", "Basic", "Pro", "Premium",
  "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro",
]);

// ── Identity ──────────────────────────────────────────────────────────────────
// Parse DFX_IDENTITY_PEM (Ed25519 SEC1 or PKCS8) into an @dfinity/identity.
// The principal of this identity must be registered as admin in the payment
// canister (done during deploy bootstrap in scripts/deploy.sh).
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
  return Ed25519KeyIdentity.fromSecretKey(seedBuffer as ArrayBuffer);
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
    Free: IDL.Null, Basic: IDL.Null, Pro: IDL.Null, Premium: IDL.Null,
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
};

async function getActor(): Promise<PaymentActor> {
  return Actor.createActor(idlFactory, {
    agent:      await getAgent(),
    canisterId: PAYMENT_CANISTER_ID,
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
