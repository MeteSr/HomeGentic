/**
 * The Bid to List platform fee, paid by the winning agent.
 *
 * When the seller chooses a bid, the listing canister records the fee as Owed
 * in the fee canister and keeps both sides' details masked. The agent pays it
 * here, through the app's own Stripe account (STRIPE_SECRET_KEY, the
 * /api/stripe/webhook endpoint). The settled payment is reported with
 * fee.relayMarkPlatformFeePaid, and the fee canister then has the listing
 * canister release the seller's address and email (and the agent's details to
 * the seller).
 *
 * The Worker's identity must be registered with fee.addReferralRelay (deploy.sh
 * does this for VOICE_WORKER_PRINCIPAL).
 */
import { Actor } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";
import { idlFactory as feeIdl } from "../../../packages/shared/src/declarations/fee";
import { idlFactory as listingIdl } from "../../../packages/shared/src/declarations/listing";
import { getAgent } from "../paymentCanister";

export interface PlatformFee {
  id: string;
  requestId: string;
  proposalId: string;
  agentId: string;
  amountCents: number;
  status: string;
}

export interface PlatformFeeLedger {
  /** The fee for the bid the seller chose, or null when there is none for this bid. */
  feeFor(proposalId: string): Promise<PlatformFee | null>;
  /** Whether the listing request is still open (not awarded, cancelled or expired). */
  requestOpen(requestId: string): Promise<boolean>;
  /** Report the settled payment. retry: false means it can't be applied and needs a refund. */
  markPaid(feeId: string, proposalId: string): Promise<{ ok: true } | { err: string; retry: boolean }>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** POST /api/payments/platform-fee — Checkout for the agent whose bid the seller chose. */
export async function startPlatformFeeCheckout(
  principal: string,
  proposalId: string,
  origin: string,
  stripe: any,
  ledger: PlatformFeeLedger,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!ID_RE.test(proposalId)) return { status: 400, body: { error: "proposalId is required" } };
  const fee = await ledger.feeFor(proposalId);
  // Someone else's fee is reported as not found, so nothing about it leaks.
  if (!fee || fee.agentId !== principal) return { status: 404, body: { error: "No platform fee for this bid" } };
  if (fee.status !== "Owed" && fee.status !== "Invoiced") return { status: 409, body: { error: "This fee is already settled" } };
  if (!(await ledger.requestOpen(fee.requestId))) return { status: 409, body: { error: "The listing request is no longer open" } };
  const back = `${origin}/agents/bids/${encodeURIComponent(proposalId)}`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: { currency: "usd", unit_amount: fee.amountCents, product_data: { name: "HomeGentic Bid to List platform fee" } },
    }],
    metadata: { type: "platform_fee", feeId: fee.id, proposalId, requestId: fee.requestId, agentId: fee.agentId },
    success_url: `${back}?fee_paid=1`,
    cancel_url: `${back}?fee_cancelled=1`,
  });
  return { status: 200, body: { url: session.url } };
}

/**
 * checkout.session.completed / async_payment_succeeded. Returns false for a
 * session that isn't a platform fee. Throws (so Stripe retries) when the
 * canisters can't be reached.
 */
export async function settlePlatformFee(session: any, ledger: PlatformFeeLedger): Promise<boolean> {
  if (session?.metadata?.type !== "platform_fee") return false;
  // A delayed method's "completed" arrives before the money; async_payment_succeeded follows.
  if (session.payment_status !== "paid") return true;
  const feeId = String(session.metadata.feeId ?? "");
  const proposalId = String(session.metadata.proposalId ?? "");
  const r = await ledger.markPaid(feeId, proposalId);
  if ("err" in r) {
    if (r.retry) throw new Error(`platform fee ${feeId}: ${r.err}`);
    console.error(`[platform-fee] Payment for fee ${feeId} (bid ${proposalId}) can't be applied, refund it in Stripe: ${r.err}`);
  }
  return true;
}

/** The fee and listing canisters through the Worker's identity. */
export function canisterPlatformFeeLedger(): PlatformFeeLedger {
  const actor = async (factory: any, name: string) => {
    const canisterId = process.env[`CANISTER_ID_${name}`];
    if (!canisterId) throw new Error(`CANISTER_ID_${name} is not set`);
    return Actor.createActor(factory, { agent: await getAgent(), canisterId }) as any;
  };
  return {
    async feeFor(proposalId) {
      const [f] = (await (await actor(feeIdl, "FEE")).relayGetPlatformFee(proposalId)) as any[];
      if (!f) return null;
      return {
        id: f.id, requestId: f.requestId, proposalId: f.proposalId,
        agentId: (f.agentId as Principal).toText(), amountCents: Number(f.amountCents),
        status: Object.keys(f.status)[0] ?? "",
      };
    },
    async requestOpen(requestId) {
      const r = await (await actor(listingIdl, "LISTING")).getBidRequest(requestId);
      return "ok" in r && "Open" in r.ok.status;
    },
    async markPaid(feeId, proposalId) {
      const r = await (await actor(feeIdl, "FEE")).relayMarkPlatformFeePaid(feeId, proposalId);
      if ("ok" in r) return { ok: true };
      const tag = Object.keys(r.err)[0] ?? "error";
      const detail = typeof r.err[tag] === "string" ? `: ${r.err[tag]}` : "";
      // InvalidInput: the seller moved to another bid, or the fee was waived.
      return { err: `${tag}${detail}`, retry: tag !== "InvalidInput" };
    },
  };
}
