/**
 * Paying a contractor in the app (Stripe Connect, destination charges).
 *
 * The quote canister holds the record and the rules (payout accounts, who may
 * pay which quote, the prices and HomeGentic's share); this module is the
 * Stripe side:
 *   - startPayoutOnboarding: one Express account per contractor, recorded on
 *     the canister, and a Stripe-hosted onboarding link.
 *   - syncPayoutAccount: account.updated keeps the canister's flags current.
 *   - startJobPayment: Stripe Checkout for the homeowner, by bank (ACH, the
 *     accepted price) or card (the higher card price). The charge is made on
 *     HomeGentic's account and sent to the contractor's (transfer_data);
 *     HomeGentic keeps application_fee_amount: the 3% referral fee of a
 *     free-plan contractor's bid, plus the card fee when paid by card. Stripe
 *     moves the money to the contractor only once the charge succeeds, which
 *     for a bank payment is when it clears (about 4 business days).
 *   - handleJobPaymentEvent: Checkout webhooks move the canister's record to
 *     Processing, Paid or Failed. When the referral fee had already been paid
 *     another way, the canister says so and that part of HomeGentic's share
 *     is refunded to the contractor.
 *
 * The Worker's identity must be registered with quote.addPaymentRelay.
 */
import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory as quoteIdl } from "../../../packages/shared/src/declarations/quote";
import { idlFactory as contractorIdl } from "../../../packages/shared/src/declarations/contractor";
import { canisterError } from "../../../packages/shared/src/canisterError";
import { getAgent, PRINCIPAL_RE } from "../paymentCanister";

export type PaymentMethod = "bank" | "card";
type CanisterMethod = "Bank" | "Card";
export type PaymentStatus = "Started" | "Processing" | "Paid" | "Failed";

export interface PayoutAccountInfo {
  accountId: string;
  transfersActive: boolean;
  payoutsEnabled: boolean;
}

export interface PaymentTerms {
  quoteId: string;
  requestId: string;
  contractor: string;
  homeowner: string;
  accountId: string;
  bidCents: number;
  cardCents: number;
  referralFeeCents: number;
}

export interface PaymentLedger {
  /** The contractor profile's email, or null when the principal has no profile. */
  contractorEmail(principal: string): Promise<string | null>;
  getPayoutAccount(principal: string): Promise<PayoutAccountInfo | null>;
  setPayoutAccount(principal: string, account: PayoutAccountInfo): Promise<void>;
  /** Throws a CanisterError when `payer` can't pay `quoteId` in the app. */
  prepare(quoteId: string, payer: string): Promise<PaymentTerms>;
  getPayment(quoteId: string): Promise<{ status: PaymentStatus; checkoutRef: string } | null>;
  record(
    quoteId: string,
    payer: string,
    method: CanisterMethod,
    referralFeeCents: number,
    checkoutRef: string,
  ): Promise<void>;
  update(
    quoteId: string,
    checkoutRef: string,
    status: PaymentStatus,
    paymentRef: string,
  ): Promise<{ refundCents: number }>;
}

/** The quote and contractor canisters through the Worker's identity. */
export function canisterPaymentLedger(): PaymentLedger {
  const quote = async () => {
    const canisterId = process.env.CANISTER_ID_QUOTE;
    if (!canisterId) throw new Error("CANISTER_ID_QUOTE is not set");
    return Actor.createActor(quoteIdl, { agent: await getAgent(), canisterId }) as any;
  };
  const okOf = (res: any) => {
    if ("err" in res) throw canisterError(res.err);
    return res.ok;
  };
  const statusOf = (v: object) => Object.keys(v)[0] as PaymentStatus;
  return {
    async contractorEmail(principal) {
      const canisterId = process.env.CANISTER_ID_CONTRACTOR;
      if (!canisterId) throw new Error("CANISTER_ID_CONTRACTOR is not set");
      const actor = Actor.createActor(contractorIdl, { agent: await getAgent(), canisterId }) as any;
      const res = await actor.getContractor(Principal.fromText(principal));
      return "ok" in res ? (res.ok.email as string) : null;
    },
    async getPayoutAccount(principal) {
      const [a] = await (await quote()).relayGetPayoutAccount(Principal.fromText(principal));
      return a
        ? { accountId: a.accountId, transfersActive: a.transfersActive, payoutsEnabled: a.payoutsEnabled }
        : null;
    },
    async setPayoutAccount(principal, account) {
      okOf(await (await quote()).relaySetPayoutAccount(Principal.fromText(principal), { ...account, updatedAt: 0n }));
    },
    async prepare(quoteId, payer) {
      const t = okOf(await (await quote()).relayPrepareJobPayment(quoteId, Principal.fromText(payer)));
      return {
        quoteId: t.quoteId,
        requestId: t.requestId,
        contractor: t.contractor.toText(),
        homeowner: t.homeowner.toText(),
        accountId: t.accountId,
        bidCents: Number(t.bidCents),
        cardCents: Number(t.cardCents),
        referralFeeCents: Number(t.referralFeeCents),
      };
    },
    async getPayment(quoteId) {
      const [p] = await (await quote()).getJobPayments([quoteId]);
      return p ? { status: statusOf(p.status), checkoutRef: p.checkoutRef } : null;
    },
    async record(quoteId, payer, method, referralFeeCents, checkoutRef) {
      okOf(
        await (
          await quote()
        ).relayRecordJobPayment(
          quoteId,
          Principal.fromText(payer),
          { [method]: null },
          BigInt(referralFeeCents),
          checkoutRef,
        ),
      );
    },
    async update(quoteId, checkoutRef, status, paymentRef) {
      const r = okOf(await (await quote()).relayUpdateJobPayment(quoteId, checkoutRef, { [status]: null }, paymentRef));
      return { refundCents: Number(r.refundCents) };
    },
  };
}

const withQuery = (url: string, q: string) => `${url}${url.includes("?") ? "&" : "?"}${q}`;

/** Start (or continue) the session contractor's Stripe Connect onboarding. */
export async function startPayoutOnboarding(
  principal: string,
  returnUrl: string,
  stripe: any,
  ledger: PaymentLedger,
): Promise<{ status: number; body: unknown }> {
  if (!PRINCIPAL_RE.test(principal)) {
    return { status: 400, body: { error: "Invalid principal" } };
  }
  const email = await ledger.contractorEmail(principal);
  if (email === null) return { status: 404, body: { error: "Create your contractor profile first." } };
  let account = await ledger.getPayoutAccount(principal);
  if (!account) {
    const created = await stripe.accounts.create(
      {
        type: "express",
        country: "US",
        ...(email ? { email } : {}),
        capabilities: { transfers: { requested: true } },
        metadata: { icp_principal: principal },
      },
      { idempotencyKey: `payout-acct-${principal}` },
    );
    account = { accountId: created.id, transfersActive: false, payoutsEnabled: false };
    await ledger.setPayoutAccount(principal, account);
  }
  const link = await stripe.accountLinks.create({
    account: account.accountId,
    type: "account_onboarding",
    refresh_url: withQuery(returnUrl, "payouts=refresh"),
    return_url: withQuery(returnUrl, "payouts=done"),
  });
  return { status: 200, body: { url: link.url } };
}

/** account.updated: record the contractor's account flags. */
export async function syncPayoutAccount(account: any, ledger: PaymentLedger): Promise<boolean> {
  const principal = String(account?.metadata?.icp_principal ?? "");
  if (!principal || !account?.id) return false;
  await ledger.setPayoutAccount(principal, {
    accountId: String(account.id),
    transfersActive: account.capabilities?.transfers === "active",
    payoutsEnabled: account.payouts_enabled === true,
  });
  return true;
}

function refusal(err: any): { status: number; body: unknown } | null {
  const code = err?.code;
  if (code === "NotAuthorized") return { status: 403, body: { error: "Only the homeowner can pay for this job." } };
  if (code === "NotFound") return { status: 404, body: { error: "That quote wasn't found." } };
  if (code === "InvalidInput" || code === "Unavailable")
    return { status: code === "Unavailable" ? 503 : 400, body: { error: err.message } };
  return null;
}

/** Open Stripe Checkout for the session homeowner to pay an accepted quote. */
export async function startJobPayment(
  principal: string,
  quoteId: string,
  method: PaymentMethod,
  returnUrl: string,
  stripe: any,
  ledger: PaymentLedger,
): Promise<{ status: number; body: unknown }> {
  if (method !== "bank" && method !== "card") return { status: 400, body: { error: "Choose bank or card" } };
  if (typeof quoteId !== "string" || !quoteId || quoteId.length > 100)
    return { status: 400, body: { error: "Invalid quote" } };
  let terms: PaymentTerms;
  try {
    terms = await ledger.prepare(quoteId, principal);
  } catch (err) {
    const r = refusal(err);
    if (r) return r;
    throw err;
  }

  // One checkout at a time: close an earlier open one, and never open a
  // second after one was completed (its bank payment may still be on its way).
  const prior = await ledger.getPayment(quoteId);
  if (prior && prior.status === "Started" && prior.checkoutRef) {
    const old = await stripe.checkout.sessions.retrieve(prior.checkoutRef);
    if (old.status === "complete") {
      return { status: 409, body: { error: "Your payment for this job is already being processed." } };
    }
    if (old.status === "open") await stripe.checkout.sessions.expire(prior.checkoutRef);
  }

  const card = method === "card";
  const amount = card ? terms.cardCents : terms.bidCents;
  const applicationFee = terms.referralFeeCents + (card ? terms.cardCents - terms.bidCents : 0);
  const metadata = { type: "job_payment", quote_id: quoteId, principal };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: [card ? "card" : "us_bank_account"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: "Payment for your contractor's work, through HomeGentic" },
        },
      },
    ],
    payment_intent_data: {
      ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
      transfer_data: { destination: terms.accountId },
      metadata: { type: "job_payment", quote_id: quoteId },
    },
    metadata,
    success_url: withQuery(returnUrl, "payment=done"),
    cancel_url: returnUrl,
  });
  await ledger.record(quoteId, principal, card ? "Card" : "Bank", terms.referralFeeCents, session.id);
  return { status: 200, body: { url: session.url } };
}

/** Checkout webhooks for job payments. Returns false for other sessions. */
export async function handleJobPaymentEvent(
  type: string,
  session: any,
  stripe: any,
  ledger: PaymentLedger,
): Promise<boolean> {
  if (session?.metadata?.type !== "job_payment") return false;
  const quoteId = String(session.metadata.quote_id ?? "");
  if (!quoteId) return false;
  let status: PaymentStatus;
  switch (type) {
    case "checkout.session.completed":
      status = session.payment_status === "paid" ? "Paid" : "Processing";
      break;
    case "checkout.session.async_payment_succeeded":
      status = "Paid";
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      status = "Failed";
      break;
    default:
      return false;
  }
  const paymentRef =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? "");
  const { refundCents } = await ledger.update(quoteId, String(session.id), status, paymentRef);
  if (refundCents > 0 && paymentRef) {
    const pi = await stripe.paymentIntents.retrieve(paymentRef, { expand: ["latest_charge"] });
    const fee = pi?.latest_charge?.application_fee;
    const feeId = typeof fee === "string" ? fee : fee?.id;
    if (feeId) {
      await stripe.applicationFees.createRefund(
        feeId,
        { amount: refundCents },
        { idempotencyKey: `jp-refund-${paymentRef}` },
      );
    }
  }
  return true;
}
