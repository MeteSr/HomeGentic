import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X, ShieldCheck, Calendar, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { RecurringServiceCard } from "@/components/RecurringServiceCard";
import { useAuthStore } from "@/store/authStore";
import { isNewSince, hasQuoteActivity, pendingQuoteCount } from "@/services/notifications";
import { computeScore, computeScoreWithDecay, computeBreakdown, getScoreGrade, scoreDelta, scoreValueDelta, premiumEstimate, isCertified } from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { certService } from "@/services/cert";
import { UpgradeGate } from "@/components/UpgradeGate";
import { getWeeklyPulse } from "@/services/pulseService";
import { marketService, jobToSummary, type PropertyProfile, type ProjectRecommendation } from "@/services/market";
import { getRecentScoreEvents, type ScoreEvent } from "@/services/scoreEventService";
import { getReEngagementPrompts, type ReEngagementPrompt } from "@/services/reEngagementService";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { ScoreSparkline }    from "@/components/ScoreSparkline";
import { ScoreHistoryChart } from "@/components/ScoreHistoryChart";
import { PropertyCard }      from "@/components/PropertyCard";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { NeighborhoodBenchmark } from "@/components/NeighborhoodBenchmark";
import { ScoreActivityFeed } from "@/components/ScoreActivityFeed";
import UpgradeModal from "@/components/UpgradeModal";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { useQuoteSummary } from "@/hooks/useQuoteSummary";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { useSubscription } from "@/hooks/useSubscription";
import { useScoreTracking } from "@/hooks/useScoreTracking";
import { useDashboardDismissals } from "@/hooks/useDashboardDismissals";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,       // primary accent: sage replaces rust
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

// ─── Modal state ──────────────────────────────────────────────────────────────
interface ModalState {
  showLogJobModal: boolean;
  logJobPrefill: { serviceType?: string; contractorName?: string } | undefined;
  showQuoteModal: boolean;
  showUpgradeModal: boolean;
  showScoreBreakdown: boolean;
  showScoreChart: boolean;
}

const MODAL_INITIAL: ModalState = {
  showLogJobModal: false,
  logJobPrefill: undefined,
  showQuoteModal: false,
  showUpgradeModal: false,
  showScoreBreakdown: false,
  showScoreChart: false,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, lastLoginAt } = useAuthStore();
  const { isMobile } = useBreakpoint();

  // ─── Domain hooks ────────────────────────────────────────────────────────────
  const {
    properties, managedProperties, ownerNotifs, loading: propLoading,
    dismissAllNotifications,
  } = usePropertySummary();

  // Property selector — UI state (1 of 3 useState in this file)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const propertyInitialized = useRef(false);

  // Derived property values used by other hooks
  const activePropertyId = selectedPropertyId ?? (properties.length === 1 ? String(properties[0].id) : null);
  const activeProperty   = activePropertyId
    ? properties.find((p) => String(p.id) === activePropertyId) ?? null
    : null;
  const isAllView = activePropertyId === null && properties.length > 1;

  const jobSummary   = useJobSummary(properties, propLoading);
  const quoteSummary = useQuoteSummary();
  const { recurringServices, visitLogMap, systemAges } = useMaintenanceSchedule(properties, propLoading, activePropertyId);
  const { userTier } = useSubscription();

  const loading = propLoading || jobSummary.loading;

  const { allJobs, pendingProposals } = jobSummary;
  const { quoteRequests, bidCountMap } = quoteSummary;

  // jobs filtered to active property (or all when in "all view")
  const jobs = activePropertyId
    ? allJobs.filter((j) => j.propertyId === activePropertyId)
    : allJobs;

  // ─── Score tracking ──────────────────────────────────────────────────────────
  const totalValue    = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);

  const decayEvents: DecayEvent[] = React.useMemo(
    () => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const atRiskWarnings: AtRiskWarning[] = React.useMemo(
    () => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const totalDecay      = getTotalDecay(decayEvents);
  const homegenticScore = activeProperty ? computeScoreWithDecay(jobs, [activeProperty], totalDecay) : 0;
  const scoreGrade      = getScoreGrade(homegenticScore);
  const certified       = isCertified(homegenticScore, jobs);

  const { scoreHistory, scoreGoal, setScoreGoal } = useScoreTracking(activePropertyId, homegenticScore, loading);

  const delta            = scoreDelta(scoreHistory);
  const prevScore        = homegenticScore - delta;
  const scoreValueChange = scoreValueDelta(prevScore, homegenticScore);

  // ─── Dismissals ──────────────────────────────────────────────────────────────
  const d = useDashboardDismissals();

  // ─── Modal state (2 of 3 useState in this file) ───────────────────────────────
  const [modals, setModals] = useState<ModalState>(MODAL_INITIAL);
  const openLogJob = (prefill?: ModalState["logJobPrefill"]) =>
    setModals((m) => ({ ...m, showLogJobModal: true, logJobPrefill: prefill }));
  const closeLogJob  = () => setModals((m) => ({ ...m, showLogJobModal: false }));
  const openQuote    = () => setModals((m) => ({ ...m, showQuoteModal: true }));
  const closeQuote   = () => setModals((m) => ({ ...m, showQuoteModal: false }));
  const openUpgrade  = () => setModals((m) => ({ ...m, showUpgradeModal: true }));
  const closeUpgrade = () => setModals((m) => ({ ...m, showUpgradeModal: false }));
  const toggleScoreBreakdown = () => setModals((m) => ({ ...m, showScoreBreakdown: !m.showScoreBreakdown }));
  const toggleScoreChart     = () => setModals((m) => ({ ...m, showScoreChart: !m.showScoreChart }));

  // ─── Next-service dismissal (3 of 3 useState — dynamic localStorage key) ─────
  const recentVerified = jobs
    .filter((j) => j.status === "verified")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
  const nextServiceKey = `homegentic_next_service_${recentVerified?.id ?? ""}`;
  const [nextServiceDismissed, setNextServiceDismissed] = useState(
    () => !!localStorage.getItem(nextServiceKey)
  );

  // ─── Effects ─────────────────────────────────────────────────────────────────

  // Redirect when user has exactly one property (nothing to select on dashboard)
  useEffect(() => {
    if (!propLoading && properties.length === 1) {
      navigate(`/properties/${properties[0].id}`, { replace: true });
    }
  }, [propLoading, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise property selector to first property after load
  useEffect(() => {
    if (!propLoading && properties.length > 0 && !propertyInitialized.current) {
      propertyInitialized.current = true;
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [propLoading, properties]);

  // ─── Derived UI values ───────────────────────────────────────────────────────

  const hasProperty = properties.length > 0;
  const hasVerified = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob      = jobs.length > 0;
  const showBanner  = !loading && !(hasProperty && hasVerified && hasJob) && !d.bannerDismissed;

  const scoreAlertsEnabled = localStorage.getItem("homegentic_score_alerts") !== "false";
  const showScoreIncrease  = !loading && hasJob && delta > 0 && scoreAlertsEnabled && !d.scoreIncreaseDismissed;

  const NEXT_SERVICE_TIPS: Record<string, string> = {
    HVAC:       "Schedule HVAC filter replacement in 3 months to maintain efficiency.",
    Roofing:    "Book an annual roof inspection to catch early wear.",
    Plumbing:   "Check water heater anode rod in 12 months to prevent corrosion.",
    Electrical: "Schedule a panel safety inspection in 3 years.",
    Flooring:   "Consider re-sealing or refinishing flooring in 2 years.",
    Painting:   "Plan a touch-up inspection in 12 months.",
  };
  const nextServiceTip  = recentVerified ? NEXT_SERVICE_TIPS[recentVerified.serviceType] ?? null : null;
  const showNextService = !loading && !!nextServiceTip && !nextServiceDismissed;

  const reEngagementPrompts: ReEngagementPrompt[] = React.useMemo(
    () => (!loading ? getReEngagementPrompts(jobs) : []),
    [jobs, loading]
  );
  const visibleReEngagements = reEngagementPrompts.filter((p) => !d.dismissedReEngagements.has(p.jobId));

  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []),
    [jobs, activeProperty, loading]
  );

  const scoreBreakdown = React.useMemo(() => {
    const verifiedJobs      = jobs.filter((j) => j.verified);
    const verifiedJobPts    = Math.min(verifiedJobs.length * 4, 40);
    const totalValueDollars = jobs.reduce((s, j) => s + j.amount, 0) / 100;
    const valuePts          = Math.min(Math.floor(totalValueDollars / 2500), 20);
    let verPts = 0;
    for (const p of (activeProperty ? [activeProperty] : [])) {
      if (p.verificationLevel === "Premium") verPts += 10;
      else if (p.verificationLevel === "Basic") verPts += 5;
    }
    verPts = Math.min(verPts, 20);
    const uniqueTypes  = new Set(jobs.map((j) => j.serviceType)).size;
    const diversityPts = Math.min(uniqueTypes * 4, 20);
    return [
      { label: "Verified Jobs",      pts: verifiedJobPts, max: 40, detail: `${verifiedJobs.length} verified job${verifiedJobs.length !== 1 ? "s" : ""} × 4 pts` },
      { label: "Total Value",        pts: valuePts,        max: 20, detail: `$${Math.round(totalValueDollars).toLocaleString()} documented` },
      { label: "Verification Level", pts: verPts,          max: 20, detail: activeProperty?.verificationLevel ?? "No property selected" },
      { label: "Job Diversity",      pts: diversityPts,    max: 20, detail: `${uniqueTypes} service categor${uniqueTypes !== 1 ? "ies" : "y"}` },
    ];
  }, [jobs, activeProperty]);

  const expiringWarranties = React.useMemo(() => {
    const now = Date.now();
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    return jobs
      .filter((j) => {
        if (!j.warrantyMonths || j.warrantyMonths <= 0) return false;
        const expiry = new Date(j.date).getTime() + j.warrantyMonths * 30.44 * 24 * 60 * 60 * 1000;
        return expiry > now && expiry - now <= NINETY_DAYS_MS;
      })
      .sort((a, b) => {
        const ea = new Date(a.date).getTime() + (a.warrantyMonths ?? 0) * 30.44 * 24 * 60 * 60 * 1000;
        const eb = new Date(b.date).getTime() + (b.warrantyMonths ?? 0) * 30.44 * 24 * 60 * 60 * 1000;
        return ea - eb;
      });
  }, [jobs]);

  const accountAgeMs  = profile?.createdAt ? Date.now() - Number(profile.createdAt) / 1_000_000 : 0;
  const milestoneKey  = "homegentic_milestone_dismissed";
  const showMilestone = !loading && hasJob && !d.milestoneDismissed
    && accountAgeMs >= 11 * 30 * 24 * 60 * 60 * 1000;

  const pulseKey     = `homegentic_pulse_${new Date().toISOString().slice(0, 7)}`;
  const pulseEnabled = localStorage.getItem("homegentic_pulse_enabled") !== "false";
  const pulseTip     = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);
  const showPulse    = !loading && hasProperty && !!pulseTip && !d.pulseDismissed && pulseEnabled;

  const propertyComparison = React.useMemo(() => {
    if (properties.length < 2) return null;
    return properties.map((p) => {
      const pJobs    = allJobs.filter((j) => j.propertyId === String(p.id));
      const score    = computeScore(pJobs, [p]);
      const grade    = getScoreGrade(score);
      const value    = jobService.getTotalValue(pJobs);
      const verified = jobService.getVerifiedCount(pJobs);
      return { property: p, score, grade, value, verified, jobCount: pJobs.length };
    }).sort((a, b) => b.score - a.score);
  }, [properties, allJobs]);

  const scoreStagnant = React.useMemo(() => {
    if (!hasProperty || scoreHistory.length < 2) return false;
    const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
    const now     = Date.now();
    const current = scoreHistory[scoreHistory.length - 1];
    const old     = scoreHistory.find((s) => now - s.timestamp >= FOUR_WEEKS_MS);
    if (!old) return false;
    return current.score <= old.score;
  }, [scoreHistory, hasProperty]);

  const recommendations = React.useMemo((): ProjectRecommendation[] => {
    if (!activeProperty) return [];
    const p = activeProperty;
    const profile: PropertyProfile = {
      yearBuilt:    Number(p.yearBuilt),
      squareFeet:   Number(p.squareFeet),
      propertyType: String(p.propertyType),
      state:        p.state,
      zipCode:      p.zipCode,
    };
    const pJobs = jobs.filter((j) => j.propertyId === String(p.id)).map(jobToSummary);
    return marketService.recommendValueAddingProjects(profile, pJobs, 0).slice(0, 3);
  }, [activeProperty, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreGoalGap = React.useMemo((): string | null => {
    if (!scoreGoal || homegenticScore >= scoreGoal) return null;
    const gap          = scoreGoal - homegenticScore;
    const needVerified = Math.ceil(gap / 4);
    const uniqueTypes  = new Set(jobs.map((j) => j.serviceType)).size;
    const verifiedJobs = jobs.filter((j) => j.verified).length;
    if (gap <= 4)  return `Verify 1 more job to reach ${scoreGoal}`;
    if (gap <= 8)  return `Verify ${needVerified} more job${needVerified !== 1 ? "s" : ""} to reach ${scoreGoal}`;
    if (verifiedJobs === 0) return `Start verifying jobs — each adds up to 4 pts toward ${scoreGoal}`;
    if (uniqueTypes < 5)   return `Log a new service type to add diversity points toward ${scoreGoal}`;
    const needValueK = Math.ceil((gap / 20) * 50000 / 1000);
    return `Log $${needValueK}K in documented work to reach ${scoreGoal}`;
  }, [scoreGoal, homegenticScore, jobs]);

  const verificationBadge = (level: string) => {
    if (level === "Premium")       return <Badge variant="success">Premium Verified</Badge>;
    if (level === "Basic")         return <Badge variant="info">Basic Verified</Badge>;
    if (level === "PendingReview") return <Badge variant="warning">Pending</Badge>;
    return <Badge variant="default">Unverified</Badge>;
  };

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
              Overview
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
              Dashboard
            </h1>
            {profile?.email && (
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.375rem" }}>
                {profile.email}
              </p>
            )}
          </div>
          <Button onClick={() => navigate("/properties/new")} icon={<Plus size={14} />}>
            Add Property
          </Button>
        </div>

        {/* Property selector — shown when user has 2+ properties */}
        {!loading && properties.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setSelectedPropertyId(null)}
              style={{
                fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "0.375rem 0.875rem",
                background: isAllView ? COLORS.plum : "none",
                color: isAllView ? COLORS.white : UI.inkLight,
                border: `1px solid ${isAllView ? COLORS.plum : UI.rule}`,
                cursor: "pointer", borderRadius: RADIUS.pill,
              }}
            >
              All Properties
            </button>
            {properties.map((p) => {
              const isActive = String(p.id) === activePropertyId;
              return (
                <button
                  key={String(p.id)}
                  onClick={() => setSelectedPropertyId(String(p.id))}
                  style={{
                    fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em",
                    padding: "0.375rem 0.875rem",
                    background: isActive ? COLORS.plum : "none",
                    color: isActive ? COLORS.white : UI.inkLight,
                    border: `1px solid ${isActive ? COLORS.plum : UI.rule}`,
                    cursor: "pointer", borderRadius: RADIUS.pill,
                    maxWidth: "14rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={`${p.address}, ${p.city}`}
                >
                  {p.address}
                </button>
              );
            })}
          </div>
        )}

        {/* Active property context header — shown when a specific property is selected */}
        {!loading && activeProperty && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.875rem 1.25rem", marginBottom: "1.5rem",
            background: COLORS.white, border: `1px solid ${COLORS.rule}`,
            borderRadius: RADIUS.card, gap: "1rem", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div style={{ width: "2.25rem", height: "2.25rem", background: COLORS.sageLight, border: `1px solid ${COLORS.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <Home size={14} color={UI.sage} />
              </div>
              <div>
                <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.95rem", color: UI.ink, lineHeight: 1.2 }}>
                  {activeProperty.address}
                </p>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, marginTop: "0.15rem" }}>
                  {activeProperty.city}, {activeProperty.state} · {verificationBadge(activeProperty.verificationLevel)}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/properties/${activeProperty.id}`)}
              style={{
                fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "0.375rem 0.875rem", border: `1px solid ${UI.rule}`,
                color: UI.inkLight, background: "none", cursor: "pointer", borderRadius: RADIUS.sm,
              }}
            >
              View Property →
            </button>
          </div>
        )}

        {/* Onboarding banner */}
        {showBanner && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Sparkles size={16} color={UI.rust} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Finish setting up
                </p>
                <p style={{ fontSize: "0.8rem", color: UI.inkLight, fontWeight: 300 }}>
                  {!hasProperty ? "Add your first property to start building your home's verified history."
                    : !hasVerified ? "Verify ownership so buyers can trust your history."
                    : "Log your first job to add value to your HomeGentic report."}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                onClick={() => navigate("/onboarding")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.5rem 1rem", background: UI.rust, color: "#fff",
                  border: "none", fontFamily: UI.mono, fontSize: "0.65rem",
                  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                  borderRadius: RADIUS.pill,
                }}
              >
                Continue setup <ArrowRight size={12} />
              </button>
              <button aria-label="Dismiss banner" onClick={d.dismissBanner} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight }}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Annual milestone banner */}
        {showMilestone && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: UI.ink, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.25rem" }}>
                One Year of HomeGentic
              </p>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: UI.paper, fontWeight: 300 }}>
                You've been building your verified home history for nearly a year.{" "}
                <strong style={{ fontWeight: 600 }}>${(totalValue / 100).toLocaleString()} in documented improvements</strong> — that's real value for your next sale.
              </p>
              <button
                onClick={() => navigate("/resale-ready")}
                style={{ marginTop: "0.5rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: `1px solid ${UI.rust}`, background: "none", color: UI.rust, cursor: "pointer", borderRadius: RADIUS.sm }}
              >
                View Resale Summary →
              </button>
            </div>
            <button
              onClick={d.dismissMilestone}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* 3-verified-jobs milestone */}
        {!loading && verifiedCount >= 3 && !d.milestone3Dismissed && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.sage}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `2px solid ${UI.sage}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: UI.sage, borderRadius: RADIUS.sm }}>
                <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "0.875rem" }}>3</span>
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.2rem" }}>
                  Milestone — Your Home History Is Taking Shape
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.ink }}>
                  <strong style={{ fontWeight: 600 }}>{verifiedCount} verified records</strong> on the blockchain. Buyers can now see a real maintenance history.
                </p>
              </div>
            </div>
            <button onClick={d.dismissMilestone3} style={{ background: "none", border: "none", cursor: "pointer", color: UI.sage, flexShrink: 0 }}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* Free-tier upgrade nudge — shown after 3rd job logged (15.7.2) */}
        {!loading && userTier === "Free" && jobs.length >= 3 && !d.upgradeBannerDismissed && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1.5px solid ${COLORS.sageMid}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `2px solid ${UI.sage}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm, fontSize: "1rem" }}>
                🔓
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.2rem" }}>
                  Upgrade to Pro
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.ink }}>
                  You've logged <strong style={{ fontWeight: 600 }}>{jobs.length} jobs</strong>. Unlock score breakdowns, warranty tracking, and full report sharing with Pro.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
              <button
                onClick={openUpgrade}
                style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.45rem 1rem", border: "none", background: UI.sage, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm, fontWeight: 600 }}
              >
                See Plans →
              </button>
              <button onClick={d.dismissUpgradeBanner} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight }}>
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Home Pulse tip */}
        {showPulse && pulseTip && (
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", gap: "0.875rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.125rem", borderRadius: RADIUS.sm }}>
                <Sparkles size={13} color={UI.rust} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust }}>
                    Home Pulse
                  </p>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, border: `1px solid ${UI.rule}`, padding: "0.05rem 0.375rem", borderRadius: 100 }}>
                    {pulseTip.category}
                  </span>
                </div>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>{pulseTip.headline}</p>
                <p style={{ fontSize: "0.8rem", color: UI.inkLight, fontWeight: 300 }}>{pulseTip.detail}</p>
              </div>
            </div>
            <button onClick={d.dismissPulse} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, flexShrink: 0 }}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* Score stagnation nudge */}
        {!loading && scoreStagnant && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <Sparkles size={13} color={UI.inkLight} />
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>
                  Score Hasn't Moved in 30 Days
                </p>
                <p style={{ fontSize: "0.8rem", fontWeight: 300, color: UI.inkLight }}>
                  Log a recent job or verify a property to keep your HomeGentic Score growing.
                </p>
              </div>
            </div>
            <button
              onClick={() => openLogJob(undefined)}
              style={{
                fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "0.5rem 1rem", background: UI.ink, color: UI.paper,
                border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem", flexShrink: 0,
                borderRadius: RADIUS.pill,
              }}
            >
              Log a Job <ArrowRight size={12} />
            </button>
          </div>
        )}

        {/* Score at Risk warning (8.7.7) */}
        {!loading && atRiskWarnings.length > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "0.75rem",
            border: "1px solid #f59e0b40", padding: "1rem 1.25rem", marginBottom: "1.5rem",
            background: "#fffbeb", borderRadius: RADIUS.sm,
          }}>
            <div style={{ width: "1.75rem", height: "1.75rem", background: "#fef3c7", border: "1px solid #f59e0b60", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: "#b45309" }}>!</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#b45309", marginBottom: "0.375rem" }}>
                Score at Risk
              </p>
              {atRiskWarnings.map((w) => (
                <p key={w.id} style={{ fontSize: "0.78rem", fontWeight: 300, color: "#78350f", marginBottom: "0.2rem" }}>
                  {w.label} — <strong style={{ fontWeight: 600 }}>{w.pts} pts</strong> in {w.daysRemaining} day{w.daysRemaining !== 1 ? "s" : ""}
                </p>
              ))}
              <button
                onClick={() => openLogJob(undefined)}
                style={{ marginTop: "0.5rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", background: "#b45309", color: "#fff", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem", borderRadius: RADIUS.pill }}
              >
                Log a Job <ArrowRight size={11} />
              </button>
            </div>
          </div>
        )}

        {/* Score increase notification */}
        {showScoreIncrease && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${COLORS.sageMid}`, padding: "0.875rem 1.25rem", marginBottom: "1.5rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.sage }}>
                Score Up +{delta} pts
              </span>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.sage, opacity: 0.75 }}>
                {scoreValueChange != null
                  ? `— Your score went from ${prevScore} to ${homegenticScore}. A ${delta}-point increase ≈ $${scoreValueChange.toLocaleString()} in estimated home value.`
                  : `— Your HomeGentic Score is now ${homegenticScore}. Keep logging jobs to grow your record.`}
              </span>
            </div>
            <button onClick={d.dismissScoreIncrease} style={{ background: "none", border: "none", cursor: "pointer", color: UI.sage, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {!isAllView && (
          <>

        {/* Stats */}
        <ResponsiveGrid cols={{ mobile: 2, tablet: 3, desktop: 5 }} gap="1rem" style={{ marginBottom: "2.5rem" }}>
          {[
            { label: "Verification", value: activeProperty?.verificationLevel === "PendingReview" ? "Pending" : (activeProperty?.verificationLevel ?? "—") },
            { label: "Verified Jobs",    value: String(verifiedCount) },
            { label: "Total Value",      value: `$${(totalValue / 100).toLocaleString()}` },
            { label: "HomeGentic Premium™", value: `$${Math.round((totalValue / 100) * 0.03).toLocaleString()}` },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "1.25rem 1.5rem", borderRadius: RADIUS.card, background: COLORS.white, border: `1px solid ${COLORS.rule}`, boxShadow: SHADOWS.card }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.625rem" }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: UI.ink }}>
                {stat.value}
              </div>
            </div>
          ))}
          {/* HomeGentic Score — accent cell */}
          <div style={{ padding: "1.25rem 1.5rem", borderRadius: RADIUS.card, background: COLORS.plum, boxShadow: SHADOWS.hover }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.625rem" }}>
              HomeGentic Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: COLORS.white }}>{homegenticScore}</span>
              <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: COLORS.plumMid }}>/100 · {scoreGrade}</span>
            </div>
            {delta !== 0 && (
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: delta > 0 ? COLORS.sage : COLORS.blush, letterSpacing: "0.06em" }}>
                {delta > 0 ? "+" : ""}{delta} pts this period
              </div>
            )}
            <ScoreSparkline history={scoreHistory} onExpand={toggleScoreChart} />
          </div>
        </ResponsiveGrid>

        {/* Free-tier job cap progress bar (15.1.3) */}
        {!loading && userTier === "Free" && (
          <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, padding: "0.875rem 1.25rem", marginBottom: "1.5rem", borderRadius: RADIUS.sm }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
                Free Plan · Jobs
              </span>
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: jobs.length >= 5 ? COLORS.sage : UI.ink }}>
                {jobs.length}/5
              </span>
            </div>
            <div style={{ height: "4px", background: UI.rule, borderRadius: 100, overflow: "hidden", marginBottom: "0.5rem" }}>
              <div style={{ height: "4px", width: `${Math.min(jobs.length / 5 * 100, 100)}%`, background: jobs.length >= 5 ? COLORS.sage : COLORS.plum, borderRadius: 100, transition: "width 0.5s ease" }} />
            </div>
            {jobs.length >= 5 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>Job limit reached — upgrade to keep logging</span>
                <button onClick={openUpgrade} style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.25rem 0.625rem", border: "none", background: COLORS.plum, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm, whiteSpace: "nowrap" }}>Upgrade →</button>
              </div>
            ) : (
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                {5 - jobs.length} job{5 - jobs.length !== 1 ? "s" : ""} remaining on Free plan
              </span>
            )}
          </div>
        )}

        {/* Score history chart */}
        {modals.showScoreChart && scoreHistory.length >= 2 && (
          <div style={{ marginBottom: "2rem", border: `1px solid ${UI.rule}`, background: "#fff", borderRadius: RADIUS.card, overflow: "hidden" }}>
            <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.white }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>Score History</span>
              <button onClick={toggleScoreChart} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Close ✕</button>
            </div>
            <ScoreHistoryChart history={scoreHistory} />
          </div>
        )}

        {/* Score breakdown panel */}
        {!loading && (jobs.length > 0 || properties.length > 0) && (
          <div style={{ marginBottom: "2rem" }}>
            <button
              onClick={toggleScoreBreakdown}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem", width: "100%",
                padding: "0.75rem 1rem", border: `1px solid ${UI.rule}`,
                background: modals.showScoreBreakdown ? COLORS.sageLight : COLORS.white,
                fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: UI.inkLight, cursor: "pointer", textAlign: "left",
                borderRadius: modals.showScoreBreakdown ? `${RADIUS.card}px ${RADIUS.card}px 0 0` : RADIUS.card,
              }}
            >
              <span style={{ flex: 1 }}>How is my HomeGentic Score calculated?</span>
              <span style={{ fontSize: "0.75rem" }}>{modals.showScoreBreakdown ? "▲" : "▼"}</span>
            </button>
            {modals.showScoreBreakdown && userTier === "Free" && (
              <UpgradeGate
                feature="Score Breakdown"
                description="See exactly which factors are dragging your score down — and what to fix first."
                style={{ borderRadius: `0 0 ${RADIUS.card}px ${RADIUS.card}px`, borderTop: "none" }}
                onUpgrade={openUpgrade}
              />
            )}
            {modals.showScoreBreakdown && userTier !== "Free" && (
              <div style={{ border: `1px solid ${UI.rule}`, borderTop: "none", background: COLORS.white, borderRadius: `0 0 ${RADIUS.card}px ${RADIUS.card}px`, overflow: "hidden" }}>
                {scoreBreakdown.map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1rem", borderBottom: `1px solid ${UI.rule}` }}>
                    <div style={{ width: "10rem", flexShrink: 0 }}>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>{row.label}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, fontWeight: 300, marginTop: "0.1rem" }}>{row.detail}</p>
                    </div>
                    <div style={{ flex: 1, height: "4px", background: UI.rule, borderRadius: 100 }}>
                      <div style={{ height: "4px", background: UI.rust, width: `${(row.pts / row.max) * 100}%`, transition: "width 0.5s ease", borderRadius: 100 }} />
                    </div>
                    <div style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", color: UI.ink }}>{row.pts}</span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>/{row.max}</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "0.875rem 1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", background: COLORS.white }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Total</span>
                  <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink }}>{homegenticScore}</span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>/100</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Neighborhood Benchmark (4.3.2) */}
        {!loading && activeProperty?.zipCode && (
          <div style={{ marginBottom: "2rem" }}>
            <NeighborhoodBenchmark zipCode={activeProperty.zipCode} score={homegenticScore} />
          </div>
        )}

        {/* Score Goal Widget */}
        {!loading && hasProperty && (
          <div style={{ marginBottom: "2.5rem", border: `1px solid ${UI.rule}`, background: COLORS.white, borderRadius: RADIUS.card, overflow: "hidden" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.white }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Score Goal
              </p>
              {scoreGoal !== null && (
                <button
                  onClick={() => setScoreGoal(null)}
                  style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Change goal
                </button>
              )}
            </div>

            {scoreGoal === null ? (
              <div style={{ padding: "1.25rem" }}>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginBottom: "0.875rem" }}>
                  Set a target score to track your progress:
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[60, 75, 88, 100].map((g) => (
                    <button
                      key={g}
                      onClick={() => setScoreGoal(g)}
                      disabled={homegenticScore >= g}
                      style={{
                        flex: 1, padding: "0.875rem", border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.sm, cursor: homegenticScore >= g ? "default" : "pointer",
                        background: homegenticScore >= g ? COLORS.sageLight : COLORS.white,
                        opacity: homegenticScore >= g ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: homegenticScore >= g ? COLORS.sage : UI.ink }}>{g}</div>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, marginTop: "0.25rem" }}>
                        {g === 60 ? "Good" : g === 75 ? "Great" : g === 88 ? "Excellent" : "Perfect"}
                      </div>
                      {homegenticScore >= g && (
                        <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: COLORS.sage, marginTop: "0.2rem" }}>✓ Achieved</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : homegenticScore >= scoreGoal ? (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: COLORS.sage, marginBottom: "0.375rem" }}>
                  Goal reached — {homegenticScore}/{scoreGoal} ✓
                </p>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginBottom: "1rem" }}>
                  Your HomeGentic Score hit {scoreGoal}. Set a new goal to keep improving.
                </p>
                <button
                  onClick={() => setScoreGoal(null)}
                  style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${UI.rule}`, background: "none", cursor: "pointer", color: UI.inkLight, borderRadius: RADIUS.sm }}
                >
                  Set next goal
                </button>
              </div>
            ) : (
              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                    Current: <strong style={{ color: UI.ink }}>{homegenticScore}</strong>
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                    Goal: <strong style={{ color: UI.rust }}>{scoreGoal}</strong>
                  </span>
                </div>
                <div style={{ height: "6px", background: UI.rule, marginBottom: "0.75rem", borderRadius: 100 }}>
                  <div style={{
                    height: "100%", width: `${(homegenticScore / scoreGoal) * 100}%`,
                    background: `linear-gradient(to right, ${COLORS.sage}, ${COLORS.sageMid})`,
                    transition: "width 0.5s ease", borderRadius: 100,
                  }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {scoreGoalGap && (
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, lineHeight: 1.5, flex: 1 }}>
                      {scoreGoalGap}
                    </p>
                  )}
                  <button
                    onClick={() => openLogJob(undefined)}
                    style={{
                      fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "0.4rem 0.875rem", background: UI.ink, color: UI.paper, border: "none", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: "0.375rem", flexShrink: 0, marginLeft: "1rem",
                      borderRadius: RADIUS.pill,
                    }}
                  >
                    Log a Job <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Smart Recommendations */}
        {!loading && recommendations.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Recommended Projects
              </span>
              <button
                onClick={() => navigate("/market")}
                style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                See all →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "1rem" }}>
              {recommendations.map((rec) => {
                const priorityColor = rec.priority === "High" ? UI.rust : rec.priority === "Medium" ? COLORS.plumMid : UI.inkLight;
                return (
                  <div key={rec.name} style={{ background: COLORS.white, padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, boxShadow: SHADOWS.card, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: UI.ink, lineHeight: 1.2 }}>{rec.name}</p>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: priorityColor, border: `1px solid ${priorityColor}`, padding: "0.1rem 0.4rem", flexShrink: 0, opacity: 0.8, borderRadius: 100 }}>
                        {rec.priority}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                      <div>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>Est. Cost</p>
                        <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.95rem", color: UI.ink }}>${(rec.estimatedCostCents / 100).toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>ROI</p>
                        <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.95rem", color: UI.sage }}>{rec.estimatedRoiPercent}%</p>
                      </div>
                    </div>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.04em", lineHeight: 1.5, flex: 1 }}>
                      {rec.rationale}
                    </p>
                    <button
                      onClick={() => openLogJob({ serviceType: rec.category })}
                      style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.75rem", border: `1px solid ${UI.rule}`, background: "none", color: UI.inkLight, cursor: "pointer", alignSelf: "flex-start", borderRadius: RADIUS.sm }}
                    >
                      Log This Job →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Buyer Premium Estimate */}
        {!loading && hasJob && hasProperty && (() => {
          const est = premiumEstimate(homegenticScore);
          if (!est) return null;
          const market = activeProperty ? `${activeProperty.city}, ${activeProperty.state}` : "your market";
          return (
            <div style={{
              border: `1px solid ${UI.rust}30`, padding: "1.25rem 1.5rem", marginBottom: "2.5rem",
              background: COLORS.sageLight, borderRadius: RADIUS.card,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.375rem" }}>
                    Your Score in {market}
                  </p>
                  <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, color: UI.ink }}>
                    ${est.low.toLocaleString()} – ${est.high.toLocaleString()}
                  </p>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.375rem" }}>
                    estimated buyer premium above unverified comparable
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "0.625rem" }}>
                    HomeGentic Score <strong style={{ color: UI.ink }}>{homegenticScore}</strong> · Grade <strong style={{ color: UI.ink }}>{scoreGrade}</strong>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate("/resale-ready")}
                      style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${UI.rust}`, color: UI.rust, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
                    >
                      See Full Analysis →
                    </button>
                    {activeProperty && (
                      <button
                        onClick={async () => {
                          const payload = {
                            address:     activeProperty.address,
                            score:       homegenticScore,
                            grade:       scoreGrade,
                            certified,
                            generatedAt: Date.now(),
                            planTier:    userTier,
                            breakdown:   computeBreakdown(jobs, [activeProperty]),
                          };
                          const { token } = await certService.issueCert(String(activeProperty.id), payload);
                          const url = `${window.location.origin}/cert/${token}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Lender certificate link copied!");
                        }}
                        style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${UI.rule}`, color: UI.inkLight, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
                      >
                        Copy Cert Link
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: UI.inkLight, marginTop: "0.875rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "0.625rem", lineHeight: 1.6 }}>
                Based on verified maintenance records for score band {homegenticScore < 55 ? "40–54" : homegenticScore < 70 ? "55–69" : homegenticScore < 85 ? "70–84" : "85+"}.
                Buyers and lenders pay more for homes with documented, verified maintenance history. Individual market conditions vary.
              </p>
            </div>
          );
        })()}

        {/* Warranty expiry alerts */}
        {!loading && expiringWarranties.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust }}>
                Warranties Expiring Soon
              </p>
              <button onClick={() => navigate("/warranties")} style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                View all →
              </button>
            </div>
            <div style={{ border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {expiringWarranties.map((job, i) => {
                const expiry   = new Date(job.date).getTime() + (job.warrantyMonths ?? 0) * 30.44 * 24 * 60 * 60 * 1000;
                const daysLeft = Math.round((expiry - Date.now()) / (24 * 60 * 60 * 1000));
                const color    = daysLeft <= 30 ? UI.rust : COLORS.plumMid;
                return (
                  <div key={job.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1rem", borderBottom: i < expiringWarranties.length - 1 ? `1px solid ${UI.rule}` : "none", background: COLORS.white }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{job.serviceType}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>{job.isDiy ? "DIY" : job.contractorName} · {job.date}</p>
                    </div>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color, border: `1px solid ${color}40`, padding: "0.2rem 0.6rem", flexShrink: 0, borderRadius: 100 }}>
                      {daysLeft}d left
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

          </>
        )}

        {/* Multi-property overview */}
        {!loading && isAllView && propertyComparison && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "1rem" }}>
              Property Comparison
            </div>
            <div style={{ border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "0.5rem 1rem", background: UI.paper, borderBottom: `1px solid ${UI.rule}`, minWidth: isMobile ? "600px" : undefined }}>
                {["Address", "Score", "Value Added", "Verified Jobs", "Level"].map((h) => (
                  <div key={h} style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>{h}</div>
                ))}
              </div>
              {propertyComparison.map((row, i) => {
                const isTop = i === 0;
                return (
                  <div
                    key={String(row.property.id)}
                    onClick={() => navigate(`/properties/${row.property.id}`)}
                    style={{
                      display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                      minWidth: isMobile ? "600px" : undefined,
                      padding: "0.875rem 1rem", alignItems: "center",
                      borderBottom: i < propertyComparison.length - 1 ? `1px solid ${UI.rule}` : "none",
                      background: isTop ? COLORS.sageLight : COLORS.white,
                      cursor: "pointer",
                      borderLeft: isTop ? `3px solid ${UI.sage}` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isTop ? COLORS.sageLight : COLORS.white; }}
                  >
                    <div>
                      <p style={{ fontSize: "0.8rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.property.address}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{row.property.city}, {row.property.state}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                      <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.125rem", color: isTop ? UI.sage : UI.ink }}>{row.score}</span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{row.grade}</span>
                    </div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.ink }}>${(row.value / 100).toLocaleString()}</div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.ink }}>{row.verified} / {row.jobCount}</div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{row.property.verificationLevel}</div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "1rem" }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button variant="outline" icon={<Plus size={14} />}          onClick={() => navigate("/properties/new")}>Add Property</Button>
            <Button variant="outline" icon={<Wrench size={14} />}        onClick={() => openLogJob(undefined)}>Log a Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={openQuote}>Request Quote</Button>
            <Button variant="outline" icon={<Home size={14} />}          onClick={() => navigate("/contractors")}>Find Contractors</Button>
            <Button variant="outline" icon={<ShieldCheck size={14} />}   onClick={() => navigate("/insurance-defense")}>Insurance Defense</Button>
          </div>
        </div>

        {/* Properties */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "1rem" }}>
            My Properties
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}><div className="spinner-lg" /></div>
          ) : properties.length === 0 ? (
            <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
              <Home size={40} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No properties yet</p>
              <p style={{ fontSize: "0.875rem", color: UI.inkLight, fontWeight: 300, maxWidth: "24rem", margin: "0 auto 1.5rem" }}>
                Add your first property to start building a verified, on-chain maintenance history.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <Button onClick={() => navigate("/onboarding")} icon={<Sparkles size={14} />}>Get started</Button>
                <Button variant="outline" onClick={() => navigate("/properties/new")} icon={<Plus size={14} />}>Add property</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem" }}>
              {properties.map((property) => (
                <PropertyCard key={String(property.id)} property={property} onClick={() => navigate(`/properties/${property.id}`)} badge={verificationBadge(property.verificationLevel)} />
              ))}
            </div>
          )}
        </div>

        {/* Pending Contractor Proposals */}
        {pendingProposals.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Pending Contractor Proposals
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "0.1rem 0.5rem", background: COLORS.sage, color: "#fff", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
                {pendingProposals.length} awaiting review
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pendingProposals.map((proposal) => (
                <div
                  key={proposal.id}
                  data-testid="pending-proposal-card"
                  style={{
                    border: `1px solid ${UI.rule}`,
                    padding: "1rem 1.25rem",
                    display: "flex", flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "flex-start" : "center",
                    gap: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: UI.ink, fontWeight: 600 }}>
                        {proposal.serviceType}
                      </span>
                      {(proposal as any).potentialDuplicateOf && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#C94C2E", border: "1px solid rgba(201,76,46,0.4)", padding: "0.1rem 0.4rem" }}>
                          <AlertTriangle size={9} /> Possible duplicate
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: UI.ink, marginBottom: "0.25rem" }}>
                      {proposal.description}
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                      {proposal.contractorName && (
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>By {proposal.contractorName}</span>
                      )}
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{proposal.date}</span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                        ${(proposal.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    <button
                      onClick={() => jobSummary.approveProposal(proposal.id)}
                      data-testid="approve-proposal"
                      style={{
                        display: "flex", alignItems: "center", gap: "0.25rem",
                        fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "0.4rem 0.875rem", background: COLORS.sage, color: COLORS.white,
                        border: "none", cursor: "pointer",
                      }}
                    >
                      <CheckCircle size={11} /> Approve
                    </button>
                    <button
                      onClick={() => jobSummary.rejectProposal(proposal.id)}
                      data-testid="reject-proposal"
                      style={{
                        display: "flex", alignItems: "center", gap: "0.25rem",
                        fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "0.4rem 0.875rem", background: "none", color: UI.inkLight,
                        border: `1px solid ${UI.rule}`, cursor: "pointer",
                      }}
                    >
                      <XCircle size={11} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Properties I Manage (delegated access) */}
        {managedProperties.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "1rem" }}>
              Properties I Manage
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem" }}>
              {managedProperties.map(({ property, role }) => (
                <div
                  key={String(property.id)}
                  onClick={() => navigate(`/properties/${property.id}`)}
                  style={{ border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", cursor: "pointer", background: COLORS.white, display: "flex", flexDirection: "column", gap: "0.5rem" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.white; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                    <p style={{ fontFamily: FONTS.sans, fontWeight: 500, fontSize: "0.875rem", color: UI.ink, margin: 0 }}>{property.address}</p>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.15rem 0.45rem", border: `1px solid ${role === "Manager" ? UI.ink : UI.rule}`, color: role === "Manager" ? UI.ink : UI.inkLight, flexShrink: 0 }}>
                      {role}
                    </span>
                  </div>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, margin: 0 }}>
                    {property.city}, {property.state} {property.zipCode}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Owner Notifications (manager activity on my properties) */}
        {ownerNotifs.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                  Manager Activity
                </div>
                {ownerNotifs.some((n) => !n.seen) && (
                  <div style={{ display: "inline-flex", padding: "0.1rem 0.5rem", background: COLORS.sage, color: "#fff", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
                    {ownerNotifs.filter((n) => !n.seen).length} new
                  </div>
                )}
              </div>
              {ownerNotifs.some((n) => !n.seen) && (
                <button
                  onClick={dismissAllNotifications}
                  style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.75rem", background: "none", border: `1px solid ${UI.rule}`, color: UI.inkLight, cursor: "pointer" }}
                >
                  Mark all seen
                </button>
              )}
            </div>
            <div style={{ border: `1px solid ${UI.rule}` }}>
              {ownerNotifs.slice(0, 10).map((n, i) => (
                <div
                  key={n.id}
                  style={{
                    padding: "0.875rem 1.25rem",
                    borderBottom: i < Math.min(ownerNotifs.length, 10) - 1 ? `1px solid ${UI.rule}` : "none",
                    background: n.seen ? COLORS.white : COLORS.sageLight,
                    display: "flex", flexDirection: "column", gap: "0.2rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 600, color: UI.ink }}>{n.managerName}</span>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, flexShrink: 0 }}>
                      {new Date(n.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.78rem", color: UI.inkLight, margin: 0, fontWeight: 300, lineHeight: 1.4 }}>
                    {n.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quote Requests */}
        {quoteRequests.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                  Quote Requests
                </div>
                {pendingQuoteCount(quoteRequests) > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "0.1rem 0.5rem", background: UI.rust, color: "#fff", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
                    {pendingQuoteCount(quoteRequests)} {pendingQuoteCount(quoteRequests) === 1 ? "bid" : "bids"} waiting
                  </div>
                )}
              </div>
              <button
                onClick={openQuote}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.rust, background: "none", border: `1px solid ${UI.rust}`, cursor: "pointer", padding: "0.3rem 0.75rem", borderRadius: RADIUS.sm }}
              >
                <Plus size={11} /> New Request
              </button>
            </div>
            <div style={{ border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {quoteRequests.map((req, i) => {
                const statusVariant =
                  req.status === "accepted" ? "success"
                  : req.status === "quoted"  ? "info"
                  : req.status === "closed"  ? "default"
                  : "warning";
                const isNew    = isNewSince(req.createdAt, lastLoginAt);
                const hasBids  = hasQuoteActivity(req.status);
                const bidCount = bidCountMap[req.id] ?? 0;
                const daysAgo  = Math.floor((Date.now() - req.createdAt) / 86400000);
                const ageLabel = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`;
                const stale    = req.status === "open" && daysAgo >= 5;
                const rowBg    = hasBids ? COLORS.sageLight : COLORS.white;
                return (
                  <div
                    key={req.id}
                    onClick={() => navigate(`/quotes/${req.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1rem",
                      borderBottom: i < quoteRequests.length - 1 ? `1px solid ${UI.rule}` : "none",
                      background: rowBg, cursor: "pointer",
                      borderLeft: hasBids ? `3px solid ${UI.rust}` : stale ? `3px solid ${COLORS.plumMid}` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                      <MessageSquare size={13} color={hasBids ? UI.rust : UI.inkLight} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.serviceType}
                        {stale && (
                          <span style={{ marginLeft: "0.5rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid }}>
                            No bids yet
                          </span>
                        )}
                      </p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.description}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexShrink: 0 }}>
                      {bidCount > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "2rem" }}>
                          <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1rem", lineHeight: 1, color: UI.rust }}>{bidCount}</span>
                          <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>{bidCount === 1 ? "bid" : "bids"}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        {isNew && (
                          <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.rust, border: `1px solid ${UI.rust}`, padding: "0.1rem 0.4rem", borderRadius: 100 }}>
                            New
                          </span>
                        )}
                        <Badge variant={statusVariant} size="sm">{req.status}</Badge>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>{ageLabel}</span>
                      </div>
                      <ArrowRight size={13} color={UI.inkLight} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next-service prompt (8.6.2) */}
        {showNextService && nextServiceTip && recentVerified && (
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", gap: "0.75rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <Calendar size={13} color={UI.sage} />
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.2rem" }}>
                  Next Step — {recentVerified.serviceType}
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 400, color: UI.ink, marginBottom: "0.5rem" }}>
                  {nextServiceTip}
                </p>
                <button
                  onClick={() => navigate(`/maintenance?system=${encodeURIComponent(recentVerified.serviceType)}`)}
                  style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", border: `1px solid ${UI.sage}`, background: "none", color: UI.sage, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Add to Maintenance Schedule →
                </button>
              </div>
            </div>
            <button
              onClick={() => { localStorage.setItem(nextServiceKey, "1"); setNextServiceDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Contractor re-engagement prompts (8.6.4) */}
        {visibleReEngagements.map((prompt) => (
          <div
            key={prompt.jobId}
            style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
              border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", marginBottom: "1rem",
              background: COLORS.white, flexWrap: "wrap", borderRadius: RADIUS.sm,
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <ShieldCheck size={13} color={UI.sage} />
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.2rem" }}>
                  Book Again — {prompt.serviceType}
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 400, color: UI.ink, marginBottom: "0.5rem" }}>
                  {prompt.message}
                </p>
                <button
                  onClick={() => navigate(`/quotes/new?contractor=${encodeURIComponent(prompt.contractorName)}&service=${encodeURIComponent(prompt.serviceType)}`)}
                  style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", border: `1px solid ${UI.sage}`, background: "none", color: UI.sage, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Request Quote →
                </button>
              </div>
            </div>
            <button
              onClick={() => d.dismissReEngagement(prompt.jobId)}
              style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Score event feed (8.2.1–8.2.2, 8.7.5) */}
        {!loading && <ScoreActivityFeed scoreEvents={scoreEvents} decayEvents={decayEvents} />}

        {/* Recurring Services */}
        {hasProperty && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Recurring Services
              </div>
              <button
                onClick={() => navigate("/recurring/new")}
                style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${UI.rust}`, color: UI.rust, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
              >
                + Add
              </button>
            </div>
            {recurringServices.length === 0 ? (
              <div style={{ border: `1px solid ${UI.rule}`, background: "#fff", padding: "1.5rem", textAlign: "center", borderRadius: RADIUS.card }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 300, color: UI.inkLight, marginBottom: "0.75rem" }}>
                  Lawn care, pest control, pool service — log ongoing contracts once and let the visit log do the rest.
                </p>
                <button
                  onClick={() => navigate("/recurring/new")}
                  style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: `1px solid ${UI.ink}`, background: "none", cursor: "pointer", color: UI.ink, borderRadius: RADIUS.sm }}
                >
                  Add first service →
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {recurringServices.map((svc) => (
                  <RecurringServiceCard
                    key={svc.id}
                    service={svc}
                    visitLogs={visitLogMap[svc.id] ?? []}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Activity */}
        {jobs.length > 0 && (
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "1rem" }}>
              Recent Activity
            </div>
            <div style={{ border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {jobs.slice(0, 5).map((job, i) => (
                <div key={job.id} className="rsp-activity-row" style={{ borderBottom: i < Math.min(jobs.length, 5) - 1 ? `1px solid ${UI.rule}` : "none", background: "#fff" }}>
                  <div style={{ width: "2rem", height: "2rem", border: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                    <Wrench size={13} color={UI.inkLight} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.serviceType} — {job.isDiy ? "DIY" : job.contractorName}
                    </p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>{job.date}</p>
                  </div>
                  <div className="rsp-activity-right">
                    <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", fontWeight: 500 }}>${(job.amount / 100).toLocaleString()}</p>
                    <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">
                      {job.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <LogJobModal
        isOpen={modals.showLogJobModal}
        onClose={closeLogJob}
        onSuccess={() => { jobSummary.reload(); quoteSummary.reload(); }}
        properties={properties}
        prefill={modals.logJobPrefill}
      />

      <RequestQuoteModal
        isOpen={modals.showQuoteModal}
        onClose={closeQuote}
        onSuccess={(quoteId) => { closeQuote(); navigate(`/quotes/${quoteId}`); }}
        properties={properties}
      />

      <UpgradeModal
        open={modals.showUpgradeModal}
        onClose={closeUpgrade}
      />

    </Layout>
  );
}
