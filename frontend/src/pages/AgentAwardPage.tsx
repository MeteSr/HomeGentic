/**
 * AgentAwardPage — Bid to List A5 · /agents/bids/:id
 * Mirror of H6. Charge receipt, seller identity, and record access.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { listingService, type ListingProposal, type ListingBidRequest } from "@/services/listing";
import { feeService, type FeeRecord } from "@/services/fee";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = V2_COLORS;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export default function AgentAwardPage() {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<ListingProposal | null>(null);
  const [request, setRequest] = useState<ListingBidRequest | null>(null);
  const [fee, setFee] = useState<FeeRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [proposals, fees] = await Promise.all([listingService.getMyProposals(), feeService.getMyFees()]);
      const p = proposals.find((x) => x.id === id) ?? null;
      setProposal(p);
      if (p) {
        setFee(fees.find((f) => f.proposalId === p.id) ?? null);
        setRequest(await listingService.getBidRequest(p.requestId));
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted }}>Loading…</div></Layout>;
  if (!proposal || proposal.status !== "Accepted" || !request) {
    return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>Nothing to show yet.</div></Layout>;
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        <div style={{ background: UI.green, color: "#fff", borderRadius: V2_RADIUS.card, padding: "16px 22px", margin: "1.5rem 0" }}>
          <div style={{ fontFamily: V2_FONTS.body, fontWeight: 600 }}>
            The homeowner chose your bid. {money(fee?.amountCents ?? 0)} charged{fee ? "" : " (pending confirmation)"}.
          </div>
          <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", marginTop: 4, opacity: 0.85 }}>RECEIPT SENT</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: "clamp(24px,3vw,40px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 58, height: 58, borderRadius: V2_RADIUS.card, background: UI.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.3rem" }}>
              {(request.address || "H")[0]}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 10 }}>
              {[["Address", request.address], ["Email", request.homeownerEmail]].map(([l, v]) => (
                <div key={l} style={{ background: UI.neutralSurface2, borderRadius: V2_RADIUS.input + 4, padding: 12 }}>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.62rem", color: UI.muted, textTransform: "uppercase" }}>{l}</div>
                  <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink, marginTop: 4 }}>{v || "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ background: UI.amberBg, border: `1px solid ${UI.amberBorder}`, borderRadius: V2_RADIUS.card - 4, padding: 14 }}>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.amberText, margin: 0 }}>
                Make contact within 48 hours. If you do not, the homeowner can reclaim the fee and the listing reopens
                to the other bidders.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary">Message {request.address ? "seller" : ""}</Button>
              <Button variant="outline">Download record</Button>
            </div>
          </div>

          <div>
            <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>
              The record, now unlocked
            </div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>
              This is what {money(fee?.amountCents ?? 0)} bought that a lead-generation site cannot sell you: a seller
              who documented the house before you arrived.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
