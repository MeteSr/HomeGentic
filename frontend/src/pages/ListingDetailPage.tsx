/**
 * ListingDetailPage — Epic 9.4 / 9.5
 * Homeowner views submitted proposals, compares side-by-side, and accepts one.
 * 9.4.3 — HomeGentic score context per proposal
 * 9.4.5 — Post-selection contract upload
 * 9.4.6 — Counter-proposal flow
 * 9.5.1 — Listing milestone timeline
 * 9.5.2 — Offer log
 * 9.5.3 — Final sale price logging
 * 9.5.4 — Agent performance logging (homeowner side)
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle2, Clock, Upload, RefreshCw } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import {
  listingService,
  computeNetProceeds,
  formatCommission,
  isDeadlinePassed,
  initMilestones,
  MILESTONE_STEPS,
  type ListingBidRequest,
  type ListingProposal,
  type CounterProposal,
  type Milestone,
  type OfferEntry,
  type TransactionClose,
  type AgentPerformanceRecord,
} from "@/services/listing";
import { premiumEstimate } from "@/services/scoreService";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

const CLOSING_COST_BPS = 200;

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** 9.4.3 — Compare agent's price to homeowner's target. */
function priceContextBadge(estimatedSalePrice: number, desiredSalePrice: number | null): {
  label: string; color: string;
} {
  if (!desiredSalePrice) return { label: "No target set", color: S.inkLight };
  if (estimatedSalePrice >= desiredSalePrice) {
    return { label: "Meets or exceeds target", color: "#188038" };
  }
  if (estimatedSalePrice >= desiredSalePrice * 0.97) {
    return { label: "Near target price", color: "#e37400" };
  }
  return { label: "Below target — underpriced", color: "#c0392b" };
}

export default function ListingDetailPage() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();

  const [request,        setRequest]       = useState<ListingBidRequest | null>(null);
  const [proposals,      setProposals]     = useState<ListingProposal[]>([]);
  const [countersMap,    setCountersMap]   = useState<Record<string, CounterProposal[]>>({});
  const [loading,        setLoading]       = useState(true);
  const [accepting,      setAccepting]     = useState<string | null>(null);
  const [counteringId,   setCounteringId]  = useState<string | null>(null);
  const [counterBps,     setCounterBps]    = useState("225");
  const [counterNotes,   setCounterNotes]  = useState("");
  const [uploading,      setUploading]     = useState(false);
  const [uploadDone,     setUploadDone]    = useState(false);
  // 9.5
  const [milestones,     setMilestones]    = useState<Milestone[]>([]);
  const [offers,         setOffers]        = useState<OfferEntry[]>([]);
  const [closeData,      setCloseData]     = useState<TransactionClose | null>(null);
  const [perfRecord,     setPerfRecord]    = useState<AgentPerformanceRecord | null>(null);
  // 9.5.2 — offer form
  const [offerAmount,    setOfferAmount]   = useState("");
  const [offerDate,      setOfferDate]     = useState("");
  const [offerConts,     setOfferConts]    = useState<string[]>([]);
  // 9.5.3 — final sale form
  const [finalPrice,     setFinalPrice]    = useState("");
  const [finalDate,      setFinalDate]     = useState("");
  // 9.5.4 — performance form
  const [chargedBps,     setChargedBps]    = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      listingService.getBidRequest(id),
      listingService.getProposalsForRequest(id),
    ]).then(async ([req, props]) => {
      setRequest(req);
      setProposals(props);
      // 9.5 — initialize transaction state from request
      if (req) {
        setMilestones(req.milestones ?? initMilestones());
        setOffers(req.offers ?? []);
        setCloseData(req.closedData ?? null);
        setPerfRecord(req.agentPerformance ?? null);
        const accepted = props.find((p) => p.status === "Accepted");
        if (accepted) setChargedBps(String(accepted.commissionBps));
      }
      // 9.4.6 — load counters for each proposal
      const map: Record<string, CounterProposal[]> = {};
      await Promise.all(props.map(async (p) => {
        try {
          map[p.id] = await listingService.getCountersForProposal(p.id);
        } catch { map[p.id] = []; }
      }));
      setCountersMap(map);
    }).catch(() => {
      toast.error("Failed to load listing request");
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleAccept(proposalId: string) {
    if (!window.confirm("Accept this agent's proposal? All other proposals will be declined.")) return;
    setAccepting(proposalId);
    try {
      await listingService.acceptProposal(proposalId);
      toast.success("Proposal accepted — the agent has been notified.");
      const [req, props] = await Promise.all([
        listingService.getBidRequest(id!),
        listingService.getProposalsForRequest(id!),
      ]);
      setRequest(req);
      setProposals(props);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to accept proposal");
    } finally {
      setAccepting(null);
    }
  }

  // 9.4.5 — contract upload (mock: no real file, just confirm)
  async function handleUploadContract() {
    setUploading(true);
    try {
      await listingService.uploadContract(id!, "listing-agreement.pdf");
      setUploadDone(true);
      toast.success("Listing agreement uploaded.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // 9.4.6 — submit counter
  async function handleCounter(proposalId: string, e: React.FormEvent) {
    e.preventDefault();
    const bps = parseInt(counterBps, 10);
    if (!bps || bps <= 0) { toast.error("Enter a valid commission rate"); return; }
    try {
      const counter = await listingService.counterProposal(proposalId, {
        commissionBps: bps,
        notes:         counterNotes,
      });
      setCountersMap((m) => ({ ...m, [proposalId]: [...(m[proposalId] ?? []), counter] }));
      setCounteringId(null);
      toast.success("Counter offer sent to agent.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send counter");
    }
  }

  // 9.5.1 — mark milestone complete
  async function handleMarkMilestone(key: string) {
    try {
      const updated = await listingService.updateMilestone(id!, key as any, "homeowner");
      setMilestones(updated.milestones ?? milestones);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update milestone");
    }
  }

  // 9.5.2 — log an offer
  async function handleLogOffer(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(offerAmount) * 100);
    if (!cents || cents <= 0) { toast.error("Enter a valid offer amount"); return; }
    try {
      const entry = await listingService.logOffer(id!, {
        offerAmountCents: cents,
        contingencies:    offerConts,
        closeDate:        offerDate,
      });
      setOffers((prev) => [...prev, entry]);
      setOfferAmount(""); setOfferDate(""); setOfferConts([]);
      toast.success("Offer logged.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to log offer");
    }
  }

  function toggleContingency(val: string) {
    setOfferConts((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);
  }

  // 9.5.3 — record final sale
  async function handleLogClose(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(finalPrice) * 100);
    if (!cents || cents <= 0) { toast.error("Enter a valid sale price"); return; }
    const ms = finalDate ? new Date(finalDate).getTime() : Date.now();
    try {
      const close = await listingService.logClose(id!, { finalSalePriceCents: cents, actualCloseDateMs: ms });
      setCloseData(close);
      toast.success("Final sale price recorded.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record sale");
    }
  }

  // 9.5.4 — log agent performance
  async function handleLogPerformance(e: React.FormEvent) {
    e.preventDefault();
    const bps = parseInt(chargedBps, 10);
    if (!bps || bps <= 0) { toast.error("Enter a valid commission rate"); return; }
    try {
      const rec = await listingService.logAgentPerformance(id!, { chargedCommBps: bps });
      setPerfRecord(rec);
      toast.success("Agent performance recorded — thank you.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to log performance");
    }
  }

  const sealed = request ? !isDeadlinePassed(request.bidDeadline) : false;

  // 9.4.3 — HomeGentic premium potential from snapshot
  const premiumRange = request?.propertySnapshot
    ? premiumEstimate(request.propertySnapshot.score)
    : null;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight,
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "2rem",
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        {loading && (
          <p style={{ fontFamily: S.mono, color: S.inkLight }}>Loading…</p>
        )}

        {!loading && !request && (
          <p style={{ fontFamily: S.sans, color: S.inkLight }}>Listing request not found.</p>
        )}

        {!loading && request && (
          <>
            {/* Heading */}
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", color: S.ink, margin: "0 0 0.3rem" }}>
              Listing Request
            </h1>
            <p style={{ fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 2rem" }}>
              {request.propertyId} · Status: {request.status} · Deadline: {formatDate(request.bidDeadline)}
            </p>

            {/* Request summary */}
            <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              {request.desiredSalePrice && (
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Desired Price</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>{formatPrice(request.desiredSalePrice)}</div>
                </div>
              )}
              {request.notes && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Notes</div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{request.notes}</div>
                </div>
              )}
            </div>

            {/* Property snapshot — 9.2.3 */}
            {request.propertySnapshot && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.5rem", marginBottom: "1.5rem", background: "#fafafa" }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  HomeGentic Snapshot (at request creation)
                </div>
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Score</div>
                    <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>{request.propertySnapshot.score}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Verified Jobs</div>
                    <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>{request.propertySnapshot.verifiedJobCount}</div>
                  </div>
                  {/* 9.4.3 — premium potential */}
                  {premiumRange && (
                    <div>
                      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Estimated Premium Potential</div>
                      <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.sage }}>
                        ${premiumRange.low.toLocaleString()} – ${premiumRange.high.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 9.4.5 — Contract upload (only after Awarded) */}
            {request.status === "Awarded" && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Signed Agreement
                </div>
                {request.contractFile || uploadDone ? (
                  <p style={{ fontFamily: S.mono, fontSize: "0.8rem", color: "#188038" }}>
                    ✓ Contract uploaded: {request.contractFile?.name ?? "listing-agreement.pdf"}
                  </p>
                ) : (
                  <Button
                    onClick={handleUploadContract}
                    disabled={uploading}
                    aria-label="Upload Contract"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <Upload size={13} />
                    {uploading ? "Uploading…" : "Attach File"}
                  </Button>
                )}
              </div>
            )}

            {/* 9.5.1 — Transaction Timeline (Awarded requests) */}
            {request.status === "Awarded" && (
              <div
                role="region"
                aria-label="Transaction Timeline"
                style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}
              >
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 1rem" }}>
                  Transaction Timeline
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {MILESTONE_STEPS.map((step) => {
                    const ms = milestones.find((m) => m.key === step.key);
                    const done = !!ms?.completedAt;
                    return (
                      <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0", borderBottom: `1px solid ${S.rule}` }}>
                        <div style={{ width: 16, height: 16, border: `2px solid ${done ? S.sage : S.rule}`, background: done ? S.sage : "transparent", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontFamily: S.sans, fontSize: "0.875rem", color: done ? S.inkLight : S.ink }}>
                            {step.label}
                          </span>
                          {done && ms?.completedAt && (
                            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, marginLeft: "0.5rem" }}>
                              {new Date(ms.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                        </div>
                        {!done && (
                          <button
                            onClick={() => handleMarkMilestone(step.key)}
                            aria-label={`Mark ${step.label} complete`}
                            style={{ background: "none", border: `1px solid ${S.rule}`, cursor: "pointer", fontFamily: S.mono, fontSize: "0.65rem", color: S.ink, padding: "0.25rem 0.6rem", letterSpacing: "0.04em", textTransform: "uppercase" }}
                          >
                            Mark Done
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 9.5.2 — Offer Log */}
            {request.status === "Awarded" && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 1rem" }}>
                  Offers Received
                </h2>
                {/* Existing offers */}
                {offers.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    {offers.map((offer) => (
                      <div key={offer.id} style={{ border: `1px solid ${S.rule}`, padding: "0.75rem 1rem", marginBottom: "0.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Offer Amount</div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink }}>{formatPrice(offer.offerAmountCents)}</div>
                        </div>
                        {offer.deltaFromListingPriceCents !== null && (
                          <div>
                            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>vs. List Price</div>
                            <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: offer.deltaFromListingPriceCents >= 0 ? "#188038" : "#c0392b" }}>
                              {offer.deltaFromListingPriceCents >= 0 ? "+" : ""}{formatPrice(offer.deltaFromListingPriceCents)}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Close Date</div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{offer.closeDate}</div>
                        </div>
                        {offer.contingencies.length > 0 && (
                          <div>
                            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Contingencies</div>
                            <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.ink }}>{offer.contingencies.join(", ")}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Log offer form */}
                <form aria-label="Log offer" onSubmit={handleLogOffer} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label htmlFor="offer-amount" style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                        Offer Amount ($)
                      </label>
                      <input
                        id="offer-amount"
                        aria-label="Offer Amount"
                        type="number"
                        min="1"
                        step="1000"
                        placeholder="e.g. 505000"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label htmlFor="offer-close-date" style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                        Close Date
                      </label>
                      <input
                        id="offer-close-date"
                        aria-label="Close Date"
                        type="date"
                        value={offerDate}
                        onChange={(e) => setOfferDate(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: S.sans, fontSize: "0.875rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={offerConts.includes("financing")} onChange={() => toggleContingency("financing")} aria-label="Financing contingency" />
                      Financing
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: S.sans, fontSize: "0.875rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={offerConts.includes("inspection")} onChange={() => toggleContingency("inspection")} aria-label="Inspection contingency" />
                      Inspection
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: S.sans, fontSize: "0.875rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={offerConts.includes("sale_of_home")} onChange={() => toggleContingency("sale_of_home")} aria-label="Sale of home contingency" />
                      Sale of Home
                    </label>
                  </div>
                  <Button type="submit" style={{ alignSelf: "flex-start" }}>Log Offer</Button>
                </form>
              </div>
            )}

            {/* 9.5.3 — Final Sale Price */}
            {request.status === "Awarded" && !closeData && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 1rem" }}>
                  Record Final Sale
                </h2>
                <form aria-label="Record final sale" onSubmit={handleLogClose} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label htmlFor="final-sale-price" style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                        Final Sale Price ($)
                      </label>
                      <input
                        id="final-sale-price"
                        aria-label="Final Sale Price"
                        type="number"
                        min="1"
                        step="1000"
                        placeholder="e.g. 518000"
                        value={finalPrice}
                        onChange={(e) => setFinalPrice(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label htmlFor="actual-close-date" style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                        Actual Close Date
                      </label>
                      <input
                        id="actual-close-date"
                        aria-label="Actual Close Date"
                        type="date"
                        value={finalDate}
                        onChange={(e) => setFinalDate(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                  <Button type="submit" style={{ alignSelf: "flex-start" }}>Save Close</Button>
                </form>
              </div>
            )}

            {/* 9.5.3 — Closed summary */}
            {closeData && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  Transaction Closed
                </div>
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Final Sale Price</div>
                    <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>{formatPrice(closeData.finalSalePriceCents)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Actual HomeGentic Premium</div>
                    <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.sage }}>{formatPrice(closeData.actualPremiumCents)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 9.5.4 — Agent performance logging (after close, before rating submitted) */}
            {closeData && !perfRecord && proposals.some((p) => p.status === "Accepted") && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 0.5rem" }}>
                  Rate This Transaction
                </h2>
                <form aria-label="Agent performance" onSubmit={handleLogPerformance} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <label htmlFor="charged-commission" style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                      Bps Charged
                    </label>
                    <input
                      id="charged-commission"
                      aria-label="Commission Charged"
                      type="number"
                      min="1"
                      max="1000"
                      value={chargedBps}
                      onChange={(e) => setChargedBps(e.target.value)}
                      style={{ width: "12rem", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono }}
                    />
                  </div>
                  <Button type="submit" style={{ alignSelf: "flex-start" }}>Submit Rating</Button>
                </form>
              </div>
            )}

            {/* Sealed state */}
            {sealed && (
              <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
                <Lock size={20} color={S.inkLight} />
                <div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink }}>
                    Proposals are sealed until the deadline passes
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginTop: "0.2rem" }}>
                    Deadline: {formatDate(request.bidDeadline)} — proposals hidden until then to ensure fair bidding
                  </div>
                </div>
              </div>
            )}

            {/* Proposals */}
            {!sealed && (
              <>
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", color: S.ink, margin: "0 0 1rem" }}>
                  {proposals.length === 0 ? "No proposals yet" : `${proposals.length} Proposal${proposals.length !== 1 ? "s" : ""} Received`}
                </h2>

                {proposals.map((p) => {
                  const netProceeds = request.desiredSalePrice
                    ? computeNetProceeds(request.desiredSalePrice, p.commissionBps, CLOSING_COST_BPS)
                    : computeNetProceeds(p.estimatedSalePrice, p.commissionBps, CLOSING_COST_BPS);

                  // 9.4.3
                  const priceBadge  = priceContextBadge(p.estimatedSalePrice, request.desiredSalePrice);
                  const proposalCounters = countersMap[p.id] ?? [];
                  const latestCounter   = proposalCounters[proposalCounters.length - 1];

                  return (
                    <div key={p.id} style={{ border: `1px solid ${p.status === "Accepted" ? S.sage : S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1rem", position: "relative" }}>
                      {p.status === "Accepted" && (
                        <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: S.mono, fontSize: "0.65rem", color: S.sage, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          <CheckCircle2 size={12} /> Accepted
                        </div>
                      )}

                      <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, marginBottom: "0.15rem" }}>{p.agentName}</div>
                      <div style={{ fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight, letterSpacing: "0.04em", marginBottom: "0.75rem" }}>{p.agentBrokerage}</div>

                      {/* Key metrics */}
                      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Commission</div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>{formatCommission(p.commissionBps)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Est. Net Proceeds</div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>{formatPrice(netProceeds)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Est. Sale Price</div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>{formatPrice(p.estimatedSalePrice)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Est. Days on Market</div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <Clock size={13} /> {p.estimatedDaysOnMarket}d
                          </div>
                        </div>
                      </div>

                      {/* 9.4.3 — Price context badge */}
                      <div style={{ marginBottom: "0.75rem" }}>
                        <span style={{ fontFamily: S.mono, fontSize: "0.68rem", color: priceBadge.color, letterSpacing: "0.04em" }}>
                          {priceBadge.label}
                        </span>
                      </div>

                      {/* CMA summary shown only via structured comps table below */}
                      {p.marketingPlan && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Marketing Plan</div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{p.marketingPlan}</div>
                        </div>
                      )}
                      {p.includedServices.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Included Services</div>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {p.includedServices.map((svc) => (
                              <span key={svc} style={{ fontFamily: S.mono, fontSize: "0.68rem", color: S.ink, border: `1px solid ${S.rule}`, padding: "0.2rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{svc}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 9.3.4 — CMA comps table */}
                      {p.cmaComps && p.cmaComps.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Comparable Sales</div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.mono, fontSize: "0.72rem" }}>
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
                                  {["Address", "Sale Price", "Bed", "Bath", "Sqft", "Sold"].map((h) => (
                                    <th key={h} style={{ textAlign: "left", padding: "0.3rem 0.5rem", color: S.inkLight, fontWeight: 500 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {p.cmaComps.map((c, i) => (
                                  <tr key={i} style={{ borderBottom: `1px solid ${S.rule}` }}>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{c.address}</td>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{formatPrice(c.salePriceCents)}</td>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{c.bedrooms}</td>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{c.bathrooms}</td>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{c.sqft.toLocaleString()}</td>
                                    <td style={{ padding: "0.3rem 0.5rem", color: S.ink }}>{c.soldDate}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {p.coverLetter && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Cover Letter</div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink, fontStyle: "italic" }}>{p.coverLetter}</div>
                        </div>
                      )}

                      {/* 9.4.6 — Counter display */}
                      {latestCounter && (
                        <div style={{ border: `1px solid ${S.rule}`, padding: "0.75rem 1rem", marginBottom: "0.75rem", background: "#fffbf0", fontFamily: S.mono, fontSize: "0.875rem", color: S.ink }}>
                          {`Counter Offer — ${latestCounter.status}: ${formatCommission(latestCounter.commissionBps)}${latestCounter.notes ? ` · "${latestCounter.notes}"` : ""}`}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
                        {request.status === "Open" && p.status === "Pending" && (
                          <>
                            <Button onClick={() => handleAccept(p.id)} disabled={accepting === p.id}>
                              {accepting === p.id ? "Accepting…" : "Accept This Agent"}
                            </Button>

                            {/* 9.4.6 — Counter button */}
                            {!latestCounter && counteringId !== p.id && (
                              <button
                                onClick={() => { setCounteringId(p.id); setCounterBps(String(Math.round(p.commissionBps * 0.9))); setCounterNotes(""); }}
                                style={{ background: "none", border: `1px solid ${S.rule}`, cursor: "pointer", fontFamily: S.mono, fontSize: "0.72rem", color: S.ink, letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.5rem 1rem" }}
                              >
                                Counter
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* 9.4.6 — Counter form */}
                      {counteringId === p.id && (
                        <form
                          aria-label="Counter offer"
                          onSubmit={(e) => handleCounter(p.id, e)}
                          style={{ marginTop: "1rem", borderTop: `1px solid ${S.rule}`, paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
                        >
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.9rem", color: S.ink }}>
                            Counter Offer
                          </div>
                          <label htmlFor={`counter-bps-${p.id}`} style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
                            Counter Commission (basis points)
                            <input
                              id={`counter-bps-${p.id}`}
                              aria-label="Counter commission"
                              type="number"
                              min="1"
                              max="1000"
                              value={counterBps}
                              onChange={(e) => setCounterBps(e.target.value)}
                              style={{ display: "block", width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, marginTop: 4 }}
                            />
                          </label>
                          <label htmlFor={`counter-notes-${p.id}`} style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
                            Message (optional)
                            <input
                              id={`counter-notes-${p.id}`}
                              type="text"
                              value={counterNotes}
                              onChange={(e) => setCounterNotes(e.target.value)}
                              placeholder="e.g. Can you match 2.25%?"
                              style={{ display: "block", width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, marginTop: 4 }}
                            />
                          </label>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Button type="submit">
                              <RefreshCw size={12} style={{ marginRight: 4 }} />
                              Send Counter
                            </Button>
                            <button type="button" onClick={() => setCounteringId(null)} style={{ background: "none", border: `1px solid ${S.rule}`, cursor: "pointer", fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight, padding: "0.5rem 1rem" }}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
