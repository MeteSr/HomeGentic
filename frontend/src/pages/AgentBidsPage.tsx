/**
 * AgentBidsPage — Bid to List A4 · /agents/bids
 * Status board. Agents are never told what another agent bid, how many bids a
 * listing has, or why they lost — publishing that would turn every future
 * auction into a race to undercut.
 */

import React, { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { listingService, type ListingProposal } from "@/services/listing";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = V2_COLORS;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  Accepted:  { label: "WON",          bg: UI.greenBg,      color: UI.green },
  Pending:   { label: "SEALED",       bg: UI.neutralSurface, color: UI.muted },
  Rejected:  { label: "NOT SELECTED", bg: UI.neutralSurface, color: UI.muted2 },
  Withdrawn: { label: "WITHDRAWN",    bg: UI.neutralSurface, color: UI.muted2 },
};

export default function AgentBidsPage() {
  const [proposals, setProposals] = useState<ListingProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listingService.getMyProposals().then((p) => { setProposals(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const won = proposals.filter((p) => p.status === "Accepted");
  const totalPaid = won.length; // fee amount not resolved per-proposal here; count is the honest signal available

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(22px,2.4vw,28px)", color: UI.ink, margin: "0 0 6px" }}>My bids</h1>
        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9rem", color: UI.muted, margin: "0 0 20px" }}>
          {proposals.length} bids placed, {won.length} won this quarter
        </p>

        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: UI.muted }}>Loading…</div>
        ) : proposals.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>No bids yet.</div>
        ) : (
          <div style={{ border: `1px solid ${UI.border}`, borderRadius: V2_RADIUS.card, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 92px 116px 118px auto", gap: 12, padding: "12px 18px",
              background: UI.neutralSurface, fontFamily: V2_FONTS.mono, fontSize: "0.62rem", fontWeight: 700,
              letterSpacing: "0.1em", color: UI.muted, textTransform: "uppercase",
            }}>
              <span>Listing</span><span>Commission</span><span>Suggested list</span><span>Status</span><span />
            </div>
            {proposals.map((p) => {
              const s = STATUS_STYLE[p.status] ?? STATUS_STYLE.Pending;
              return (
                <div key={p.id} style={{
                  display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 92px 116px 118px auto", gap: 12, padding: 16,
                  borderTop: `1px solid ${UI.border}`, background: p.status === "Accepted" ? "#F7FDF9" : UI.paper, alignItems: "center",
                }}>
                  <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: UI.ink }}>Bid {p.letter}</span>
                  <span style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "0.9rem" }}>{(p.commissionBps / 100).toFixed(2).replace(/0$/, "")}%</span>
                  <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.85rem" }}>{money(p.suggestedListCents)}</span>
                  <span style={{
                    fontFamily: V2_FONTS.mono, fontSize: "0.62rem", letterSpacing: "0.06em", padding: "4px 10px",
                    borderRadius: 100, background: s.bg, color: s.color, width: "fit-content",
                  }}>{s.label}</span>
                  <span />
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: UI.muted, marginTop: 20, maxWidth: 560 }}>
          You are never told what another agent bid, how many bids a listing has, or why you lost. Publishing that
          would turn every future auction into a race to undercut.
        </p>
      </div>
    </Layout>
  );
}
