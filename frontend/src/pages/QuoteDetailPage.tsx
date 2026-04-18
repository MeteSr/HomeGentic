import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { quoteService, QuoteRequest, Quote } from "@/services/quote";
import { contractorService } from "@/services/contractor";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request,            setRequest]            = useState<QuoteRequest | null>(null);
  const [quotes,             setQuotes]             = useState<Quote[]>([]);
  const [contractorNames,    setContractorNames]    = useState<Record<string, string>>({});
  const [contractorScores,   setContractorScores]   = useState<Record<string, number>>({});
  const [contractorVerified, setContractorVerified] = useState<Record<string, boolean>>({});
  const [loading,            setLoading]            = useState(true);
  const [accepting,          setAccepting]          = useState<string | null>(null);
  const [pendingAccept,      setPendingAccept]      = useState<Quote | null>(null);
  const [acceptedQuote,      setAcceptedQuote]      = useState<Quote | null>(null);
  const [showCancelModal,    setShowCancelModal]    = useState(false);
  const [cancelling,         setCancelling]         = useState(false);
  const { principal } = useAuthStore();

  useEffect(() => {
    if (!id) return;
    Promise.all([quoteService.getRequest(id), quoteService.getQuotesForRequest(id)])
      .then(async ([req, qs]) => {
        setRequest(req ?? null);
        setQuotes(qs);
        const names: Record<string, string> = {};
        const scores: Record<string, number> = {};
        const verified: Record<string, boolean> = {};
        await Promise.all(qs.map(async (q) => {
          const profile = await contractorService.getContractor(q.contractor).catch(() => null);
          names[q.contractor]    = profile?.name ?? null!;
          scores[q.contractor]   = profile?.trustScore ?? 0;
          verified[q.contractor] = profile?.isVerified ?? false;
        }));
        setContractorNames(names);
        setContractorScores(scores);
        setContractorVerified(verified);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const lowestAmount  = quotes.length > 0 ? Math.min(...quotes.map((q) => q.amount)) : 0;
  const highestAmount = quotes.length > 0 ? Math.max(...quotes.map((q) => q.amount)) : 0;

  // "Best Value" = best composite of (low price rank + high trust score rank)
  const bestValueId = React.useMemo(() => {
    if (quotes.length < 2) return null;
    const maxAmt   = Math.max(...quotes.map((q) => q.amount));
    const minAmt   = Math.min(...quotes.map((q) => q.amount));
    const maxScore = Math.max(...quotes.map((q) => contractorScores[q.contractor] ?? 0));
    const scored   = quotes.map((q) => {
      const priceRank = maxAmt === minAmt ? 0 : (maxAmt - q.amount) / (maxAmt - minAmt);
      const trustRank = maxScore > 0 ? (contractorScores[q.contractor] ?? 0) / maxScore : 0;
      return { id: q.id, composite: priceRank * 0.55 + trustRank * 0.45 };
    });
    return scored.sort((a, b) => b.composite - a.composite)[0]?.id ?? null;
  }, [quotes, contractorScores]);

  const handleAccept = async () => {
    if (!pendingAccept) return;
    setAccepting(pendingAccept.id);
    try {
      await quoteService.accept(pendingAccept.id);
      setAcceptedQuote(pendingAccept);
      setPendingAccept(null);
      setQuotes((prev) => prev.map((q) => q.id === pendingAccept.id ? { ...q, status: "accepted" } : { ...q, status: q.status === "pending" ? "rejected" : q.status }));
      toast.success("Quote accepted — contractor has been notified.");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept quote");
      setPendingAccept(null);
    } finally {
      setAccepting(null);
    }
  };

  const handleCancel = async () => {
    if (!request) return;
    setCancelling(true);
    try {
      await quoteService.cancel(request.id);
      setRequest((r) => r ? { ...r, status: "cancelled" } : r);
      setShowCancelModal(false);
      toast.success("Request cancelled — contractors who bid have been notified.");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel request");
    } finally {
      setCancelling(false);
    }
  };

  const isOwner = request?.homeowner === (principal ?? "local");
  const canCancel = isOwner && (request?.status === "open" || request?.status === "quoted");

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
          Quotes
        </div>
        <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "1.5rem" }}>
          Quote Responses
        </h1>

        {/* Request summary */}
        {request && (
          <div style={{ border: `1px solid ${request.status === "cancelled" ? "#C94C2E" : UI.rule}`, background: COLORS.white, padding: "1.25rem", marginBottom: "1.5rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                  <p style={{ fontWeight: 500 }}>{request.serviceType}</p>
                  {request.status === "cancelled" && (
                    <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#C94C2E", border: "1px solid #C94C2E40", padding: "0.1rem 0.375rem" }}>
                      Cancelled
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, fontWeight: 300 }}>{request.description}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                <Badge variant={
                  request.urgency === "low" ? "success"
                  : request.urgency === "medium" ? "warning"
                  : "error"
                }>{request.urgency}</Badge>
                {canCancel && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#C94C2E", background: "none", border: "1px solid #C94C2E40", padding: "0.2rem 0.625rem", cursor: "pointer" }}
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Negotiation analysis panel — opt-in required */}
        {quotes.length > 0 && request && (
          <NegotiationPanel
            request={request}
            quotes={quotes}
            zip={(request as any).zip ?? ""}
          />
        )}

        {/* Post-accept success banner */}
        {acceptedQuote && (
          <div style={{ border: `1px solid ${UI.sage}`, background: COLORS.sageLight, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <CheckCircle size={14} color={UI.sage} />
                  <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.sage, fontWeight: 600 }}>
                    Quote Accepted
                  </p>
                </div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, lineHeight: 1.5 }}>
                  {contractorNames[acceptedQuote.contractor] ?? "Contractor"} · ${acceptedQuote.amount.toLocaleString()} · {acceptedQuote.timeline}d timeline
                </p>
              </div>
              <Button
                icon={<CheckCircle size={13} />}
                onClick={() => navigate("/jobs/new", { state: { prefill: {
                  serviceType:    request?.serviceType,
                  contractorName: contractorNames[acceptedQuote.contractor],
                  amount:         String((acceptedQuote.amount / 100).toFixed(2)),
                } }})}
                size="sm"
              >
                Log This Job
              </Button>
            </div>
          </div>
        )}

        {/* Quotes */}
        {quotes.length === 0 ? (
          <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
            <Clock size={36} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: UI.serif, fontWeight: 700, marginBottom: "0.375rem" }}>Waiting for quotes</p>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
              Typically receive 2–5 quotes within 24 hours.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Bid comparison summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${UI.rule}`, borderLeft: `1px solid ${UI.rule}` }}>
              {[
                { label: "Bids Received",  value: String(quotes.length) },
                { label: "Bid Range",      value: lowestAmount === highestAmount ? `$${lowestAmount.toLocaleString()}` : `$${lowestAmount.toLocaleString()} – $${highestAmount.toLocaleString()}` },
                { label: "Spread",         value: lowestAmount === highestAmount ? "—" : `$${(highestAmount - lowestAmount).toLocaleString()}` },
              ].map((s) => (
                <div key={s.label} style={{ padding: "0.875rem 1rem", borderRight: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}`, background: COLORS.white }}>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.375rem" }}>{s.label}</div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.125rem", lineHeight: 1 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {quotes
              .sort((a, b) => a.amount - b.amount)
              .map((quote) => {
                const isLowest    = quote.amount === lowestAmount;
                const isBestValue = quote.id === bestValueId;
                const trustScore  = contractorScores[quote.contractor] ?? 0;
                const isVerified  = contractorVerified[quote.contractor] ?? false;
                const label       = isBestValue ? "Best Value" : isLowest ? "Lowest Quote" : null;
                const labelColor  = isBestValue ? COLORS.plum : UI.sage;
                const borderColor = isBestValue ? COLORS.plum : isLowest ? UI.sage : UI.rule;

                return (
                  <div key={quote.id} style={{ border: `1px solid ${borderColor}`, background: COLORS.white, padding: "1.25rem", position: "relative", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
                    {label && (
                      <div style={{
                        position: "absolute", top: "-1px", left: "1rem",
                        background: labelColor, color: COLORS.white,
                        fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        padding: "0.2rem 0.625rem",
                      }}>
                        {label}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", marginTop: label ? "0.75rem" : 0 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <p style={{ fontWeight: 500 }}>
                            {contractorNames[quote.contractor] ?? `${quote.contractor.slice(0, 10)}…`}
                          </p>
                          {isVerified && (
                            <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.1rem 0.375rem" }}>
                              ✓ Verified
                            </span>
                          )}
                        </div>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                          <Clock size={11} style={{ display: "inline", marginRight: "0.25rem" }} />
                          {quote.timeline} day{quote.timeline !== 1 ? "s" : ""} to complete
                        </p>
                        {trustScore > 0 && (
                          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.25rem" }}>
                            Trust Score: <strong style={{ color: UI.ink }}>{trustScore}/100</strong>
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: isBestValue ? COLORS.plum : isLowest ? UI.sage : UI.ink }}>
                          ${quote.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {quote.status === "accepted" ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.625rem", border: `1px solid ${UI.sage}`, color: UI.sage, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        <CheckCircle size={13} /> Accepted
                      </div>
                    ) : quote.status === "rejected" ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0.625rem", color: UI.inkLight, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.5 }}>
                        Not selected
                      </div>
                    ) : request?.status === "cancelled" ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.625rem", color: "#C94C2E", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6 }}>
                        <XCircle size={13} /> Request cancelled
                      </div>
                    ) : (
                      <Button
                        loading={accepting === quote.id}
                        onClick={() => setPendingAccept(quote)}
                        variant={isBestValue || isLowest ? "primary" : "outline"}
                        icon={<CheckCircle size={14} />}
                        style={{ width: "100%" }}
                      >
                        Accept This Quote
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div
          onClick={() => setShowCancelModal(false)}
          style={{ position: "fixed", inset: 0, background: `rgba(46,37,64,0.6)`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1.5rem" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: COLORS.white, border: `1px solid #C94C2E40`, maxWidth: "28rem", width: "100%", padding: "0", borderRadius: RADIUS.card, boxShadow: SHADOWS.modal }}
          >
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${UI.rule}`, background: UI.paper }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#C94C2E", fontWeight: 600 }}>
                Cancel quote request
              </p>
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, lineHeight: 1.6 }}>
                This will cancel the request and notify any contractors who have already submitted bids. This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <Button
                  loading={cancelling}
                  onClick={handleCancel}
                  icon={<XCircle size={13} />}
                  style={{ flex: 1, background: "#C94C2E", borderColor: "#C94C2E" }}
                >
                  Confirm Cancel
                </Button>
                <button
                  onClick={() => setShowCancelModal(false)}
                  style={{ padding: "0.5rem 1.25rem", border: `1px solid ${UI.rule}`, background: "none", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
                >
                  Keep Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accept quote confirmation modal */}
      {pendingAccept && (
        <div
          onClick={() => setPendingAccept(null)}
          style={{ position: "fixed", inset: 0, background: `rgba(46,37,64,0.6)`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1.5rem" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: COLORS.white, border: `1px solid ${UI.rule}`, maxWidth: "28rem", width: "100%", padding: "0", borderRadius: RADIUS.card, boxShadow: SHADOWS.modal }}
          >
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${UI.rule}`, background: UI.paper }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink, fontWeight: 600 }}>
                Confirm acceptance
              </p>
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${UI.rule}`, borderLeft: `1px solid ${UI.rule}` }}>
                {[
                  { label: "Contractor",  value: contractorNames[pendingAccept.contractor] ?? "—" },
                  { label: "Amount",      value: `$${pendingAccept.amount.toLocaleString()}` },
                  { label: "Timeline",    value: `${pendingAccept.timeline}d` },
                ].map((r) => (
                  <div key={r.label} style={{ padding: "0.75rem", borderRight: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}` }}>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.25rem" }}>{r.label}</p>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</p>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, lineHeight: 1.5 }}>
                Accepting this quote closes the request and notifies the contractor. Other bids will be marked as not selected.
              </p>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <Button
                  loading={!!accepting}
                  onClick={handleAccept}
                  icon={<CheckCircle size={13} />}
                  style={{ flex: 1 }}
                >
                  Confirm Accept
                </Button>
                <button
                  onClick={() => setPendingAccept(null)}
                  style={{ padding: "0.5rem 1.25rem", border: `1px solid ${UI.rule}`, background: "none", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
