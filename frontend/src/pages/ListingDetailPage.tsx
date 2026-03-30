/**
 * ListingDetailPage — Epic 9.4
 * Homeowner views submitted proposals, compares side-by-side, and accepts one.
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle2, TrendingUp, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import {
  listingService,
  computeNetProceeds,
  formatCommission,
  isDeadlinePassed,
  type ListingBidRequest,
  type ListingProposal,
} from "@/services/listing";
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

const CLOSING_COST_BPS = 200; // 2% estimated closing costs

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ListingDetailPage() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();

  const [request,   setRequest]   = useState<ListingBidRequest | null>(null);
  const [proposals, setProposals] = useState<ListingProposal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      listingService.getBidRequest(id),
      listingService.getProposalsForRequest(id),
    ]).then(([req, props]) => {
      setRequest(req);
      setProposals(props);
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
      // Refresh
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

  const sealed = request ? !isDeadlinePassed(request.bidDeadline) : false;

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

            {/* Request summary card */}
            <div style={{
              border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem",
              marginBottom: "2rem", display: "flex", gap: "2rem", flexWrap: "wrap",
            }}>
              {request.desiredSalePrice && (
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Desired Price
                  </div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>
                    {formatPrice(request.desiredSalePrice)}
                  </div>
                </div>
              )}
              {request.notes && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Notes
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{request.notes}</div>
                </div>
              )}
            </div>

            {/* Sealed state */}
            {sealed && (
              <div style={{
                border: `1px solid ${S.rule}`, padding: "1.5rem",
                display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem",
              }}>
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

                  return (
                    <div
                      key={p.id}
                      style={{
                        border: `1px solid ${p.status === "Accepted" ? S.sage : S.rule}`,
                        padding: "1.25rem 1.5rem",
                        marginBottom: "1rem",
                        position: "relative",
                      }}
                    >
                      {p.status === "Accepted" && (
                        <div style={{
                          position: "absolute", top: "0.75rem", right: "0.75rem",
                          display: "flex", alignItems: "center", gap: "0.3rem",
                          fontFamily: S.mono, fontSize: "0.65rem", color: S.sage,
                          letterSpacing: "0.06em", textTransform: "uppercase",
                        }}>
                          <CheckCircle2 size={12} /> Accepted
                        </div>
                      )}

                      {/* Agent name + brokerage */}
                      <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, marginBottom: "0.15rem" }}>
                        {p.agentName}
                      </div>
                      <div style={{ fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight, letterSpacing: "0.04em", marginBottom: "1rem" }}>
                        {p.agentBrokerage}
                      </div>

                      {/* Key metrics row */}
                      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Commission
                          </div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>
                            {formatCommission(p.commissionBps)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Estimated Net Proceeds
                          </div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>
                            {formatPrice(netProceeds)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Est. Sale Price
                          </div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink }}>
                            {formatPrice(p.estimatedSalePrice)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Est. Days on Market
                          </div>
                          <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <Clock size={13} /> {p.estimatedDaysOnMarket}d
                          </div>
                        </div>
                      </div>

                      {/* CMA + marketing plan */}
                      {p.cmaSummary && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            CMA Summary
                          </div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{p.cmaSummary}</div>
                        </div>
                      )}
                      {p.marketingPlan && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Marketing Plan
                          </div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>{p.marketingPlan}</div>
                        </div>
                      )}
                      {p.includedServices.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Included Services
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {p.includedServices.map((svc) => (
                              <span key={svc} style={{
                                fontFamily: S.mono, fontSize: "0.68rem", color: S.ink,
                                border: `1px solid ${S.rule}`, padding: "0.2rem 0.5rem",
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}>{svc}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {p.coverLetter && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                            Cover Letter
                          </div>
                          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink, fontStyle: "italic" }}>{p.coverLetter}</div>
                        </div>
                      )}

                      {/* Accept button */}
                      {request.status === "Open" && p.status === "Pending" && (
                        <div style={{ marginTop: "1rem" }}>
                          <Button
                            onClick={() => handleAccept(p.id)}
                            disabled={accepting === p.id}
                          >
                            {accepting === p.id ? "Accepting…" : "Accept This Agent"}
                          </Button>
                        </div>
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
