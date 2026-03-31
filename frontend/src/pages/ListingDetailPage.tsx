/**
 * ListingDetailPage — Epic 9.4
 * Homeowner views submitted proposals, compares side-by-side, and accepts one.
 * 9.4.3 — HomeFax score context per proposal
 * 9.4.5 — Post-selection contract upload
 * 9.4.6 — Counter-proposal flow
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
  type ListingBidRequest,
  type ListingProposal,
  type CounterProposal,
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

  useEffect(() => {
    if (!id) return;
    Promise.all([
      listingService.getBidRequest(id),
      listingService.getProposalsForRequest(id),
    ]).then(async ([req, props]) => {
      setRequest(req);
      setProposals(props);
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

  const sealed = request ? !isDeadlinePassed(request.bidDeadline) : false;

  // 9.4.3 — HomeFax premium potential from snapshot
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
                  HomeFax Snapshot (at request creation)
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
                      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>HomeFax Premium Potential</div>
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
