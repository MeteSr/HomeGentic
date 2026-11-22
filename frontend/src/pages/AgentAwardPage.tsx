/**
 * AgentAwardPage — Bid to List A5 · /agents/bids/:id
 * Mirror of H6. Once the seller chooses this bid, the agent pays the platform
 * fee here through Stripe Checkout; the seller's address and email are
 * released only after that payment settles (invariant 04).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/Button";
import { errorMessage } from "@/services/candid";
import { Layout } from "@/components/Layout";
import { listingService, type ListingProposal, type ListingBidRequest } from "@/services/listing";
import { feeService, type FeeRecord } from "@/services/fee";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import { formatCents } from "@/utils/format";

const UI = V2_COLORS;

export default function AgentAwardPage() {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<ListingProposal | null>(null);
  const [request, setRequest] = useState<ListingBidRequest | null>(null);
  const [fee, setFee] = useState<FeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [searchParams] = useSearchParams();
  const backFromStripe = searchParams.get("fee_paid") !== null;

  const load = useCallback(async () => {
    const [proposals, fees] = await Promise.all([listingService.getMyProposals(), feeService.getMyFees()]);
    const p = proposals.find((x) => x.id === id) ?? null;
    setProposal(p);
    if (p) {
      setFee(fees.find((f) => f.proposalId === p.id) ?? null);
      setRequest(await listingService.getBidRequest(p.requestId));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const accepted = proposal?.status === "Accepted";
  const due = fee?.status === "Owed" || fee?.status === "Invoiced";
  const chosen = proposal?.status === "Pending" && due;

  // Back from Stripe: the webhook releases the details a few seconds later.
  useEffect(() => {
    if (!backFromStripe || accepted || loading) return;
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 20) clearInterval(t);
      void load();
    }, 3000);
    return () => clearInterval(t);
  }, [backFromStripe, accepted, loading, load]);

  async function pay() {
    if (!proposal || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const url = await listingService.startFeeCheckout(proposal.id);
      if (!url) {
        setPayError("Card payments aren't set up yet. Nothing was charged.");
        setPaying(false);
        return;
      }
      window.location.assign(url);
    } catch (err) {
      setPayError(errorMessage(err, "Couldn't open the payment page. Nothing was charged."));
      setPaying(false);
    }
  }

  if (loading) return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted }}>Loading…</div></Layout>;
  if (!proposal || (!accepted && !chosen) || !request) {
    return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>Nothing to show yet.</div></Layout>;
  }

  if (chosen && fee) {
    return (
      <Layout>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
          <div style={{ background: UI.blueTintSurface, border: `1px solid ${UI.blueTintBorder}`, borderRadius: V2_RADIUS.card, padding: "18px 22px", margin: "1.5rem 0" }}>
            <div style={{ fontFamily: V2_FONTS.body, fontWeight: 600, color: UI.ink }}>
              {backFromStripe
                ? "Payment received. The seller's details show here as soon as Stripe confirms it."
                : `The seller chose your bid. Pay the ${formatCents(fee.amountCents)} platform fee to see their address and email.`}
            </div>
            {!backFromStripe && (
              <>
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.muted, margin: "8px 0 14px" }}>
                  Your name and contact details go to the seller at the same time. Payment is by card through Stripe.
                </p>
                <Button variant="primary" onClick={pay} disabled={paying}>
                  {paying ? "Opening Stripe…" : `Pay ${formatCents(fee.amountCents)} by card`}
                </Button>
                {payError && (
                  <p role="alert" style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.coralText, margin: "10px 0 0" }}>{payError}</p>
                )}
              </>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  const settled = fee?.status === "Paid" || fee?.status === "Waived";
  const unlocked = settled && !!request.address;

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        <div style={{ background: UI.green, color: "#fff", borderRadius: V2_RADIUS.card, padding: "16px 22px", margin: "1.5rem 0" }}>
          <div style={{ fontFamily: V2_FONTS.body, fontWeight: 600 }}>
            The homeowner chose your bid.{" "}
            {settled
              ? fee!.status === "Waived"
                ? "Your platform fee was waived."
                : `Your ${formatCents(fee!.amountCents)} platform fee is paid.`
              : fee
                ? `Your ${formatCents(fee.amountCents)} platform fee is due. The seller's address and email show here once it's paid.`
                : "The seller's address and email show here once your platform fee is paid."}
          </div>
          {fee?.status === "Paid" && (
            <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", marginTop: 4, opacity: 0.85 }}>RECEIPT SENT</div>
          )}
        </div>

        {unlocked && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: "clamp(24px,3vw,40px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ width: 58, height: 58, borderRadius: V2_RADIUS.card, background: UI.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.3rem" }}>
                {request.address[0]}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 10 }}>
                {[["Address", request.address], ["Email", request.homeownerEmail]].map(([l, v]) => (
                  <div key={l} style={{ background: UI.neutralSurface2, borderRadius: V2_RADIUS.input + 4, padding: 12 }}>
                    <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.62rem", color: UI.muted, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink, marginTop: 4 }}>{v || "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>
                The record, now unlocked
              </div>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>
                The seller documented the house before you arrived. Reach out by email to set up a first meeting.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
