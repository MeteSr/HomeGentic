/**
 * Paying a contractor in the app (Stripe Connect).
 *
 * PayJobPanel sits on the homeowner's accepted quote. Paying by bank is the
 * default and costs the accepted price; paying by card costs the card price,
 * which covers the card fee, so the panel shows bank as the saving. A bank
 * payment reaches the contractor once it clears (about 4 business days), and
 * the panel says so before the homeowner pays.
 *
 * PayoutSetupBox sits in a contractor's Settings: Stripe-hosted onboarding,
 * after which homeowners can pay them in the app.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { errorMessage } from "@/services/candid";
import {
  BANK_CLEARING_LABEL,
  cardPriceCents,
  getJobPayment,
  getMyPayoutAccount,
  getPayoutReady,
  startJobPayment,
  startPayoutOnboarding,
  type JobPaymentMethod,
  type JobPaymentView,
  type PayoutAccountView,
} from "@/services/jobPayments";

const box: React.CSSProperties = {
  border: `1px solid ${V2_COLORS.border}`,
  background: V2_COLORS.paper,
  padding: "1rem 1.25rem",
  marginTop: "0.75rem",
};
const heading: React.CSSProperties = {
  fontFamily: V2_FONTS.body,
  fontSize: "0.65rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 600,
  color: V2_COLORS.muted,
  margin: "0 0 0.5rem",
};
const text: React.CSSProperties = {
  fontFamily: V2_FONTS.body,
  fontSize: "0.8125rem",
  color: V2_COLORS.ink,
  margin: "0 0 0.5rem",
  lineHeight: 1.5,
};
const muted: React.CSSProperties = { ...text, color: V2_COLORS.muted };
const errorText: React.CSSProperties = { ...text, color: "#C94C2E" };
const option: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontFamily: V2_FONTS.body,
  fontSize: "0.875rem",
  color: V2_COLORS.ink,
  margin: "0 0 0.4rem",
  cursor: "pointer",
};

const usd = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const bankClears = (who: string) =>
  `A bank payment reaches ${who} once it clears, ${BANK_CLEARING_LABEL}. A card payment goes through right away.`;

interface PayJobPanelProps {
  quoteId: string;
  requestId: string;
  contractor: string;
  bidCents: number;
  contractorName?: string;
}

export function PayJobPanel({ quoteId, contractor, bidCents, contractorName }: PayJobPanelProps) {
  const name = contractorName || "your contractor";
  const [ready, setReady] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<JobPaymentView | null>(null);
  const [method, setMethod] = useState<JobPaymentMethod>("bank");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backFromStripe = new URLSearchParams(window.location.search).get("payment") === "done";

  useEffect(() => {
    let live = true;
    Promise.all([getPayoutReady([contractor]), getJobPayment(quoteId)])
      .then(([readyMap, p]) => {
        if (!live) return;
        setReady(readyMap.get(contractor) === true);
        setPayment(p);
      })
      .catch(() => live && setReady(false));
    return () => {
      live = false;
    };
  }, [quoteId, contractor]);

  if (ready === null) return null;

  const card = cardPriceCents(bidCents);
  const status = payment?.status;

  if (status === "processing" && payment) {
    return (
      <section style={box} aria-label="Payment">
        <p style={heading}>Payment</p>
        <p style={text}>
          Your bank payment of {usd(payment.amountCents)} is on its way. It reaches {name} once it clears,{" "}
          {BANK_CLEARING_LABEL}. We'll let you know when it's done.
        </p>
      </section>
    );
  }
  if (status === "paid" && payment) {
    return (
      <section style={box} aria-label="Payment">
        <p style={heading}>Payment</p>
        <p style={text}>
          You paid {usd(payment.amountCents)} by {payment.method}. Stripe is sending it to {name}.
        </p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section style={box} aria-label="Payment">
        <p style={heading}>Payment</p>
        <p style={muted}>
          {name.charAt(0).toUpperCase() + name.slice(1)} hasn't set up payments in HomeGentic yet, so pay them the way
          you agreed.
        </p>
      </section>
    );
  }

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      const url = await startJobPayment(quoteId, method, window.location.href);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, "Couldn't open the payment page just now."));
      setOpening(false);
    }
  };

  return (
    <section style={box} aria-label="Payment">
      <p style={heading}>Payment</p>
      <p style={text}>
        <strong>Pay {name} in the app</strong> once the job is done. You pay once, through Stripe.
      </p>
      {status === "started" && backFromStripe && (
        <p style={muted}>Stripe has your payment. It can take a minute to show here; refresh if it doesn't.</p>
      )}
      {status === "failed" && <p style={errorText}>Your last payment didn't go through. You can try again.</p>}
      <div role="radiogroup" aria-label="How to pay" style={{ margin: "0.5rem 0" }}>
        <label style={option}>
          <input type="radio" name={`pay-${quoteId}`} checked={method === "bank"} onChange={() => setMethod("bank")} />
          <span>
            Bank account (ACH): <strong>{usd(bidCents)}</strong>
          </span>
        </label>
        <label style={option}>
          <input type="radio" name={`pay-${quoteId}`} checked={method === "card"} onChange={() => setMethod("card")} />
          <span>
            Card: <strong>{usd(card)}</strong>
          </span>
        </label>
      </div>
      <p style={muted}>
        Paying by bank saves you {usd(card - bidCents)}, the card fee. {bankClears(name)}
      </p>
      {error && (
        <p role="alert" style={errorText}>
          {error}
        </p>
      )}
      <Button onClick={open} loading={opening} disabled={opening}>
        Continue to Stripe
      </Button>
    </section>
  );
}

/** Contractor: set up getting paid in the app. */
export function PayoutSetupBox() {
  const [account, setAccount] = useState<PayoutAccountView | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backFromStripe = new URLSearchParams(window.location.search).get("payouts") === "done";

  useEffect(() => {
    let live = true;
    getMyPayoutAccount()
      .then((a) => live && setAccount(a))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);

  if (account === undefined) return null;

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      const url = await startPayoutOnboarding(`${window.location.origin}/settings?tab=subscription`);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, "Couldn't open Stripe just now."));
      setOpening(false);
    }
  };

  const fullyReady = account?.ready && account.payoutsEnabled;

  return (
    <section style={box} aria-label="Get paid in the app">
      <p style={heading}>Get paid in the app</p>
      {fullyReady ? (
        <p style={text}>
          Homeowners can pay you in the app. Stripe sends the money to your bank once a payment goes through: a bank
          payment goes through once it clears, {BANK_CLEARING_LABEL}.
        </p>
      ) : (
        <>
          <p style={text}>
            Let homeowners pay you through HomeGentic by bank or card. Stripe sends the money to your bank once a
            payment goes through: a bank payment goes through once it clears, {BANK_CLEARING_LABEL}.
          </p>
          <p style={muted}>
            On the free plan, the 3% referral fee comes out of the payment instead of being charged to your card.
          </p>
          {account && backFromStripe && (
            <p style={muted}>
              Stripe is checking your details. It can take a minute to show here; refresh if it doesn't.
            </p>
          )}
          {error && (
            <p role="alert" style={errorText}>
              {error}
            </p>
          )}
          <Button onClick={open} loading={opening} disabled={opening}>
            {account ? "Finish setting up payouts" : "Set up payouts"}
          </Button>
        </>
      )}
    </section>
  );
}
