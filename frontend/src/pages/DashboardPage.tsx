import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { useAuthStore } from "@/store/authStore";
import { V2_COLORS, V2_FONTS } from "@/theme";
import {
  computeScoreWithDecay, getScoreGrade, premiumEstimate,
} from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay } from "@/services/scoreDecayService";
import { getWeeklyPulse } from "@/services/pulseService";
import { getRecentScoreEvents } from "@/services/scoreEventService";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { useQuoteSummary } from "@/hooks/useQuoteSummary";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { useScoreTracking } from "@/hooks/useScoreTracking";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import { AIAssistantPanel } from "@/components/dashboard/AIAssistantPanel";
import { PropertyAddressBar } from "@/components/PropertyAddressBar";
import UpgradeModal from "@/components/UpgradeModal";

const BLUE  = V2_COLORS.blue;
const INK   = V2_COLORS.ink;
const PAPER = V2_COLORS.paper;
const MUTED = V2_COLORS.muted;
const BDR   = V2_COLORS.border;
const FONTS = V2_FONTS;

// ── Score trend bar ───────────────────────────────────────────────────────────

function ScoreTrendBars({ history }: { history: { score: number }[] }) {
  const max = Math.max(...history.map(h => h.score), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
      {history.slice(-12).map((h, i) => {
        const isLast = i === history.slice(-12).length - 1;
        const pct    = (h.score / max) * 100;
        return (
          <div key={i} style={{ width: 10, height: `${Math.max(pct, 12)}%`, background: isLast ? "#FFD23F" : "rgba(255,255,255,0.25)", borderRadius: 3, transition: "height 0.3s" }} />
        );
      })}
    </div>
  );
}

// ── Alert chip ────────────────────────────────────────────────────────────────

interface AlertChip { label: string; pts: string; sub: string; action: string; onAction: () => void; }

function AlertCard({ label, pts, sub, action, onAction }: AlertChip) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BDR}`, borderRadius: 10, padding: "14px 16px", minWidth: 200, flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: INK }}>{label}</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: "#DC2626" }}>{pts}</span>
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: 12, color: MUTED, margin: "0 0 10px", lineHeight: 1.4 }}>{sub}</p>
      <button onClick={onAction} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {action}
      </button>
    </div>
  );
}

// ── Approve / Decline card ────────────────────────────────────────────────────

interface PendingCard {
  id:            string;
  title:         string;
  badge?:        string;
  badgeColor?:   string;
  pts:           string;
  ptsColor?:     string;
  desc:          string;
  who:           string;
  date:          string;
  amount:        string;
  isPossibleDup: boolean;
  onApprove:     () => void;
  onDecline:     () => void;
}

function AwaitingCard({ id, title, badge, badgeColor, pts, ptsColor, desc, who, date, amount, isPossibleDup, onApprove, onDecline }: PendingCard) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: `1px solid ${BDR}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 700, color: INK }}>{title}</span>
          {badge && (
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: badgeColor ?? BLUE, background: badgeColor ? badgeColor + "18" : V2_COLORS.vbadge, borderRadius: 4, padding: "2px 6px" }}>
              {badge}
            </span>
          )}
          {isPossibleDup && (
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: "#D97706", background: "#FFFBEB", borderRadius: 4, padding: "2px 6px" }}>
              POSSIBLE DUPLICATE
            </span>
          )}
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: ptsColor ?? "#16A34A" }}>{pts}</span>
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: 13, color: MUTED, margin: "0 0 4px", lineHeight: 1.5 }}>{desc}</p>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: MUTED }}>{who} · {date} · {amount}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onApprove}
          data-testid="approve-proposal"
          style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, padding: "8px 18px", background: INK, color: "#fff", border: "none", borderRadius: 100, cursor: "pointer" }}
        >
          <CheckCircle size={14} /> Approve
        </button>
        <button
          onClick={onDecline}
          data-testid="reject-proposal"
          style={{ fontFamily: FONTS.body, fontSize: 13, color: MUTED, padding: "8px 14px", background: "none", border: `1px solid ${BDR}`, borderRadius: 100, cursor: "pointer" }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

// ── Points row ────────────────────────────────────────────────────────────────

function PointsRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ fontFamily: FONTS.body, fontSize: 13, color: MUTED, flex: 1 }}>{label}</span>
      <div style={{ width: 100, height: 5, background: BDR, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: BLUE, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: INK, width: 48, textAlign: "right" }}>{value} / {max}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate                          = useNavigate();
  const { profile }                       = useAuthStore();
  const { isOpen: isWizardOpen, open: openAddProp } = useAddPropertyStore();

  const {
    properties, loading: propLoading,
  } = usePropertySummary();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const propertyInitialized = useRef(false);

  const activePropertyId = selectedPropertyId ?? (properties.length > 0 ? String(properties[0].id) : null);
  const activeProperty   = activePropertyId
    ? properties.find((p) => String(p.id) === activePropertyId) ?? null
    : null;

  const jobSummary   = useJobSummary(properties, propLoading);
  const quoteSummary = useQuoteSummary();
  const { recurringServices, visitLogMap, systemAges } = useMaintenanceSchedule(properties, propLoading, activePropertyId);

  const loading = propLoading || jobSummary.loading;

  const { allJobs, pendingProposals } = jobSummary;

  const jobs = activePropertyId
    ? allJobs.filter((j) => j.propertyId === activePropertyId)
    : allJobs;

  // ── Score ─────────────────────────────────────────────────────────────────
  const decayEvents   = React.useMemo(() => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [], [jobs, systemAges, loading]);
  const atRiskWarnings = React.useMemo(() => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [], [jobs, systemAges, loading]);
  const totalDecay    = getTotalDecay(decayEvents);
  const homegenticScore = activeProperty ? computeScoreWithDecay(jobs, [activeProperty], totalDecay) : 0;
  const scoreGrade    = getScoreGrade(homegenticScore);
  const est           = React.useMemo(() => premiumEstimate(homegenticScore), [homegenticScore]);
  const { scoreHistory } = useScoreTracking(activePropertyId, homegenticScore, loading);

  // ── Derived ───────────────────────────────────────────────────────────────
  const pulseTip    = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);
  const scoreEvents = React.useMemo(() => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []), [jobs, activeProperty, loading]);

  const FREQ_DAYS: Record<string, number> = {
    Weekly: 7, BiWeekly: 14, Monthly: 30, Quarterly: 91, SemiAnnually: 182, Annually: 365,
  };
  const FREQ_LABELS: Record<string, string> = {
    Weekly: "Every week", BiWeekly: "Every 2 weeks", Monthly: "Every month",
    Quarterly: "Every 3 months", SemiAnnually: "Every 6 months", Annually: "Annually",
  };

  const maintenanceItems = React.useMemo(() => {
    const now = Date.now();
    return recurringServices.slice(0, 3).map((svc) => {
      const logs      = visitLogMap[svc.id] ?? [];
      const lastVisit = logs.length > 0 ? new Date(logs[logs.length - 1].visitDate).getTime() : new Date(svc.startDate).getTime();
      const freqDays  = FREQ_DAYS[svc.frequency] ?? 365;
      const nextDue   = lastVisit + freqDays * 86400000;
      const daysUntil = Math.max(0, Math.round((nextDue - now) / 86400000));
      return {
        id:         svc.id,
        label:      `${svc.serviceType} Service`,
        contractor: (svc as any).contractorName ?? null,
        dateStr:    new Date(nextDue).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        frequency:  FREQ_LABELS[svc.frequency] ?? svc.frequency,
        daysUntil,
      };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringServices, visitLogMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentDocs = React.useMemo(() => {
    return [...jobs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
      .map((job) => ({
        id:      job.id,
        title:   `${job.serviceType} ${job.isDiy ? "Record" : "Receipt"}`,
        dateStr: new Date(job.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        vendor:  job.contractorName ?? "",
        amount:  `$${(job.amount / 100).toLocaleString()}`,
      }));
  }, [jobs]);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [logJobPrefill,    setLogJobPrefill]    = useState<{ serviceType?: string } | undefined>();
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!propLoading && properties.length === 1 && !isWizardOpen) {
      navigate(`/properties/${properties[0].id}`, { replace: true });
    }
  }, [propLoading, properties.length, isWizardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!propLoading && properties.length > 0 && !propertyInitialized.current) {
      propertyInitialized.current = true;
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [propLoading, properties]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!propLoading && !autoOpenedRef.current && profile && !profile.onboardingComplete && properties.length === 0) {
      autoOpenedRef.current = true;
      openAddProp();
    }
  }, [propLoading, profile, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Points breakdown ──────────────────────────────────────────────────────
  const verifiedJobCount = jobs.filter(j => j.verified).length;
  const docValue         = jobs.filter(j => j.photos && j.photos.length > 0).length;
  const propVerified     = activeProperty?.verificationLevel === "Basic" || activeProperty?.verificationLevel === "Premium";
  const jobDiversity     = new Set(jobs.map(j => j.serviceType)).size;

  const pointsRows = [
    { label: "Verified jobs",        value: Math.min(verifiedJobCount * 2, 40),  max: 40 },
    { label: "Document value",       value: Math.min(docValue * 2, 20),           max: 20 },
    { label: "Property verification",value: propVerified ? 10 : 0,                max: 20 },
    { label: "Job diversity",        value: Math.min(jobDiversity * 2, 16),       max: 20 },
  ];

  const isCertified = homegenticScore >= 80 || propVerified;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ background: PAPER, minHeight: "100%" }}>

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <div style={{ background: BLUE, padding: "24px 32px 28px" }}>
          {/* Address bar row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <PropertyAddressBar
              activeProperty={activeProperty ? {
                id:       String(activeProperty.id),
                address:  activeProperty.address,
                city:     activeProperty.city,
                state:    activeProperty.state,
                zipCode:  activeProperty.zipCode ?? "",
                yearBuilt: String(activeProperty.yearBuilt ?? ""),
              } : null}
              properties={properties.map((p, i) => ({
                id:       String(p.id),
                address:  p.address,
                city:     p.city,
                state:    p.state,
                zipCode:  p.zipCode ?? "",
                type:     i === 0 ? "Primary residence" : "Property",
                yearBuilt: String(p.yearBuilt ?? ""),
              }))}
              onSelect={setSelectedPropertyId}
              certBadge={isCertified}
            />
            {/* Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigate(`/properties/${activePropertyId}`)} style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Resale report
              </button>
              <button onClick={() => navigate(`/properties/${activePropertyId}`)} style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Copy cert link
              </button>
              <button onClick={() => setShowLogJobModal(true)} style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: BLUE, background: "#fff", border: "none", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                + Log maintenance
              </button>
            </div>
          </div>

          {/* Hero content: score + price + trend */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 32, alignItems: "start" }}>
            {/* Score */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 80, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{homegenticScore}</span>
                <span style={{ fontFamily: FONTS.display, fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{scoreGrade}</span>
              </div>
              {atRiskWarnings.length > 0 ? (
                <p style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  {atRiskWarnings.length} risk{atRiskWarnings.length !== 1 ? "s" : ""} affecting your score
                </p>
              ) : (
                <p style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  {loading ? "Loading…" : verifiedJobCount > 0
                    ? `A buyer opening your report sees ${verifiedJobCount} verified repair${verifiedJobCount !== 1 ? "s" : ""} and every receipt behind them.`
                    : "Log your first job to start building your home record."}
                </p>
              )}
            </div>

            {/* Spacer */}
            <div />

            {/* Price range + trend */}
            <div style={{ textAlign: "right" }}>
              {est ? (
                <>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", marginBottom: 4 }}>
                    WHAT BUYERS PAY EXTRA · {activeProperty?.zipCode ?? ""}
                  </div>
                  <div style={{ fontFamily: FONTS.display, fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                    ${est.low.toLocaleString()}–${est.high.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                    Above the $350,000 Nashville median at grade {scoreGrade}, on comparable sales.
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  Log more jobs to unlock value insights.
                </div>
              )}

              {scoreHistory.length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", marginBottom: 6 }}>12-MONTH SCORE TREND</div>
                  <ScoreTrendBars history={scoreHistory} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ALERT CARDS ─────────────────────────────────────────────────── */}
        {atRiskWarnings.length > 0 && (
          <div style={{ padding: "16px 32px", borderBottom: `1px solid ${BDR}` }}>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {atRiskWarnings.slice(0, 5).map((w, i) => (
                <AlertCard
                  key={i}
                  label={w.label ?? "Risk"}
                  pts={`-${w.pts ?? 1} pt`}
                  sub={`${w.daysRemaining} day${w.daysRemaining !== 1 ? "s" : ""} remaining`}
                  action="Log a job"
                  onAction={() => setShowLogJobModal(true)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── MAIN BODY ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 0, alignItems: "start" }}>

          {/* Left: main content */}
          <div style={{ padding: "24px 32px", borderRight: `1px solid ${BDR}` }}>

            {/* AWAITING YOU */}
            {pendingProposals.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    AWAITING YOU
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: BLUE, background: V2_COLORS.vbadge, borderRadius: 100, padding: "2px 8px" }}>
                    {pendingProposals.length} PENDING
                  </span>
                </div>
                {pendingProposals.map((proposal) => (
                  <AwaitingCard
                    key={proposal.id}
                    id={proposal.id}
                    title={proposal.serviceType}
                    badge={proposal.isDiy ? undefined : "VERIFIED PRO"}
                    badgeColor={BLUE}
                    pts={`+4 pts`}
                    isPossibleDup={!!(proposal as any).potentialDuplicateOf}
                    desc={proposal.description ?? ""}
                    who={proposal.contractorName ?? "Homeowner"}
                    date={new Date(proposal.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    amount={`$${(proposal.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    onApprove={() => jobSummary.approveProposal(proposal.id)}
                    onDecline={() => jobSummary.rejectProposal(proposal.id)}
                  />
                ))}
              </div>
            )}

            {/* 3-col: HOME PULSE · POINTS · AI CHAT */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>

              {/* HOME PULSE */}
              <div style={{ border: `1px solid ${BDR}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                  HOME PULSE · {activeProperty ? `${activeProperty.city?.toUpperCase()?.slice(0,6) ?? ""}` : ""} · SUMMER
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <button onClick={() => navigate("/market")} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    All insights ›
                  </button>
                </div>
                <h3 style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 800, color: INK, lineHeight: 1.3, marginBottom: 8 }}>
                  {pulseTip?.headline ?? (activeProperty ? `Your ${activeProperty.yearBuilt ? new Date().getFullYear() - Number(activeProperty.yearBuilt) : ""}-year-old home needs your attention.` : "Start logging jobs to see insights.")}
                </h3>
                {atRiskWarnings.slice(0, 2).map((w, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: INK }}>{w.label}</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, background: w.pts ? "#FEF2F2" : V2_COLORS.lblue, color: w.pts ? "#DC2626" : BLUE, borderRadius: 4, padding: "1px 5px" }}>
                        {w.pts ? `-${w.pts} pts` : "REVIEW"}
                      </span>
                    </div>
                    <p style={{ fontFamily: FONTS.body, fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.4 }}>{w.label}</p>
                  </div>
                ))}
              </div>

              {/* WHERE THE POINTS COME FROM */}
              <div style={{ border: `1px solid ${BDR}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>WHERE THE POINTS COME FROM</span>
                  <button onClick={() => navigate(`/properties/${activePropertyId}`)} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Detail ›</button>
                </div>
                {pointsRows.map((row) => (
                  <PointsRow key={row.label} {...row} />
                ))}
              </div>

              {/* ASK ABOUT YOUR HOME */}
              <div style={{ border: `1px solid ${BDR}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BDR}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✦</span>
                  <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: INK }}>Ask about your home</span>
                  <span style={{ marginLeft: "auto", fontFamily: FONTS.mono, fontSize: 10, color: "#16A34A", background: "#F0FDF4", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>READY</span>
                </div>
                <div style={{ padding: 16 }}>
                  <p style={{ fontFamily: FONTS.body, fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
                    Tap the mic and talk, or type. It knows every record on {activeProperty?.address ?? "your property"}.
                  </p>
                  {["What maintenance is due this month?", "Why did I lose points?", "Should I replace my water heater?"].map((q) => (
                    <button key={q} style={{ display: "block", width: "100%", textAlign: "left", fontFamily: FONTS.body, fontSize: 12, color: INK, background: V2_COLORS.lblue, border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", marginBottom: 6 }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* UPCOMING MAINTENANCE + PAPER TRAIL */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>

              {/* Upcoming maintenance */}
              <div style={{ border: `1px solid ${BDR}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${BDR}` }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>UPCOMING MAINTENANCE</span>
                  <button onClick={() => navigate("/maintenance")} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Schedule ›</button>
                </div>
                {maintenanceItems.length === 0 ? (
                  <div style={{ padding: "20px 16px", textAlign: "center" }}>
                    <p style={{ fontFamily: FONTS.body, fontSize: 13, color: MUTED }}>No maintenance scheduled.</p>
                    <button onClick={() => navigate("/maintenance")} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 8 }}>Set up schedule →</button>
                  </div>
                ) : (
                  maintenanceItems.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${BDR}` }}>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 10, textAlign: "center", lineHeight: 1.2, color: MUTED, width: 36, flexShrink: 0 }}>
                        {item.dateStr.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: INK }}>{item.label}</div>
                        <div style={{ fontFamily: FONTS.body, fontSize: 11, color: MUTED }}>{item.frequency}{item.contractor ? ` · ${item.contractor}` : ""}</div>
                      </div>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: item.daysUntil <= 7 ? "#DC2626" : item.daysUntil <= 30 ? "#D97706" : MUTED, background: item.daysUntil <= 7 ? "#FEF2F2" : item.daysUntil <= 30 ? "#FFFBEB" : BDR, borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap" }}>
                        IN {item.daysUntil} DAYS
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Paper trail */}
              <div style={{ border: `1px solid ${BDR}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${BDR}` }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>THE PAPER TRAIL</span>
                  <button onClick={() => navigate(`/properties/${activePropertyId}`)} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>All {jobs.length} ›</button>
                </div>
                {recentDocs.length === 0 ? (
                  <div style={{ padding: "20px 16px", textAlign: "center" }}>
                    <p style={{ fontFamily: FONTS.body, fontSize: 13, color: MUTED }}>No records yet. Log your first job.</p>
                    <button onClick={() => setShowLogJobModal(true)} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 8 }}>Log a job →</button>
                  </div>
                ) : (
                  recentDocs.map((doc) => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${BDR}`, cursor: "pointer" }} onClick={() => navigate(`/properties/${activePropertyId}`)}>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 10, textAlign: "center", lineHeight: 1.2, color: MUTED, width: 36, flexShrink: 0 }}>
                        {doc.dateStr.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
                        <div style={{ fontFamily: FONTS.body, fontSize: 11, color: MUTED }}>{doc.vendor}{doc.vendor ? " · " : ""}{doc.amount}</div>
                      </div>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: "#2563EB", background: "#EFF6FF", borderRadius: 4, padding: "3px 7px" }}>PDF</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            {scoreEvents.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>RECENT ACTIVITY</span>
                  <button onClick={() => navigate(`/properties/${activePropertyId}`)} style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: BLUE, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Full log ›</button>
                </div>
                {scoreEvents.slice(0, 4).map((ev) => (
                  <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BDR}` }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: MUTED, width: 48, flexShrink: 0 }}>
                      {new Date(ev.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}
                    </span>
                    <span style={{ fontFamily: FONTS.body, fontSize: 13, color: INK, flex: 1 }}>{ev.label}</span>
                    {ev.pts !== 0 && (
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: ev.pts > 0 ? "#16A34A" : "#DC2626" }}>
                        {ev.pts > 0 ? `+${ev.pts}` : ev.pts} pts
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: sidebar */}
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Verification upsell */}
            {!propVerified && (
              <div style={{ background: BLUE, borderRadius: 12, padding: 20 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                  NEXT POINTS AVAILABLE
                </div>
                <h3 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 8 }}>
                  Verify a second property for +10 pts
                </h3>
                <p style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 16 }}>
                  Property verification sits at 10 of 20 — the largest gap left in your score.
                </p>
                <button onClick={() => navigate(`/properties/${activePropertyId}/verify`)} style={{ width: "100%", fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: BLUE, background: "#FFD23F", border: "none", borderRadius: 100, padding: "10px", cursor: "pointer" }}>
                  Start verification
                </button>
              </div>
            )}

            {/* AI Assistant */}
            <AIAssistantPanel />
          </div>
        </div>

      </div>

      {/* Modals */}
      <LogJobModal
        isOpen={showLogJobModal}
        prefill={logJobPrefill}
        onClose={() => setShowLogJobModal(false)}
        onSuccess={() => setShowLogJobModal(false)}
        properties={properties}
      />
      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSuccess={() => setShowQuoteModal(false)}
        properties={properties}
      />
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </Layout>
  );
}
