/**
 * AgentListingsPage — Bid to List A2 · /agents/browse
 * Masked opportunity feed. Open-slot count is the only cross-agent signal
 * permitted — invariant 03. Never bid count, bid contents, or competitor identity.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { listingService, type BidRequestSummary } from "@/services/listing";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = V2_COLORS;

function timeLeft(deadlineMs: number): string {
  const ms = deadlineMs - Date.now();
  if (ms <= 0) return "Closing";
  const days = Math.floor(ms / 86_400_000);
  const hrs = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} DAY${days > 1 ? "S" : ""} ${hrs} HRS LEFT`;
  return `${hrs} HRS LEFT`;
}

export default function AgentListingsPage() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<BidRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [countyFilter, setCountyFilter] = useState<string | null>(null);

  useEffect(() => {
    listingService.getOpenBidRequests().then((l) => { setListings(l); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const counties = useMemo(() => Array.from(new Set(listings.map((l) => l.county).filter(Boolean))), [listings]);
  const filtered = countyFilter ? listings.filter((l) => l.county === countyFilter) : listings;

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(22px,2.4vw,28px)", color: UI.ink, margin: "0 0 12px" }}>
          {listings.length} home{listings.length === 1 ? "" : "s"} taking bids
        </h1>

        {counties.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <button onClick={() => setCountyFilter(null)} style={{
              padding: "6px 14px", borderRadius: 100, border: `1.5px solid ${!countyFilter ? UI.blue : UI.border}`,
              background: !countyFilter ? UI.blueTintBg : "transparent", color: !countyFilter ? UI.blue : UI.muted,
              fontFamily: V2_FONTS.mono, fontSize: "0.72rem", cursor: "pointer",
            }}>All</button>
            {counties.map((c) => (
              <button key={c} onClick={() => setCountyFilter(c)} style={{
                padding: "6px 14px", borderRadius: 100, border: `1.5px solid ${countyFilter === c ? UI.blue : UI.border}`,
                background: countyFilter === c ? UI.blueTintBg : "transparent", color: countyFilter === c ? UI.blue : UI.muted,
                fontFamily: V2_FONTS.mono, fontSize: "0.72rem", cursor: "pointer",
              }}>{c}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: UI.muted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>No open listings right now.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,290px),1fr))", gap: 16 }}>
            {filtered.map((l) => {
              const full = l.openSlots === 0;
              const urgent = l.openSlots <= 1 && !full;
              return (
                <div key={l.id} style={{
                  border: `1px solid ${UI.border}`, borderRadius: V2_RADIUS.card, padding: 18,
                  background: full ? UI.neutralSurface2 : UI.paper, display: "flex", flexDirection: "column", gap: 12,
                }}>
                  <div>
                    <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1rem", color: UI.ink }}>{l.city} · {l.zipCode}</div>
                    <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: UI.muted, marginTop: 2 }}>
                      {[l.beds != null ? `${l.beds} bed` : null, l.baths != null ? `${l.baths} bath` : null, l.sqft != null ? `${l.sqft} sq ft` : null].filter(Boolean).join(" · ") || "Spec on file"}
                    </div>
                  </div>

                  <span style={{
                    alignSelf: "flex-start", fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.06em",
                    padding: "4px 10px", borderRadius: 100,
                    background: full ? UI.neutralSurface : urgent ? UI.orangeBg : UI.greenBg,
                    color: full ? UI.muted : urgent ? UI.orange : UI.green,
                  }}>
                    {full ? "FULL" : `${l.openSlots} OF 5 OPEN`}
                  </span>

                  <div style={{ display: "flex", gap: 4 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < l.proposalCount ? UI.blue : UI.border }} />
                    ))}
                  </div>

                  <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.muted }}>{l.notes || "Verified maintenance record on file."}</div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", color: urgent ? UI.orange : UI.muted }}>{timeLeft(l.bidDeadline)}</span>
                    <Button
                      variant={full ? "ghost" : "primary"}
                      size="sm"
                      disabled={full}
                      onClick={() => navigate(`/agents/listings/${l.id}/bid`)}
                    >
                      {full ? "Bidding full" : "Place a bid"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
