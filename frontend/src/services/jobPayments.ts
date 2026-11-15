/**
 * Paying a contractor in the app (Stripe Connect). The quote canister keeps
 * the record and the rules; the voice Worker opens Stripe for both sides:
 *   - a contractor sets up payouts once (Stripe-hosted onboarding);
 *   - the homeowner pays an accepted quote by bank (the accepted price) or by
 *     card (the card price, which covers the card fee). A bank payment reaches
 *     the contractor once it clears, about 4 business days.
 *
 * E2E: window.__e2e_job_payments = { payments: { [quoteId]: JobPaymentView },
 * payout: PayoutAccountView | null, ready: { [principal]: boolean },
 * bids?: { [quoteId]: cents } } switches
 * every call to that in-memory copy.
 */
import { Principal } from "@icp-sdk/core/principal";
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/quote";
import type { _SERVICE as QuoteCanister } from "@homegentic/shared/types/quote";
import type * as QuoteTypes from "@homegentic/shared/types/quote";
import { variantKey } from "./candid";
import { voiceAgentFetch } from "./voiceAgentHeaders";

const QUOTE_CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";
const getActor = lazyActor<QuoteCanister>(idlFactory, QUOTE_CANISTER_ID);

export type JobPaymentMethod = "bank" | "card";
export type JobPaymentStatus = "started" | "processing" | "paid" | "failed";

export interface JobPaymentView {
  quoteId: string;
  method: JobPaymentMethod;
  status: JobPaymentStatus;
  bidCents: number;
  /** What the homeowner was charged: the bid by bank, the card price by card. */
  amountCents: number;
  updatedAt: number;
}

export interface PayoutAccountView {
  /** Stripe can send this contractor money (transfers active). */
  ready: boolean;
  payoutsEnabled: boolean;
}

/** About how long a bank payment takes to clear, as the app tells both sides. */
export const BANK_CLEARING_LABEL = "about 4 business days";

/**
 * The card price for a bid: the bid grossed up for Stripe's 2.9% + 30¢ card
 * fee, so the contractor gets the same amount either way. The quote
 * canister's cardPriceFor uses the same formula.
 */
export function cardPriceCents(bidCents: number): number {
  return Math.floor(((bidCents + 30) * 1000 + 970) / 971);
}

const ms = (ns: bigint) => Number(ns / 1_000_000n);

function fromRaw(p: QuoteTypes.JobPayment): JobPaymentView {
  return {
    quoteId: p.quoteId,
    method: variantKey(p.method) === "Card" ? "card" : "bank",
    status: variantKey(p.status).toLowerCase() as JobPaymentStatus,
    bidCents: Number(p.bidCents),
    amountCents: Number(p.amountCents),
    updatedAt: ms(p.updatedAt),
  };
}

interface E2EStore {
  payments: Record<string, JobPaymentView>;
  payout: PayoutAccountView | null;
  ready: Record<string, boolean>;
  /** Optional bids by quote id, so a started payment shows its amount. */
  bids?: Record<string, number>;
}

function e2eStore(): E2EStore | null {
  return typeof window !== "undefined" ? ((window as any).__e2e_job_payments ?? null) : null;
}

const withQuery = (url: string, q: string) => `${url}${url.includes("?") ? "&" : "?"}${q}`;

/** The payment on this quote, if the caller is its homeowner or contractor. */
export async function getJobPayment(quoteId: string): Promise<JobPaymentView | null> {
  const store = e2eStore();
  if (store) return store.payments[quoteId] ?? null;
  const [p] = await (await getActor()).getJobPayments([quoteId]);
  return p ? fromRaw(p) : null;
}

/** Contractor: their payout account, or null before they've started setting it up. */
export async function getMyPayoutAccount(): Promise<PayoutAccountView | null> {
  const store = e2eStore();
  if (store) return store.payout;
  const [acct] = await (await getActor()).getMyPayoutAccount();
  return acct ? { ready: acct.transfersActive, payoutsEnabled: acct.payoutsEnabled } : null;
}

/** Which of these contractors can be paid in the app. */
export async function getPayoutReady(principals: string[]): Promise<Map<string, boolean>> {
  const store = e2eStore();
  if (store) return new Map(principals.map((p) => [p, store.ready[p] === true]));
  if (principals.length === 0) return new Map();
  const rows = await (await getActor()).getPayoutReady(principals.map((p) => Principal.fromText(p)));
  return new Map(rows.map(([p, ready]) => [p.toText(), ready]));
}

async function postWorker(path: string, body: unknown, fallback: string): Promise<string> {
  const res = await voiceAgentFetch(`${VOICE_AGENT_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || typeof out.url !== "string") throw new Error(out.error ?? fallback);
  return out.url;
}

/** Homeowner: open Stripe Checkout for an accepted quote. Returns its URL. */
export async function startJobPayment(quoteId: string, method: JobPaymentMethod, returnUrl: string): Promise<string> {
  const store = e2eStore();
  if (store) {
    const bid = store.bids?.[quoteId] ?? 0;
    store.payments[quoteId] = {
      quoteId,
      method,
      status: method === "bank" ? "processing" : "paid",
      bidCents: bid,
      amountCents: method === "bank" ? bid : cardPriceCents(bid),
      updatedAt: Date.now(),
    };
    return withQuery(returnUrl, "payment=done");
  }
  return postWorker("/api/payments/start", { quoteId, method, returnUrl }, "Couldn't open the payment page just now.");
}

/** Contractor: open Stripe's onboarding to get paid in the app. Returns its URL. */
export async function startPayoutOnboarding(returnUrl: string): Promise<string> {
  const store = e2eStore();
  if (store) {
    store.payout = { ready: true, payoutsEnabled: true };
    return withQuery(returnUrl, "payouts=done");
  }
  return postWorker("/api/payments/payout-onboarding", { returnUrl }, "Couldn't open Stripe just now.");
}
