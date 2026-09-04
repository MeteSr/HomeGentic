/**
 * AgentBidFormPage — Bid to List A3 · /agents/listings/:id/bid
 * Submit sealed terms. The agent is told, before submitting, exactly how the
 * seller will see this bid — the flag threshold is shown up front on purpose.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { listingService, type BidRequestSummary, type CompsConfig } from "@/services/listing";
import { agentService, type AgentProfile } from "@/services/agent";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import toast from "react-hot-toast";

const UI = V2_COLORS;

const COMMITMENTS = [
  "Professional photography", "Twilight shoot", "Broker preview", "Paid social campaign",
  "Staging consult", "Drone video", "Weekly price review", "Open houses first fortnight",
];

function money(cents: number): string {
  return "$" + Math.round(cents).toLocaleString("en-US");
}

const numInput: React.CSSProperties = {
  border: `1.5px solid ${UI.blue}`, borderRadius: V2_RADIUS.input, padding: "10px 14px",
  fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.35rem", color: UI.ink, width: "100%", boxSizing: "border-box",
};

export default function AgentBidFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<BidRequestSummary | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [comps, setComps] = useState<CompsConfig | null>(null);
  const [commission, setCommission] = useState("3.0");
  const [suggestedList, setSuggestedList] = useState("");
  const [cmaSummary, setCmaSummary] = useState("");
  const [marketingPlan, setMarketingPlan] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [commitments, setCommitments] = useState<Set<string>>(new Set(COMMITMENTS.slice(0, 5)));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    listingService.getOpenBidRequests().then((all) => setListing(all.find((l) => l.id === id) ?? null));
    agentService.getMyProfile().then(setProfile);
  }, [id]);

  useEffect(() => {
    if (listing?.zipCode) listingService.getCompsMedian(listing.zipCode).then(setComps).catch(() => {});
  }, [listing]);

  const suggestedCents = Math.round(parseFloat(suggestedList || "0") * 100);
  const commissionBps = Math.round(parseFloat(commission || "0") * 100);
  const estNet = suggestedCents * (10000 - commissionBps) / 10000;
  const pctVsComps = comps && comps.medianCents > 0 ? ((suggestedCents - comps.medianCents) / comps.medianCents) * 100 : 0;
  const threshold = comps ? comps.medianCents * 1.04 : 0;
  const overFlag = comps ? suggestedCents > threshold : false;

  function toggleCommitment(c: string) {
    setCommitments((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  async function handleSubmit() {
    if (!id) return;
    if (commissionBps <= 0) { toast.error("Enter a commission"); return; }
    if (suggestedCents <= 0) { toast.error("Enter a suggested list price"); return; }
    if (commitments.size === 0) { toast.error("Select at least one marketing commitment"); return; }
    setSubmitting(true);
    try {
      await listingService.submitProposal(id, {
        commissionBps,
        suggestedListCents: suggestedCents,
        cmaSummary,
        marketingPlan,
        marketingCommitments: Array.from(commitments),
        estimatedDaysOnMarket: profile?.avgDaysOnMarket ?? 30,
        includedServices: [],
        validUntil: Date.now() + 30 * 86_400_000,
        coverLetter,
      });
      toast.success("Sealed bid submitted.");
      navigate("/agents/bids");
    } catch (err: any) {
      toast.error(err?.message ?? "Bid submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!listing) return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted }}>Loading…</div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.06em", color: UI.muted, marginBottom: 4 }}>
          {listing.city.toUpperCase()} · {listing.zipCode}
        </div>
        <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(22px,2.4vw,28px)", color: UI.ink, margin: "0 0 24px" }}>
          Submit a sealed bid
        </h1>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "clamp(24px,3vw,40px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", color: UI.muted, textTransform: "uppercase", marginBottom: 6 }}>Commission %</div>
                <input value={commission} onChange={(e) => setCommission(e.target.value)} style={numInput} inputMode="decimal" />
              </div>
              <div>
                <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", color: UI.muted, textTransform: "uppercase", marginBottom: 6 }}>Suggested list ($)</div>
                <input value={suggestedList} onChange={(e) => setSuggestedList(e.target.value)} style={numInput} inputMode="decimal" placeholder="405000" />
                {comps && suggestedCents > 0 && (
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", marginTop: 6, color: overFlag ? UI.orange : UI.green }}>
                    {overFlag ? `+${pctVsComps.toFixed(1)}% OVER COMPS` : "AT COMPS"}
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: UI.blueTintBg, border: `1px solid ${UI.blueTintBorder}`, borderRadius: V2_RADIUS.card, padding: 18 }}>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.blueDeepText, textTransform: "uppercase", marginBottom: 10 }}>
                How the seller will see this
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", color: UI.blueDeepText }}>EST. NET TO SELLER</div>
                  <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, color: UI.blueDeepText }}>{money(estNet)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", color: UI.blueDeepText }}>VS COMPS</div>
                  <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, color: UI.blueDeepText }}>{comps ? `${pctVsComps >= 0 ? "+" : ""}${pctVsComps.toFixed(1)}%` : "—"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", color: UI.blueDeepText }}>YOUR AVG DOM</div>
                  <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, color: UI.blueDeepText }}>{profile?.avgDaysOnMarket ?? "—"} d</div>
                </div>
              </div>
              {comps && (
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.blueDeepText, marginTop: 10, marginBottom: 0 }}>
                  Local closed median is {money(comps.medianCents)}. Anything above {money(threshold)} is shown to the seller
                  with an over-comps flag. {overFlag ? "Yours is flagged." : "Yours is not flagged."}
                </p>
              )}
            </div>

            <textarea value={cmaSummary} onChange={(e) => setCmaSummary(e.target.value)} placeholder="CMA summary" rows={3}
              style={{ border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.input, padding: 12, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }} />
            <textarea value={marketingPlan} onChange={(e) => setMarketingPlan(e.target.value)} placeholder="Marketing plan" rows={3}
              style={{ border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.input, padding: 12, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }} />
            <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Cover letter (optional)" rows={2}
              style={{ border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.input, padding: 12, fontFamily: V2_FONTS.body, fontSize: "0.875rem" }} />

            <div>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>
                Marketing commitments
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 10 }}>
                {COMMITMENTS.map((c) => {
                  const checked = commitments.has(c);
                  return (
                    <label key={c} style={{
                      display: "flex", alignItems: "center", gap: 8, minHeight: 48, padding: "0 12px",
                      border: `1.5px solid ${checked ? UI.blueTintBorder : UI.border}`, borderRadius: V2_RADIUS.input,
                      background: checked ? UI.blueTintBg : UI.paper, cursor: "pointer",
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCommitment(c)} />
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: UI.ink }}>{c}</span>
                    </label>
                  );
                })}
              </div>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.muted, marginTop: 8 }}>
                These are recorded and shown to the homeowner after selection as what you promised. Sellers can report commitments that were not met.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card, padding: 18 }}>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 4 }}>
                Your record · not editable
              </div>
              {[["Closed sales", String(profile?.listingsLast12Months ?? 0)], ["Average DOM", `${profile?.avgDaysOnMarket ?? 0} d`]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${UI.border}`, fontFamily: V2_FONTS.body, fontSize: "0.85rem" }}>
                  <span style={{ color: UI.muted }}>{l}</span><span style={{ color: UI.ink, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: UI.ink, borderRadius: V2_RADIUS.card, padding: 20 }}>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: "rgba(252,252,253,0.6)", textTransform: "uppercase" }}>If you win</div>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: "rgba(252,252,253,0.85)", margin: "8px 0 16px" }}>
                Charged to your card on file the moment the homeowner picks you. If they never sign a listing
                agreement with you and report it within 30 days, the fee is refunded in full.
              </p>
              <Button variant="primary" style={{ width: "100%" }} loading={submitting} onClick={handleSubmit}>
                Submit sealed bid
              </Button>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.72rem", color: "rgba(252,252,253,0.55)", marginTop: 10, marginBottom: 0 }}>
                You can withdraw or revise until the window closes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
