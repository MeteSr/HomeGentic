/**
 * Contractor Free referral fee: 3% of a winning bid, $20 minimum.
 *
 * The fee canister keeps the ledger (bids, acceptances, verified jobs, the
 * 60-day fallback). This module is the Stripe side:
 *   - startCardSetup: Stripe Checkout in setup mode, so a contractor saves a
 *     card (and agrees to the fee terms) before their first bid.
 *   - saveCardFromSession: the webhook stores that card on the fee canister.
 *   - chargeDueFees: the hourly cron charges each Due fee to the saved card.
 *     A declined card gets a Stripe invoice instead (30 days to pay, emailed
 *     by Stripe); a fee still unpaid 30 days later pauses the contractor's
 *     bidding in the quote canister.
 *
 * The Worker's identity must be registered with fee.addReferralRelay.
 */
import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory as feeIdl } from "../../../packages/shared/src/declarations/fee";
import { idlFactory as contractorIdl } from "../../../packages/shared/src/declarations/contractor";
import { getAgent, PRINCIPAL_RE } from "../paymentCanister";

/** Bump when the referral-fee section of the Terms of Service changes. */
export const REFERRAL_TERMS_VERSION = "2026-10-26";

export interface ReferralCard {
  customerId: string;
  paymentMethodId: string;
  brand: string;
  last4: string;
  agreedAt: bigint;   // ns
  termsVersion: string;
}

export interface DueFee {
  id: string;
  contractor: string;
  serviceType: string;
  bidCents: number;
  feeCents: number;
  card: ReferralCard | null;
}

export interface FeeLedger {
  takeDue(): Promise<DueFee[]>;
  markPaid(feeId: string, paymentRef: string): Promise<void>;
  markFailed(feeId: string, paymentRef: string, payUrl: string): Promise<void>;
  setCard(principal: string, card: ReferralCard): Promise<void>;
  /** The contractor profile's email, or null when the principal has no profile. */
  contractorEmail(principal: string): Promise<string | null>;
}

/** The fee and contractor canisters through the Worker's identity. */
export function canisterLedger(): FeeLedger {
  const fee = async () => {
    const canisterId = process.env.CANISTER_ID_FEE;
    if (!canisterId) throw new Error("CANISTER_ID_FEE is not set");
    return Actor.createActor(feeIdl, { agent: await getAgent(), canisterId }) as any;
  };
  const check = (res: any, what: string) => {
    if ("err" in res) throw new Error(`${what} failed: ${Object.keys(res.err)[0]}`);
    return res.ok;
  };
  return {
    async takeDue() {
      const items = check(await (await fee()).takeDueReferralFees(), "takeDueReferralFees") as any[];
      return items.map(({ fee: f, card }) => ({
        id: f.id, contractor: f.contractor.toText(), serviceType: f.serviceType,
        bidCents: Number(f.bidCents), feeCents: Number(f.feeCents), card: card[0] ?? null,
      }));
    },
    async markPaid(feeId, paymentRef) {
      check(await (await fee()).relayMarkReferralFeePaid(feeId, paymentRef), "relayMarkReferralFeePaid");
    },
    async markFailed(feeId, paymentRef, payUrl) {
      check(await (await fee()).relayMarkReferralFeeFailed(feeId, paymentRef, payUrl), "relayMarkReferralFeeFailed");
    },
    async setCard(principal, card) {
      check(await (await fee()).relaySetReferralCard(Principal.fromText(principal), card), "relaySetReferralCard");
    },
    async contractorEmail(principal) {
      const canisterId = process.env.CANISTER_ID_CONTRACTOR;
      if (!canisterId) throw new Error("CANISTER_ID_CONTRACTOR is not set");
      const actor = Actor.createActor(contractorIdl, { agent: await getAgent(), canisterId }) as any;
      const res = await actor.getContractor(Principal.fromText(principal));
      return "ok" in res ? (res.ok.email as string) : null;
    },
  };
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function feeDescription(f: DueFee): string {
  return `HomeGentic referral fee: 3% of your ${usd(f.bidCents)} ${f.serviceType} bid ($20 minimum)`;
}

/** Start Stripe Checkout (setup mode) for the session principal's referral-fee card. */
export async function startCardSetup(
  principal: string,
  returnUrl: string,
  stripe: any,
  ledger: FeeLedger,
): Promise<{ status: number; body: unknown }> {
  if (!PRINCIPAL_RE.test(principal)) return { status: 400, body: { error: "Invalid principal" } };
  const email = await ledger.contractorEmail(principal);
  if (email === null) return { status: 404, body: { error: "Create your contractor profile first." } };
  const metadata = { type: "referral_card", principal, terms_version: REFERRAL_TERMS_VERSION };
  const customer = await stripe.customers.create({
    ...(email ? { email } : {}),
    metadata: { icp_principal: principal, purpose: "referral_fee" },
  });
  const sep = returnUrl.includes("?") ? "&" : "?";
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customer.id,
    payment_method_types: ["card"],
    success_url: `${returnUrl}${sep}referral_card=saved`,
    cancel_url: returnUrl,
    metadata,
    setup_intent_data: { metadata },
    custom_text: {
      submit: {
        message: "HomeGentic will charge this card 3% of each bid a homeowner accepts through HomeGentic ($20 minimum) once the job is verified, or 60 days after acceptance. See the contractor referral fee section of the Terms of Service.",
      },
    },
  });
  return { status: 200, body: { url: session.url } };
}

/** checkout.session.completed for a referral-card session: store the card. */
export async function saveCardFromSession(session: any, stripe: any, ledger: FeeLedger): Promise<boolean> {
  if (session?.metadata?.type !== "referral_card" || session.status !== "complete") return false;
  const principal = String(session.metadata.principal ?? "");
  if (!PRINCIPAL_RE.test(principal)) return false;
  const siId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!siId) return false;
  const si = await stripe.setupIntents.retrieve(siId, { expand: ["payment_method"] });
  const pm = si.payment_method;
  if (!pm?.id) return false;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  // Invoices sent after a declined charge offer the same card first.
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  await ledger.setCard(principal, {
    customerId,
    paymentMethodId: pm.id,
    brand: String(pm.card?.brand ?? ""),
    last4: String(pm.card?.last4 ?? ""),
    agreedAt: BigInt(session.created ?? Math.floor(Date.now() / 1000)) * 1_000_000_000n,
    termsVersion: String(session.metadata.terms_version ?? REFERRAL_TERMS_VERSION),
  });
  return true;
}

/** invoice.paid for a referral-fee invoice (sent after a declined card). */
export async function markInvoicePaid(invoice: any, ledger: FeeLedger): Promise<boolean> {
  if (invoice?.metadata?.type !== "referral_fee") return false;
  const feeId = String(invoice.metadata.fee_id ?? "");
  if (!/^RF_\d+$/.test(feeId)) return false;
  await ledger.markPaid(feeId, invoice.id);
  return true;
}

/** Stripe errors that mean the card can't be charged without the contractor. */
function isCardFailure(err: any): boolean {
  return err?.type === "StripeCardError" || err?.code === "authentication_required" || err?.code === "card_declined";
}

export interface ChargeSummary { paid: number; invoiced: number; skipped: number; errors: number }

/** Charge every Due fee to its saved card; invoice the ones that are declined. */
export async function chargeDueFees(stripe: any, ledger: FeeLedger): Promise<ChargeSummary> {
  const out: ChargeSummary = { paid: 0, invoiced: 0, skipped: 0, errors: 0 };
  for (const f of await ledger.takeDue()) {
    if (!f.card) { out.skipped += 1; continue; }
    const description = feeDescription(f);
    const metadata = { type: "referral_fee", fee_id: f.id, icp_principal: f.contractor };
    try {
      const pi = await stripe.paymentIntents.create({
        amount: f.feeCents, currency: "usd",
        customer: f.card.customerId, payment_method: f.card.paymentMethodId,
        off_session: true, confirm: true, description, metadata,
      }, { idempotencyKey: `rf-${f.id}` });
      if (pi.status === "succeeded") {
        await ledger.markPaid(f.id, pi.id);
        out.paid += 1;
        continue;
      }
      const declined = pi.status === "requires_payment_method" || pi.status === "requires_action";
      if (!declined) { out.skipped += 1; continue; }   // processing: look again next hour
    } catch (err) {
      if (!isCardFailure(err)) { out.errors += 1; continue; }   // Stripe outage etc.: retry next hour
    }
    try {
      const inv = await stripe.invoices.create({
        customer: f.card.customerId, collection_method: "send_invoice", days_until_due: 30,
        auto_advance: false, description, metadata,
      }, { idempotencyKey: `rf-inv-${f.id}` });
      // A retry after a partial run replays the create calls, so finalize and
      // send only while the invoice is still a draft.
      let cur = await stripe.invoices.retrieve(inv.id);
      if (cur.status === "draft") {
        await stripe.invoiceItems.create({
          customer: f.card.customerId, invoice: inv.id, amount: f.feeCents, currency: "usd", description,
        }, { idempotencyKey: `rf-ii-${f.id}` });
        await stripe.invoices.finalizeInvoice(inv.id);
        cur = await stripe.invoices.sendInvoice(inv.id);
      }
      await ledger.markFailed(f.id, inv.id, String(cur.hosted_invoice_url ?? ""));
      out.invoiced += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
