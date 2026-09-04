/**
 * ListingDetailPage — Bid to List H2 / H3 / H6 · /listing/:id
 * One route, three states of the same auction:
 *   H2 — waiting (sealed, <3 bids and window open)
 *   H3 — the bid board (revealed: >=3 bids or window closed)
 *   H6 — introduced (fee paid, winner unmasked, other four closed)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Star, Lock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { BidDetailDrawer } from "@/components/BidDetailDrawer";
import { ConfirmSelectionModal } from "@/components/ConfirmSelectionModal";
import {
  listingService,
  type ListingBidRequest,
  type MaskedProposal,
} from "@/services/listing";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import toast from "react-hot-toast";

const UI = V2_COLORS;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}
function commissionPct(bps: number): string {
  return (bps / 100).toFixed(2).replace(/0$/, "") + "%";
}

type SortKey = "net" | "commission" | "dom";

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [request, setRequest] = useState<ListingBidRequest | null>(null);
  const [progress, setProgress] = useState<{ count: number; sealed: boolean } | null>(null);
  const [proposals, setProposals] = useState<MaskedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const [drawerProposal, setDrawerProposal] = useState<MaskedProposal | null>(null);
  const [confirmProposal, setConfirmProposal] = useState<MaskedProposal | null>(null);
  const [feeCents, setFeeCents] = useState(39900);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const req = await listingService.getBidRequest(id);
      if (!req) { setNotFound(true); setLoading(false); return; }
      setRequest(req);

      if (req.status === "Awarded") {
        const props = await listingService.getProposalsForRequest(id);
        setProposals(props);
      } else {
        const prog = await listingService.getBidProgress(id);
        setProgress(prog);
        if (!prog.sealed) {
          const props = await listingService.getProposalsForRequest(id);
          setProposals(props);
        }
      }
      listingService.getPlatformFee().then(setFeeCents).catch(() => {});
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load listing");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get("fee_paid")) {
      toast.success("Payment cleared — identities released.");
      searchParams.delete("fee_paid");
      setSearchParams(searchParams, { replace: true });
      load();
    } else if (searchParams.get("fee_cancelled")) {
      toast("Payment cancelled — nothing changed, the auction is still live.");
      searchParams.delete("fee_cancelled");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleShortlist(proposalId: string) {
    setShortlist((s) => {
      const next = new Set(s);
      if (next.has(proposalId)) next.delete(proposalId); else next.add(proposalId);
      return next;
    });
  }

  const sorted = [...proposals].sort((a, b) => {
    if (sortKey === "net") return b.derived.estNetToSellerCents - a.derived.estNetToSellerCents;
    if (sortKey === "commission") return a.commissionBps - b.commissionBps;
    return a.estimatedDaysOnMarket - b.estimatedDaysOnMarket;
  });

  const bestNetId = proposals.length
    ? [...proposals].sort((a, b) => b.derived.estNetToSellerCents - a.derived.estNetToSellerCents)[0].id
    : null;

  if (loading) {
    return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>Loading…</div></Layout>;
  }
  if (notFound || !request) {
    return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted, fontFamily: V2_FONTS.body }}>Listing request not found.</div></Layout>;
  }

  // ── H6: Introduced ──────────────────────────────────────────────────────────
  if (request.status === "Awarded" && request.feePaid) {
    const winner = proposals.find((p) => p.status === "Accepted");
    const others = proposals.filter((p) => p.status !== "Accepted");
    return (
      <Layout>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
          <div style={{ background: UI.green, color: UI.paper, borderRadius: V2_RADIUS.card, padding: "16px 22px", margin: "1.5rem 0", fontFamily: V2_FONTS.body, fontWeight: 600 }}>
            ✓ Payment cleared. Your record, address and contact details have been released to{" "}
            {winner?.agentName ?? "your agent"} — and theirs to you.
          </div>

          {winner && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: "clamp(24px,3vw,40px)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 64, height: 64, borderRadius: V2_RADIUS.card, background: UI.blue, color: UI.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.5rem" }}>
                    {winner.agentName?.[0] ?? "A"}
                  </div>
                  <div>
                    <div style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.5rem", color: UI.ink }}>{winner.agentName}</div>
                    <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.72rem", color: UI.muted }}>{winner.agentBrokerage}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 10 }}>
                  <div style={{ background: UI.neutralSurface2, borderRadius: V2_RADIUS.input + 4, padding: 12 }}>
                    <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", color: UI.muted, textTransform: "uppercase" }}>Email</div>
                    <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink, marginTop: 4 }}>{winner.agentEmail}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>What happens next</div>
                  {["She has your record and 48 hours to make contact", "Walkthrough and listing agreement", "Buyer's Truth Kit generated for the listing", "Request closes when the agreement is signed"].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: i > 0 ? `1px solid ${UI.border}` : "none" }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, fontSize: "0.7rem", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.mono,
                        background: i === 0 ? UI.blueTintSurface : UI.neutralSurface, color: i === 0 ? UI.blue : UI.muted,
                      }}>{i + 1}</div>
                      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: UI.ink }}>{step}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: UI.ink, borderRadius: V2_RADIUS.card + 2, padding: 20 }}>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: "rgba(252,252,253,0.6)", textTransform: "uppercase" }}>Her bid, now binding as terms</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: UI.paper, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }}>
                      <span>Commission</span><span>{commissionPct(winner.commissionBps)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: UI.paper, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }}>
                      <span>Suggested list</span><span>{money(winner.suggestedListCents)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: UI.greenBright, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }}>
                      <span>Fee she paid</span><span>{money(feeCents)}</span>
                    </div>
                  </div>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", color: "rgba(252,252,253,0.55)", marginTop: 12 }}>
                    These were her bid terms. They are not a signed listing agreement — that is between the two of you,
                    and we keep a copy of what she promised here.
                  </p>
                </div>

                <div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>The other four</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {others.map((p) => (
                      <div key={p.id} style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.input, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.muted }}>
                        <span>Bid {p.letter}</span><span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem" }}>CLOSED</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.muted, marginTop: 8 }}>
                    Notified that the listing went elsewhere. None was charged, none learned your address, and none can contact you.
                  </p>
                </div>

                <div style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card, padding: 18 }}>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 8 }}>If this does not work out</div>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink, marginBottom: 12 }}>
                    You are not committed. Tell us within 30 days that you did not sign with her and we refund her{" "}
                    {money(feeCents)} and reopen your request to the other agents.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => toast("Report submitted — our team will follow up.")}>
                    Report that we did not sign
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ── H2: Waiting ──────────────────────────────────────────────────────────────
  if (progress?.sealed) {
    const slots = ["A", "B", "C", "D", "E"];
    return (
      <Layout>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
          <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(22px,2.4vw,28px)", color: UI.ink }}>
            {progress.count === 0 ? "Your request is live to verified agents in your county" : `${progress.count} of 5 bids in. Comparing now is premature.`}
          </h1>
          <div style={{ display: "flex", gap: 10, margin: "20px 0" }}>
            {slots.map((letter, i) => {
              const filled = i < progress.count;
              return (
                <div key={letter} style={{
                  flex: 1, height: 64, borderRadius: V2_RADIUS.card - 2, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 2,
                  border: filled ? `1.5px solid ${UI.blueTintBorder}` : `1.5px dashed ${UI.divider}`,
                  background: filled ? UI.blueTintBg : UI.neutralSurface2,
                }}>
                  <span style={{ fontFamily: V2_FONTS.mono, fontWeight: 700, color: filled ? UI.blue : UI.faint }}>{letter}</span>
                  {filled && <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", color: UI.blue }}>SEALED</span>}
                </div>
              );
            })}
          </div>
          <div style={{ background: UI.blueTintBg, border: `1px solid ${UI.blueTintBorder}`, borderRadius: V2_RADIUS.card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Lock size={14} color={UI.blueDeepText} />
              <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.blueDeepText, textTransform: "uppercase" }}>Why the delay is deliberate</span>
            </div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: UI.blueDeepText, margin: 0 }}>
              If a seller could watch bids land one at a time, the last agent to bid would always know what to beat.
              Sealed until three keeps it a blind auction. Terms stay hidden until three bids are in or the window closes.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  // ── H3: The bid board ─────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(24px,2.6vw,32px)", color: UI.ink, margin: 0 }}>
            {proposals.length} agent{proposals.length === 1 ? "" : "s"} want your listing
          </h1>
          <div style={{ display: "flex", border: `1.5px solid ${UI.border}`, borderRadius: 100, overflow: "hidden" }}>
            {([["net", "Net to you"], ["commission", "Commission"], ["dom", "Days on market"]] as [SortKey, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setSortKey(key)} style={{
                padding: "8px 16px", border: "none", cursor: "pointer", fontFamily: V2_FONTS.mono, fontSize: "0.72rem",
                background: sortKey === key ? UI.ink : "transparent", color: sortKey === key ? UI.paper : UI.muted,
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ background: UI.blueTintBg, border: `1px solid ${UI.blueTintBorder}`, borderRadius: V2_RADIUS.card, padding: 16, marginBottom: 18 }}>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.blueDeepText, margin: 0 }}>
            <strong>The highest suggested price is not the best bid.</strong> An agent who wins a listing on an
            optimistic number and cuts it twice costs you more than one who priced it right. Bids more than 4% above
            local closed comps are flagged below.
          </p>
        </div>

        <div style={{ border: `1px solid ${UI.border}`, borderRadius: V2_RADIUS.card + 2, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0,1.15fr) 96px 118px 130px 82px 78px auto", gap: 12,
            padding: "12px 18px", background: UI.neutralSurface, fontFamily: V2_FONTS.mono, fontSize: "0.62rem",
            fontWeight: 700, letterSpacing: "0.1em", color: UI.muted, textTransform: "uppercase",
          }}>
            <span>Bidder</span><span>Commission</span><span>Suggested list</span><span>Est. net to you</span><span>Avg DOM</span><span>Comps</span><span />
          </div>
          {sorted.map((p) => {
            const isBest = p.id === bestNetId;
            const shortlisted = shortlist.has(p.id);
            return (
              <div key={p.id}>
                <div
                  onClick={() => setDrawerProposal(p)}
                  style={{
                    display: "grid", gridTemplateColumns: "minmax(0,1.15fr) 96px 118px 130px 82px 78px auto", gap: 12,
                    padding: "18px", alignItems: "center", cursor: "pointer",
                    background: shortlisted ? UI.neutralRowTint : UI.paper,
                    borderTop: `1px solid ${UI.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: V2_RADIUS.input + 1, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.mono, fontWeight: 700, fontSize: "0.875rem",
                      background: shortlisted ? UI.vbadge : UI.neutralSurface3, color: shortlisted ? UI.blue : UI.muted,
                    }}>{p.letter}</div>
                    <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: UI.ink }}>Bid {p.letter}</span>
                  </div>
                  <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.05rem", color: UI.ink }}>{commissionPct(p.commissionBps)}</div>
                  <div>
                    <div style={{ fontFamily: V2_FONTS.mono, fontWeight: 600, fontSize: "0.9375rem", color: UI.ink }}>{money(p.suggestedListCents)}</div>
                    {p.derived.overCompFlag && (
                      <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", fontWeight: 600, color: UI.orange, marginTop: 2 }}>
                        +{(p.derived.pctVsCompsBps / 100).toFixed(1)}% OVER COMPS
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.05rem", color: isBest ? UI.green : UI.ink }}>{money(p.derived.estNetToSellerCents)}</div>
                    <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", fontWeight: 600, color: isBest ? UI.green : UI.muted, marginTop: 2 }}>
                      {isBest ? "HIGHEST NET" : "AFTER COMMISSION"}
                    </div>
                  </div>
                  <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>{p.estimatedDaysOnMarket}d</div>
                  <div>
                    <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: p.derived.thinCompsFlag ? UI.orange : UI.ink }}>{p.agentRecord.closedInZip}</span>
                    {p.derived.thinCompsFlag && <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.58rem", color: UI.orange }}>THIN</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleShortlist(p.id)}
                      style={{
                        width: 38, height: 38, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                        border: shortlisted ? "none" : `1.5px solid ${UI.border}`,
                        background: shortlisted ? UI.blue : UI.paper,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Star size={16} fill={shortlisted ? UI.yellow : "none"} color={shortlisted ? UI.yellow : UI.muted} />
                    </button>
                    <Button
                      variant={shortlisted ? "primary" : "outline"}
                      size="sm"
                      onClick={() => shortlisted ? setConfirmProposal(p) : toggleShortlist(p.id)}
                    >
                      {shortlisted ? "Choose" : "Shortlist"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16, marginTop: 20 }}>
          {[
            ["EST. NET TO YOU", "Suggested list minus commission. It reorders the board: the lowest commission is not the highest net, and the highest price rarely is either."],
            ["OVER-COMP FLAG", "Any suggested list more than 4% above the local closed median. Winning a listing on an inflated number and cutting it later is the oldest move in the business."],
            ["THIN LOCAL RECORD", "Fewer than eight closed comps in this zip. Not disqualifying, but it means the pricing confidence is borrowed from elsewhere."],
          ].map(([label, body]) => (
            <div key={label} style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card, padding: 16 }}>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.muted, marginBottom: 6 }}>{label}</div>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.ink, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      {drawerProposal && (
        <BidDetailDrawer
          proposal={drawerProposal}
          onClose={() => setDrawerProposal(null)}
          onChoose={(p) => { setDrawerProposal(null); setConfirmProposal(p); }}
        />
      )}
      {confirmProposal && id && (
        <ConfirmSelectionModal
          proposal={confirmProposal}
          requestId={id}
          feeCents={feeCents}
          onClose={() => setConfirmProposal(null)}
        />
      )}
    </Layout>
  );
}
