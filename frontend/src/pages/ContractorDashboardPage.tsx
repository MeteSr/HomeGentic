import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Star, Zap, Clock, ChevronDown, ChevronUp, X, Send, UserCog, PenLine, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { contractorService, ContractorProfile } from "@/services/contractor";
import { quoteService, QuoteRequest, Quote } from "@/services/quote";
import { jobService, Job } from "@/services/job";
import { useAuthStore } from "@/store/authStore";
import { isNewSince, countNew } from "@/services/notifications";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  amber:    COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const URGENCY_COLOR: Record<string, string> = {
  emergency: UI.rust, high: UI.amber, medium: UI.inkLight, low: UI.sage,
};

const URGENCY_BG: Record<string, string> = {
  emergency: COLORS.blush, high: COLORS.butter, medium: UI.paper, low: COLORS.sageLight,
};

function urgencyVariant(u: string): "error" | "warning" | "default" | "success" {
  if (u === "emergency") return "error";
  if (u === "high")      return "warning";
  if (u === "low")       return "success";
  return "default";
}

// ─── Submit Quote Modal ───────────────────────────────────────────────────────

interface SubmitModalProps {
  request: QuoteRequest;
  onSubmit: (requestId: string, amountCents: number, days: number, validUntilMs: number) => Promise<void>;
  onClose: () => void;
}

function SubmitQuoteModal({ request, onSubmit, onClose }: SubmitModalProps) {
  const [amount,   setAmount]   = useState("");
  const [timeline, setTimeline] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [loading,  setLoading]  = useState(false);

  const canSubmit = amount && parseFloat(amount) > 0 && timeline && parseInt(timeline) > 0;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const amountCents  = Math.round(parseFloat(amount) * 100);
      const days         = parseInt(timeline);
      const validUntilMs = Date.now() + parseInt(validDays) * 86_400_000;
      await onSubmit(request.id, amountCents, days, validUntilMs);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit quote");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}
      onClick={onClose}
    >
      <div
        style={{ background: COLORS.white, padding: "1.5rem", maxWidth: "28rem", width: "100%", border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card, boxShadow: SHADOWS.modal }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.25rem" }}>
              Submit Quote — {request.id}
            </p>
            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{request.serviceType}</p>
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.2rem", lineHeight: 1.5 }}>
              {request.description.length > 100 ? request.description.slice(0, 100) + "…" : request.description}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, flexShrink: 0, marginLeft: "0.75rem" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="form-label">Your Price ($) *</label>
              <input
                type="number" min="1" step="0.01" placeholder="e.g. 850"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Timeline (days) *</label>
              <input
                type="number" min="1" placeholder="e.g. 3"
                value={timeline} onChange={(e) => setTimeline(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Quote valid for</label>
            <select value={validDays} onChange={(e) => setValidDays(e.target.value)} className="form-input">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "0.6rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: UI.inkLight }}
          >
            Cancel
          </button>
          <Button
            loading={loading}
            disabled={!canSubmit}
            onClick={handleSubmit}
            icon={<Send size={13} />}
            style={{ flex: 2 }}
          >
            Send Quote
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

interface LeadCardProps {
  request: QuoteRequest;
  alreadyQuoted: boolean;
  isNew: boolean;
  onQuote: (r: QuoteRequest) => void;
}

function LeadCard({ request, alreadyQuoted, isNew, onQuote }: LeadCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = URGENCY_COLOR[request.urgency] ?? UI.inkLight;
  const bg    = URGENCY_BG[request.urgency]    ?? UI.paper;

  return (
    <div style={{
      border: `1px solid ${request.urgency === "emergency" ? UI.rust : UI.rule}`,
      background: request.urgency === "emergency" ? COLORS.blush : COLORS.white,
      borderRadius: RADIUS.sm, boxShadow: SHADOWS.card,
    }}>
      {/* Summary row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem", cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Urgency stripe */}
        <div style={{ width: "3px", alignSelf: "stretch", background: color, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{request.serviceType}</span>
            <Badge variant={urgencyVariant(request.urgency)} size="sm">{request.urgency}</Badge>
            {isNew && (
              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust, border: `1px solid ${UI.rust}`, padding: "0.1rem 0.4rem" }}>
                New
              </span>
            )}
            {request.status === "quoted" && (
              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.1rem 0.4rem" }}>
                Quotes received
              </span>
            )}
          </div>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {request.description}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
            {timeAgo(request.createdAt)}
          </span>
          {expanded ? <ChevronUp size={13} color={UI.inkLight} /> : <ChevronDown size={13} color={UI.inkLight} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", background: bg }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.ink, lineHeight: 1.7, marginBottom: "1rem" }}>
            {request.description}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginBottom: "1rem" }}>
            <span>Request ID: <strong style={{ color: UI.ink }}>{request.id}</strong></span>
          </div>
          {alreadyQuoted ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${UI.sage}`, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage }}>
              Quote submitted
            </div>
          ) : (
            <Button
              onClick={(e) => { e.stopPropagation(); onQuote(request); }}
              icon={<Send size={13} />}
            >
              Submit Quote
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const SERVICE_TYPES = ["All", "HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"];

export default function ContractorDashboardPage() {
  const navigate        = useNavigate();
  const { lastLoginAt } = useAuthStore();
  const [profile,       setProfile]       = useState<ContractorProfile | null>(null);
  const [openRequests,  setOpenRequests]  = useState<QuoteRequest[]>([]);
  const [pendingJobs,   setPendingJobs]   = useState<Job[]>([]);
  const [myBids,        setMyBids]        = useState<Quote[]>([]);
  const [signingJobId,  setSigningJobId]  = useState<string | null>(null);
  const [verifiedAnim,  setVerifiedAnim]  = useState(false);
  const [submittedIds,  setSubmittedIds]  = useState<Set<string>>(new Set());
  const [filterType,    setFilterType]    = useState("All");
  const [modalRequest,  setModalRequest]  = useState<QuoteRequest | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    Promise.all([
      contractorService.getMyProfile().then(setProfile).catch((e) => console.error("[ContractorDashboard] profile load failed:", e)),
      quoteService.getOpenRequests().then(setOpenRequests).catch((e) => console.error("[ContractorDashboard] open requests load failed:", e)),
      jobService.getJobsPendingMySignature().then(setPendingJobs).catch((e) => console.error("[ContractorDashboard] pending jobs load failed:", e)),
      quoteService.getMyBids().then(setMyBids).catch((e) => console.error("[ContractorDashboard] my bids load failed:", e)),
    ]).finally(() => setLoading(false));
  }, []);

  // When "All" is selected, show only requests matching the contractor's specialties.
  // A manually-chosen filter chip narrows to that specific type.
  const filtered = (() => {
    if (filterType !== "All") return openRequests.filter((r) => r.serviceType === filterType);
    if (profile?.specialties?.length) {
      return openRequests.filter((r) => profile.specialties.includes(r.serviceType));
    }
    return openRequests;
  })();

  // Sort: emergency first, then by recency
  const urgencyRank: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...filtered].sort((a, b) => {
    const uDiff = (urgencyRank[a.urgency] ?? 4) - (urgencyRank[b.urgency] ?? 4);
    if (uDiff !== 0) return uDiff;
    return b.createdAt - a.createdAt;
  });

  const handleSubmitQuote = async (requestId: string, amountCents: number, days: number, validUntilMs: number) => {
    await quoteService.submitQuote(requestId, amountCents, days, validUntilMs);
    setSubmittedIds((prev) => new Set(prev).add(requestId));
    toast.success("Quote sent to homeowner!");
  };

  const handleSignJob = async (jobId: string) => {
    setSigningJobId(jobId);
    try {
      await jobService.verifyJob(jobId);
      setPendingJobs((prev) => prev.filter((j) => j.id !== jobId));
      setVerifiedAnim(true);
      setTimeout(() => setVerifiedAnim(false), 2800);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign job");
    } finally {
      setSigningJobId(null);
    }
  };

  const newLeadsCount   = openRequests.filter((r) => !submittedIds.has(r.id)).length;
  const newSinceLogin   = countNew(openRequests, lastLoginAt);

  const resolvedBids = myBids.filter((b) => b.status === "accepted" || b.status === "rejected");
  const wonBids      = myBids.filter((b) => b.status === "accepted");
  const winRate      = resolvedBids.length > 0 ? Math.round((wonBids.length / resolvedBids.length) * 100) : null;

  return (
    <Layout>
      {/* Job verified celebration overlay */}
      {verifiedAnim && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `rgba(46,37,64,0.45)`, pointerEvents: "none",
        }}>
          <div style={{
            background: UI.paper, border: `2px solid ${UI.sage}`, padding: "2.5rem 3rem",
            textAlign: "center", maxWidth: "22rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.modal,
          }}>
            <CheckCircle2 size={36} color={UI.sage} style={{ marginBottom: "0.75rem" }} />
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.3rem" }}>
              Record Locked On-Chain
            </p>
            <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.4rem", lineHeight: 1.1 }}>
              Job Verified
            </p>
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.5rem" }}>
              The homeowner's HomeGentic Score has been updated.
            </p>
          </div>
        </div>
      )}
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
              Overview
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
              Contractor Dashboard
            </h1>
            {profile?.name && (
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.375rem" }}>
                {profile.name}{profile.specialties?.length ? " · " + profile.specialties.join(", ") : ""}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => navigate("/contractor/profile")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
            >
              <UserCog size={12} /> {profile ? "Edit Profile" : "Set Up Profile"}
            </button>
            {newLeadsCount > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${UI.rust}`, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.rust, background: COLORS.blush }}>
                <Zap size={12} /> {newLeadsCount} open lead{newLeadsCount !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Profile setup banner */}
        {!loading && !profile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", border: `1px solid ${UI.rust}`, background: COLORS.blush, padding: "1rem 1.25rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.2rem" }}>Profile incomplete</p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>Set up your contractor profile to appear in homeowner searches and receive leads.</p>
            </div>
            <button
              onClick={() => navigate("/contractor/profile")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", background: UI.rust, color: COLORS.white, border: "none", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <UserCog size={12} /> Set up now
            </button>
          </div>
        )}

        {/* Stats */}
        <ResponsiveGrid cols={{ mobile: 2, tablet: 4, desktop: 7 }} style={{ borderTop: `1px solid ${UI.rule}`, borderLeft: `1px solid ${UI.rule}`, marginBottom: "2.5rem" }} gap="0">
          {[
            { label: "Open Leads",         value: loading ? "…" : newLeadsCount },
            { label: "New Since Last Visit", value: loading ? "…" : newSinceLogin, alert: newSinceLogin > 0 },
            { label: "Quotes Submitted",   value: submittedIds.size },
            { label: "Pending Signatures", value: loading ? "…" : pendingJobs.length, alert: pendingJobs.length > 0 },
            { label: "Jobs Completed",     value: profile?.jobsCompleted ?? "—" },
            { label: "Win Rate",           value: winRate !== null ? `${winRate}%` : "—", highlight: winRate !== null && winRate >= 50 },
            { label: "Trust Score",        value: profile ? `${profile.trustScore}/100` : "—", accent: true },
          ].map((stat) => {
            const isAccent    = !!(stat as any).accent;
            const isAlert     = !!(stat as any).alert;
            const isHighlight = !!(stat as any).highlight;
            const bg    = isAccent ? UI.ink : isAlert ? COLORS.blush : isHighlight ? COLORS.sageLight : COLORS.white;
            const color = isAccent ? COLORS.plumMid : isAlert ? UI.rust : isHighlight ? UI.sage : UI.inkLight;
            const valColor = isAccent ? COLORS.white : isAlert ? UI.rust : isHighlight ? UI.sage : UI.ink;
            return (
              <div key={stat.label} style={{ padding: "1.5rem", borderRight: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}`, background: bg }}>
                <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color, marginBottom: "0.625rem" }}>
                  {stat.label}
                </div>
                <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: valColor }}>
                  {stat.value}
                </div>
              </div>
            );
          })}
        </ResponsiveGrid>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: "1.5rem", alignItems: "start" }}>

          {/* Pending Signatures */}
          <div>
            {pendingJobs.length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <PenLine size={12} /> Awaiting your signature ({pendingJobs.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {pendingJobs.map((job) => (
                    <div key={job.id} style={{ background: COLORS.white, padding: "1.25rem", borderLeft: `3px solid ${UI.rust}`, borderRadius: RADIUS.sm, boxShadow: SHADOWS.card }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.125rem" }}>{job.serviceType}</p>
                          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                            {job.date} · ${(job.amount / 100).toLocaleString()}
                          </p>
                          {job.description && (
                            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.375rem", lineHeight: 1.5 }}>
                              {job.description.length > 120 ? job.description.slice(0, 120) + "…" : job.description}
                            </p>
                          )}
                        </div>
                        <Button
                          loading={signingJobId === job.id}
                          onClick={() => handleSignJob(job.id)}
                          icon={<CheckCircle2 size={13} />}
                          size="sm"
                        >
                          Sign Job
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leads feed */}
            {/* Filter bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Open Requests
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {SERVICE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      border: "none", cursor: "pointer",
                      background: filterType === t ? UI.ink : COLORS.white,
                      color:      filterType === t ? COLORS.white : UI.inkLight,
                      borderRadius: RADIUS.sm,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "3rem" }}><div className="spinner-lg" /></div>
            ) : sorted.length === 0 ? (
              <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
                <Briefcase size={32} color={UI.rule} style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ fontFamily: UI.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No open requests</p>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                  {filterType !== "All" ? `No open ${filterType} requests right now.` : "No open requests at the moment."}
                </p>
                {filterType !== "All" && (
                  <button
                    onClick={() => setFilterType("All")}
                    style={{ marginTop: "0.75rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}
                  >
                    Show all trades
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {sorted.map((req) => (
                  <LeadCard
                    key={req.id}
                    request={req}
                    alreadyQuoted={submittedIds.has(req.id)}
                    isNew={isNewSince(req.createdAt, lastLoginAt)}
                    onQuote={setModalRequest}
                  />
                ))}
              </div>
            )}
          {/* Bid History */}
          {myBids.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              <button
                onClick={() => setShowBidHistory((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", background: "none", border: "none", borderBottom: `1px solid ${UI.rule}`, padding: "0.625rem 0", cursor: "pointer", marginBottom: "0.75rem" }}
              >
                <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, flex: 1, textAlign: "left" }}>
                  Bid History ({myBids.length})
                </span>
                {showBidHistory ? <ChevronUp size={13} color={UI.inkLight} /> : <ChevronDown size={13} color={UI.inkLight} />}
              </button>
              {showBidHistory && (
                <div style={{ border: `1px solid ${UI.rule}`, overflow: "hidden", borderRadius: RADIUS.card }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: UI.mono, fontSize: "0.6rem" }}>
                    <thead>
                      <tr style={{ background: UI.paper }}>
                        {["Request ID", "Amount", "Timeline", "Submitted", "Status"].map((h) => (
                          <th key={h} style={{ padding: "0.5rem 0.875rem", textAlign: "left", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, borderBottom: `1px solid ${UI.rule}`, fontWeight: 600 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...myBids].sort((a, b) => b.createdAt - a.createdAt).map((bid, i) => {
                        const statusColor = bid.status === "accepted" ? UI.sage : bid.status === "rejected" ? UI.rust : UI.inkLight;
                        const statusBg    = bid.status === "accepted" ? COLORS.sageLight : bid.status === "rejected" ? COLORS.blush : COLORS.white;
                        return (
                          <tr key={bid.id} style={{ background: i % 2 === 0 ? COLORS.white : UI.paper, borderBottom: `1px solid ${UI.rule}` }}>
                            <td style={{ padding: "0.625rem 0.875rem", color: UI.ink }}>{bid.requestId}</td>
                            <td style={{ padding: "0.625rem 0.875rem", color: UI.ink, fontWeight: 600 }}>${(bid.amount / 100).toLocaleString()}</td>
                            <td style={{ padding: "0.625rem 0.875rem", color: UI.inkLight }}>{bid.timeline}d</td>
                            <td style={{ padding: "0.625rem 0.875rem", color: UI.inkLight }}>{timeAgo(bid.createdAt)}</td>
                            <td style={{ padding: "0.625rem 0.875rem" }}>
                              <span style={{ display: "inline-block", padding: "0.15rem 0.5rem", background: statusBg, color: statusColor, border: `1px solid ${statusColor}40`, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.55rem", fontWeight: 700 }}>
                                {bid.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Sidebar: Trust Score */}
          <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${UI.rule}` }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Trust Score
              </p>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "1.25rem" }}>
                <div style={{
                  width: "4.5rem", height: "4.5rem", border: `3px solid ${UI.rust}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.4rem", lineHeight: 1 }}>
                    {profile?.trustScore ?? "—"}
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: UI.inkLight }}>/100</span>
                </div>
                <div>
                  {profile?.isVerified && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.15rem 0.4rem", marginBottom: "0.375rem" }}>
                      Verified contractor
                    </div>
                  )}
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, lineHeight: 1.5 }}>
                    Score is based on jobs completed, ratings, and response rate.
                  </p>
                </div>
              </div>

              {[
                { label: "Jobs Completed", val: profile?.jobsCompleted ?? 0, max: 200 },
                { label: "Rating",         val: ((profile as any)?.rating ?? 0) * 20, max: 100, display: `${(profile as any)?.rating ?? 0}/5.0` },
                { label: "Response Rate",  val: 94, max: 100, display: "94%" },
                { label: "Win Rate",       val: winRate ?? 0, max: 100, display: winRate !== null ? `${winRate}%` : "—", sage: true },
              ].map((item) => (
                <div key={item.label} style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.3rem" }}>
                    <span>{item.label}</span>
                    <span>{item.display ?? item.val}</span>
                  </div>
                  <div style={{ height: "3px", background: UI.rule }}>
                    <div style={{ height: "3px", background: (item as any).sage ? UI.sage : UI.rust, width: `${Math.min((item.val / item.max) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}

              {profile?.serviceArea && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.5rem" }}>
                  {profile.serviceArea}
                </p>
              )}
              {profile?.bio && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.5rem", lineHeight: 1.6, borderTop: `1px solid ${UI.rule}`, paddingTop: "0.75rem" }}>
                  {profile.bio.length > 120 ? profile.bio.slice(0, 120) + "…" : profile.bio}
                </p>
              )}
              {!profile && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.75rem", lineHeight: 1.6 }}>
                  Complete your contractor profile to start receiving leads.
                </p>
              )}
            </div>

            {/* Tips */}
            <div style={{ borderTop: `1px solid ${UI.rule}`, padding: "1rem 1.25rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
                Tips to win jobs
              </p>
              {[
                { icon: <Clock size={11} />, text: "Respond within 2 hours — fast quotes win." },
                { icon: <Star  size={11} />, text: "Include a brief note with your quote." },
                { icon: <Briefcase size={11} />, text: "Emergency leads pay 30–50% more." },
              ].map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.625rem" }}>
                  <span style={{ color: UI.rust, flexShrink: 0, marginTop: "0.1rem" }}>{tip.icon}</span>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, lineHeight: 1.5 }}>{tip.text}</p>
                </div>
              ))}
            </div>

            {/* Portfolio share link */}
            {profile && (
              <div style={{ borderTop: `1px solid ${UI.rule}`, padding: "1rem 1.25rem" }}>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
                  Credential Portfolio
                </p>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, lineHeight: 1.5, marginBottom: "0.625rem" }}>
                  Share your on-chain verified work history with homeowners and agents.
                </p>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/contractor/${profile.id}`;
                    navigator.clipboard.writeText(url).then(() => toast.success("Portfolio link copied"));
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 0.875rem", border: `1px solid ${UI.rule}`, background: "none", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
                >
                  Copy Portfolio Link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalRequest && (
        <SubmitQuoteModal
          request={modalRequest}
          onSubmit={handleSubmitQuote}
          onClose={() => setModalRequest(null)}
        />
      )}
    </Layout>
  );
}
