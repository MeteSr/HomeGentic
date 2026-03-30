import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X, ShieldCheck, Calendar } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { quoteService, QuoteRequest } from "@/services/quote";
import { recurringService, RecurringService, VisitLog } from "@/services/recurringService";
import { RecurringServiceCard } from "@/components/RecurringServiceCard";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { isNewSince, hasQuoteActivity, pendingQuoteCount } from "@/services/notifications";
import { computeScore, computeScoreWithDecay, getScoreGrade, loadHistory, recordSnapshot, scoreDelta, premiumEstimate, isCertified, type ScoreSnapshot } from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, decayCategoryColor, decayCategoryBg, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { systemAgesService, type SystemAges } from "@/services/systemAges";
import { certService } from "@/services/cert";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import { getWeeklyPulse } from "@/services/pulseService";
import { marketService, jobToSummary, type PropertyProfile, type ProjectRecommendation } from "@/services/market";
import { getRecentScoreEvents, categoryColor, categoryBg, type ScoreEvent } from "@/services/scoreEventService";
import { getReEngagementPrompts, type ReEngagementPrompt } from "@/services/reEngagementService";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { NeighborhoodBenchmark } from "@/components/NeighborhoodBenchmark";
import { ScoreActivityFeed } from "@/components/ScoreActivityFeed";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,       // primary accent: sage replaces rust
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { principal, profile, lastLoginAt } = useAuthStore();
  const { properties, setProperties } = usePropertyStore();
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const propertyInitialized = useRef(false);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [bidCountMap,   setBidCountMap]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [recurringServices, setRecurringServices] = useState<RecurringService[]>([]);
  const [visitLogMap, setVisitLogMap] = useState<Record<string, VisitLog[]>>({});
  const [bannerDismissed,     setBannerDismissed]     = useState(false);
  const [showScoreBreakdown,  setShowScoreBreakdown]  = useState(false);
  const [showScoreChart,      setShowScoreChart]      = useState(false);
  const [scoreGoal, setScoreGoalState] = useState<number | null>(null);
  const [milestoneDismissed,    setMilestoneDismissed]    = useState(() => !!localStorage.getItem("homefax_milestone_dismissed"));
  const [milestone3Dismissed,   setMilestone3Dismissed]   = useState(() => !!localStorage.getItem("homefax_3job_milestone"));
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(() => !!localStorage.getItem("homefax_upgrade_banner_dismissed"));
  const [pulseDismissed,        setPulseDismissed]        = useState(() => !!localStorage.getItem(`homefax_pulse_${new Date().toISOString().slice(0, 7)}`));
  const [scoreIncreaseDismissed, setScoreIncreaseDismissed] = useState(() => false);
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>([]);
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [logJobPrefill,    setLogJobPrefill]    = useState<{ serviceType?: string; contractorName?: string } | undefined>(undefined);
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
  const [userTier,         setUserTier]         = useState<PlanTier>("Free");
  const [systemAges,       setSystemAges]       = useState<SystemAges>({});

  useEffect(() => {
    loadProperties().then((props) => {
      const list = props ?? [];
      // Single-property users belong on their property page
      if (list.length === 1) {
        navigate(`/properties/${list[0].id}`, { replace: true });
        return;
      }
      Promise.all([
        loadAllJobs(list),
        loadQuoteRequests(),
        loadRecurringServices(),
        paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {}),
      ]).finally(() => setLoading(false));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProperties(): Promise<Property[]> {
    if ((window as any).__e2e_properties) {
      const list = (window as any).__e2e_properties as Property[];
      setProperties(list);
      return list;
    }
    try {
      const list = await propertyService.getMyProperties();
      setProperties(list);
      return list;
    } catch (err: any) {
      toast.error("Failed to load properties: " + err.message);
      return [];
    }
  }

  async function loadAllJobs(propList: typeof properties) {
    try {
      if (propList.length === 0) { setAllJobs([]); return; }
      const perProp = await Promise.all(
        propList.map((p) => jobService.getByProperty(String(p.id)).catch(() => [] as Job[]))
      );
      const merged = perProp.flat();
      // Fall back to getAll() in mock/dev when per-property returns nothing
      setAllJobs(merged.length > 0 ? merged : await jobService.getAll().catch(() => []));
    } catch { /* canister not deployed */ }
  }

  async function loadRecurringServices() {
    try {
      const props = (typeof window !== "undefined" && (window as any).__e2e_properties)
        || [];
      // Load after properties are set — use store or fallback to empty
      const { usePropertyStore: store } = await import("@/store/propertyStore");
      const propList = store.getState().properties;
      if (propList.length === 0 && props.length === 0) return;
      const list = propList.length > 0 ? propList : props;
      const allServices: RecurringService[] = [];
      for (const p of list) {
        const svcs = await recurringService.getByProperty(String(p.id));
        allServices.push(...svcs);
      }
      setRecurringServices(allServices);
      // Load visit logs for each service
      const logEntries = await Promise.all(
        allServices.map(async (s) => {
          const logs = await recurringService.getVisitLogs(s.id).catch(() => [] as VisitLog[]);
          return [s.id, logs] as [string, VisitLog[]];
        })
      );
      setVisitLogMap(Object.fromEntries(logEntries));
    } catch { /* canister not deployed */ }
  }

  async function loadQuoteRequests() {
    try {
      const reqs = await quoteService.getRequests();
      setQuoteRequests(reqs);
      if (reqs.length > 0) {
        quoteService.getBidCountMap(reqs.map((r) => r.id)).then(setBidCountMap).catch(() => {});
      }
    } catch { /* canister not deployed */ }
  }

  // Property-centric derived values
  const activePropertyId = selectedPropertyId ?? (properties.length === 1 ? String(properties[0].id) : null);
  const activeProperty   = activePropertyId
    ? properties.find((p) => String(p.id) === activePropertyId) ?? null
    : null;
  const isAllView = activePropertyId === null && properties.length > 1;

  // jobs = all jobs filtered to the selected property (or all when in "all view")
  const jobs = activePropertyId
    ? allJobs.filter((j) => j.propertyId === activePropertyId)
    : allJobs;

  const totalValue    = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);
  const decayEvents: DecayEvent[]   = React.useMemo(
    () => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const atRiskWarnings: AtRiskWarning[] = React.useMemo(
    () => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const totalDecay    = getTotalDecay(decayEvents);
  const homefaxScore  = activeProperty ? computeScoreWithDecay(jobs, [activeProperty], totalDecay) : 0;
  const scoreGrade    = getScoreGrade(homefaxScore);
  const delta         = scoreDelta(scoreHistory);

  const hasProperty  = properties.length > 0;
  const hasVerified  = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob       = jobs.length > 0;
  const showBanner   = !loading && !(hasProperty && hasVerified && hasJob) && !bannerDismissed;
  const certified    = isCertified(homefaxScore, jobs);

  const scoreAlertsEnabled = localStorage.getItem("homefax_score_alerts") !== "false";
  const showScoreIncrease  = !loading && hasJob && delta > 0 && scoreAlertsEnabled && !scoreIncreaseDismissed;

  // Next-service prompt (8.6.2) — most recently verified job's follow-up tip
  const NEXT_SERVICE_TIPS: Record<string, string> = {
    HVAC:       "Schedule HVAC filter replacement in 3 months to maintain efficiency.",
    Roofing:    "Book an annual roof inspection to catch early wear.",
    Plumbing:   "Check water heater anode rod in 12 months to prevent corrosion.",
    Electrical: "Schedule a panel safety inspection in 3 years.",
    Flooring:   "Consider re-sealing or refinishing flooring in 2 years.",
    Painting:   "Plan a touch-up inspection in 12 months.",
  };
  const recentVerified = jobs
    .filter((j) => j.status === "verified")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
  const nextServiceTip = recentVerified ? NEXT_SERVICE_TIPS[recentVerified.serviceType] ?? null : null;
  const nextServiceKey = `homefax_next_service_${recentVerified?.id ?? ""}`;
  const [nextServiceDismissed, setNextServiceDismissed] = React.useState(
    () => !!localStorage.getItem(nextServiceKey)
  );
  const showNextService = !loading && !!nextServiceTip && !nextServiceDismissed;

  // Contractor re-engagement prompts (8.6.4)
  const reEngagementPrompts: ReEngagementPrompt[] = React.useMemo(
    () => (!loading ? getReEngagementPrompts(jobs) : []),
    [jobs, loading]
  );
  const [dismissedReEngagements, setDismissedReEngagements] = React.useState<Set<string>>(
    () => new Set(Object.keys(localStorage).filter((k) => k.startsWith("homefax_reengage_")).map((k) => k.replace("homefax_reengage_", "")))
  );
  const visibleReEngagements = reEngagementPrompts.filter((p) => !dismissedReEngagements.has(p.jobId));

  // Score events (8.2.1–8.2.2)
  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []),
    [jobs, activeProperty, loading]
  );

  // Score breakdown — per-component contribution for the explanatory panel
  const scoreBreakdown = React.useMemo(() => {
    const verifiedJobs     = jobs.filter((j) => j.verified);
    const verifiedJobPts   = Math.min(verifiedJobs.length * 4, 40);
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

  // Warranty expiry alerts — jobs with warranty expiring within 90 days
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

  // Annual 12-month milestone
  const accountAgeMs = profile?.createdAt
    ? Date.now() - Number(profile.createdAt) / 1_000_000
    : 0;
  const milestoneKey  = "homefax_milestone_dismissed";
  const showMilestone = !loading && hasJob && !milestoneDismissed
    && accountAgeMs >= 11 * 30 * 24 * 60 * 60 * 1000;

  // Home Pulse — rule-based weekly maintenance focus tip
  const pulseKey     = `homefax_pulse_${new Date().toISOString().slice(0, 7)}`;
  const pulseEnabled = localStorage.getItem("homefax_pulse_enabled") !== "false";
  const pulseTip     = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);
  const showPulse    = !loading && hasProperty && !!pulseTip && !pulseDismissed && pulseEnabled;

  // Multi-property score comparison — computed when user has 2+ properties
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

  // Score stagnation — true when score hasn't increased in 4+ weeks
  const scoreStagnant = React.useMemo(() => {
    if (!hasProperty || scoreHistory.length < 2) return false;
    const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
    const now     = Date.now();
    const current = scoreHistory[scoreHistory.length - 1];
    const old     = scoreHistory.find((s) => now - s.timestamp >= FOUR_WEEKS_MS);
    if (!old) return false;
    return current.score <= old.score;
  }, [scoreHistory, hasProperty]);

  // Smart project recommendations — top 3 ROI-ranked for active property
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

  // Score goal helpers
  const scoreGoalKey = activePropertyId ? `homefax_score_goal_${activePropertyId}` : "homefax_score_goal";
  const setScoreGoal = (goal: number | null) => {
    setScoreGoalState(goal);
    if (goal === null) localStorage.removeItem(scoreGoalKey);
    else localStorage.setItem(scoreGoalKey, String(goal));
  };

  const scoreGoalGap = React.useMemo((): string | null => {
    if (!scoreGoal || homefaxScore >= scoreGoal) return null;
    const gap = scoreGoal - homefaxScore;
    // Determine easiest action to close gap
    const verifiedJobs  = jobs.filter((j) => j.verified).length;
    const needVerified  = Math.ceil(gap / 4); // 4 pts per verified job
    const needValueK    = Math.ceil((gap / 20) * 50000 / 1000); // pts from value
    const uniqueTypes   = new Set(jobs.map((j) => j.serviceType)).size;
    if (gap <= 4)  return `Verify 1 more job to reach ${scoreGoal}`;
    if (gap <= 8)  return `Verify ${needVerified} more job${needVerified !== 1 ? "s" : ""} to reach ${scoreGoal}`;
    if (verifiedJobs === 0) return `Start verifying jobs — each adds up to 4 pts toward ${scoreGoal}`;
    if (uniqueTypes < 5)   return `Log a new service type to add diversity points toward ${scoreGoal}`;
    return `Log $${needValueK}K in documented work to reach ${scoreGoal}`;
  }, [scoreGoal, homefaxScore, jobs]);

  // Record score snapshot once data is loaded
  useEffect(() => {
    if (!loading && activePropertyId && (jobs.length > 0 || properties.length > 0)) {
      const history = recordSnapshot(homefaxScore, activePropertyId);
      setScoreHistory(history);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize property selection after data loads (first property by default)
  useEffect(() => {
    if (!loading && properties.length > 0 && !propertyInitialized.current) {
      propertyInitialized.current = true;
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [loading, properties]);

  // Reload score history and system ages whenever the active property changes
  useEffect(() => {
    if (selectedPropertyId) {
      setScoreHistory(loadHistory(selectedPropertyId));
      setSystemAges(systemAgesService.get(selectedPropertyId));
    }
  }, [selectedPropertyId]);

  // Load per-property score goal when active property changes
  useEffect(() => {
    if (activePropertyId) {
      const v = localStorage.getItem(`homefax_score_goal_${activePropertyId}`);
      setScoreGoalState(v ? parseInt(v, 10) : null);
    }
  }, [activePropertyId]);

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
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
              Overview
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
              Dashboard
            </h1>
            {principal && (
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.375rem" }}>
                {principal.slice(0, 16)}…
                {profile?.email && ` · ${profile.email}`}
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
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "0.375rem 0.875rem",
                background: isAllView ? COLORS.plum : "none",
                color: isAllView ? COLORS.white : S.inkLight,
                border: `1px solid ${isAllView ? COLORS.plum : S.rule}`,
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
                    fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em",
                    padding: "0.375rem 0.875rem",
                    background: isActive ? COLORS.plum : "none",
                    color: isActive ? COLORS.white : S.inkLight,
                    border: `1px solid ${isActive ? COLORS.plum : S.rule}`,
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
                <Home size={14} color={S.sage} />
              </div>
              <div>
                <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.95rem", color: S.ink, lineHeight: 1.2 }}>
                  {activeProperty.address}
                </p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, marginTop: "0.15rem" }}>
                  {activeProperty.city}, {activeProperty.state} · {verificationBadge(activeProperty.verificationLevel)}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/properties/${activeProperty.id}`)}
              style={{
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`,
                color: S.inkLight, background: "none", cursor: "pointer", borderRadius: RADIUS.sm,
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
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Sparkles size={16} color={S.rust} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Finish setting up
                </p>
                <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>
                  {!hasProperty ? "Add your first property to start building your home's verified history."
                    : !hasVerified ? "Verify ownership so buyers can trust your history."
                    : "Log your first job to add value to your HomeFax report."}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                onClick={() => navigate("/onboarding")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.5rem 1rem", background: S.rust, color: "#fff",
                  border: "none", fontFamily: S.mono, fontSize: "0.65rem",
                  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                  borderRadius: RADIUS.pill,
                }}
              >
                Continue setup <ArrowRight size={12} />
              </button>
              <button onClick={() => setBannerDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight }}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Annual milestone banner */}
        {showMilestone && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: S.ink, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.25rem" }}>
                One Year of HomeFax
              </p>
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.875rem", color: S.paper, fontWeight: 300 }}>
                You've been building your verified home history for nearly a year.{" "}
                <strong style={{ fontWeight: 600 }}>${(totalValue / 100).toLocaleString()} in documented improvements</strong> — that's real value for your next sale.
              </p>
              <button
                onClick={() => navigate("/resale-ready")}
                style={{ marginTop: "0.5rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: `1px solid ${S.rust}`, background: "none", color: S.rust, cursor: "pointer", borderRadius: RADIUS.sm }}
              >
                View Resale Summary →
              </button>
            </div>
            <button
              onClick={() => { localStorage.setItem(milestoneKey, "1"); setMilestoneDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* 3-verified-jobs milestone */}
        {!loading && verifiedCount >= 3 && !milestone3Dismissed && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.sage}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `2px solid ${S.sage}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: S.sage, borderRadius: RADIUS.sm }}>
                <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "0.875rem" }}>3</span>
              </div>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.sage, marginBottom: "0.2rem" }}>
                  Milestone — Your Home History Is Taking Shape
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 300, color: S.ink }}>
                  <strong style={{ fontWeight: 600 }}>{verifiedCount} verified records</strong> on the blockchain. Buyers can now see a real maintenance history.
                </p>
              </div>
            </div>
            <button
              onClick={() => { localStorage.setItem("homefax_3job_milestone", "1"); setMilestone3Dismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.sage, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Free-tier upgrade nudge — shown after 3rd job logged (15.7.2) */}
        {!loading && userTier === "Free" && jobs.length >= 3 && !upgradeBannerDismissed && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1.5px solid ${COLORS.sageMid}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: COLORS.sageLight, flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `2px solid ${S.sage}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm, fontSize: "1rem" }}>
                🔓
              </div>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.sage, marginBottom: "0.2rem" }}>
                  Upgrade to Pro
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 300, color: S.ink }}>
                  You've logged <strong style={{ fontWeight: 600 }}>{jobs.length} jobs</strong>. Unlock score breakdowns, warranty tracking, and full report sharing with Pro.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
              <button
                onClick={() => navigate("/pricing")}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.45rem 1rem", border: "none", background: S.sage, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm, fontWeight: 600 }}
              >
                See Plans →
              </button>
              <button
                onClick={() => { localStorage.setItem("homefax_upgrade_banner_dismissed", "1"); setUpgradeBannerDismissed(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight }}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Home Pulse tip */}
        {showPulse && pulseTip && (
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", gap: "0.875rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.125rem", borderRadius: RADIUS.sm }}>
                <Sparkles size={13} color={S.rust} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.rust }}>
                    Home Pulse
                  </p>
                  <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, border: `1px solid ${S.rule}`, padding: "0.05rem 0.375rem", borderRadius: 100 }}>
                    {pulseTip.category}
                  </span>
                </div>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>{pulseTip.headline}</p>
                <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>{pulseTip.detail}</p>
              </div>
            </div>
            <button
              onClick={() => { localStorage.setItem(pulseKey, "1"); setPulseDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Score stagnation nudge */}
        {!loading && scoreStagnant && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <Sparkles size={13} color={S.inkLight} />
              </div>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.2rem" }}>
                  Score Hasn't Moved in 30 Days
                </p>
                <p style={{ fontSize: "0.8rem", fontWeight: 300, color: S.inkLight }}>
                  Log a recent job or verify a property to keep your HomeFax Score growing.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setLogJobPrefill(undefined); setShowLogJobModal(true); }}
              style={{
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "0.5rem 1rem", background: S.ink, color: S.paper,
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
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, color: "#b45309" }}>!</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#b45309", marginBottom: "0.375rem" }}>
                Score at Risk
              </p>
              {atRiskWarnings.map((w) => (
                <p key={w.id} style={{ fontSize: "0.78rem", fontWeight: 300, color: "#78350f", marginBottom: "0.2rem" }}>
                  {w.label} — <strong style={{ fontWeight: 600 }}>{w.pts} pts</strong> in {w.daysRemaining} day{w.daysRemaining !== 1 ? "s" : ""}
                </p>
              ))}
              <button
                onClick={() => { setLogJobPrefill(undefined); setShowLogJobModal(true); }}
                style={{ marginTop: "0.5rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", background: "#b45309", color: "#fff", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem", borderRadius: RADIUS.pill }}
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
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage }}>
                Score Up +{delta} pts
              </span>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: COLORS.sage, opacity: 0.75 }}>
                — Your HomeFax Score is now {homefaxScore}. Keep logging jobs to grow your record.
              </span>
            </div>
            <button
              onClick={() => setScoreIncreaseDismissed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.sage, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!isAllView && (
          <>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "1rem", marginBottom: "2.5rem" }}>
          {[
            { label: "Verification", value: activeProperty?.verificationLevel === "PendingReview" ? "Pending" : (activeProperty?.verificationLevel ?? "—") },
            { label: "Verified Jobs",    value: String(verifiedCount) },
            { label: "Total Value",      value: `$${(totalValue / 100).toLocaleString()}` },
            { label: "HomeFax Premium™", value: `$${Math.round((totalValue / 100) * 0.03).toLocaleString()}` },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "1.25rem 1.5rem", borderRadius: RADIUS.card, background: COLORS.white, border: `1px solid ${COLORS.rule}`, boxShadow: SHADOWS.card }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.625rem" }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: S.ink }}>
                {stat.value}
              </div>
            </div>
          ))}
          {/* HomeFax Score — accent cell */}
          <div style={{ padding: "1.25rem 1.5rem", borderRadius: RADIUS.card, background: COLORS.plum, boxShadow: SHADOWS.hover }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.625rem" }}>
              HomeFax Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: COLORS.white }}>{homefaxScore}</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: COLORS.plumMid }}>/100 · {scoreGrade}</span>
            </div>
            {delta !== 0 && (
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: delta > 0 ? COLORS.sage : COLORS.blush, letterSpacing: "0.06em" }}>
                {delta > 0 ? "+" : ""}{delta} pts this period
              </div>
            )}
            <ScoreSparkline history={scoreHistory} onExpand={() => setShowScoreChart((v) => !v)} />
          </div>
        </div>

        {/* Free-tier job cap progress bar (15.1.3) */}
        {!loading && userTier === "Free" && (
          <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "0.875rem 1.25rem", marginBottom: "1.5rem", borderRadius: RADIUS.sm }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                Free Plan · Jobs
              </span>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, color: jobs.length >= 5 ? COLORS.sage : S.ink }}>
                {jobs.length}/5
              </span>
            </div>
            <div style={{ height: "4px", background: S.rule, borderRadius: 100, overflow: "hidden", marginBottom: "0.5rem" }}>
              <div style={{ height: "4px", width: `${Math.min(jobs.length / 5 * 100, 100)}%`, background: jobs.length >= 5 ? COLORS.sage : COLORS.plum, borderRadius: 100, transition: "width 0.5s ease" }} />
            </div>
            {jobs.length >= 5 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>Job limit reached — upgrade to keep logging</span>
                <button onClick={() => navigate("/pricing")} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.25rem 0.625rem", border: "none", background: COLORS.plum, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm, whiteSpace: "nowrap" }}>Upgrade →</button>
              </div>
            ) : (
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                {5 - jobs.length} job{5 - jobs.length !== 1 ? "s" : ""} remaining on Free plan
              </span>
            )}
          </div>
        )}

        {/* Score history chart */}
        {showScoreChart && scoreHistory.length >= 2 && (
          <div style={{ marginBottom: "2rem", border: `1px solid ${S.rule}`, background: "#fff", borderRadius: RADIUS.card, overflow: "hidden" }}>
            <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.white }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>Score History</span>
              <button onClick={() => setShowScoreChart(false)} style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Close ✕</button>
            </div>
            <ScoreHistoryChart history={scoreHistory} />
          </div>
        )}

        {/* Score breakdown panel */}
        {!loading && (jobs.length > 0 || properties.length > 0) && (
          <div style={{ marginBottom: "2rem" }}>
            <button
              onClick={() => setShowScoreBreakdown((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem", width: "100%",
                padding: "0.75rem 1rem", border: `1px solid ${S.rule}`,
                background: showScoreBreakdown ? COLORS.sageLight : COLORS.white,
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: S.inkLight, cursor: "pointer", textAlign: "left",
                borderRadius: showScoreBreakdown ? `${RADIUS.card}px ${RADIUS.card}px 0 0` : RADIUS.card,
              }}
            >
              <span style={{ flex: 1 }}>How is my HomeFax Score calculated?</span>
              <span style={{ fontSize: "0.75rem" }}>{showScoreBreakdown ? "▲" : "▼"}</span>
            </button>
            {showScoreBreakdown && userTier === "Free" && (
              <UpgradeGate
                feature="Score Breakdown"
                description="See exactly which factors are dragging your score down — and what to fix first."
                style={{ borderRadius: `0 0 ${RADIUS.card}px ${RADIUS.card}px`, borderTop: "none" }}
              />
            )}
            {showScoreBreakdown && userTier !== "Free" && (
              <div style={{ border: `1px solid ${S.rule}`, borderTop: "none", background: COLORS.white, borderRadius: `0 0 ${RADIUS.card}px ${RADIUS.card}px`, overflow: "hidden" }}>
                {scoreBreakdown.map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1rem", borderBottom: `1px solid ${S.rule}` }}>
                    <div style={{ width: "10rem", flexShrink: 0 }}>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
                        {row.label}
                      </p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, fontWeight: 300, marginTop: "0.1rem" }}>
                        {row.detail}
                      </p>
                    </div>
                    <div style={{ flex: 1, height: "4px", background: S.rule, borderRadius: 100 }}>
                      <div style={{ height: "4px", background: S.rust, width: `${(row.pts / row.max) * 100}%`, transition: "width 0.5s ease", borderRadius: 100 }} />
                    </div>
                    <div style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink }}>{row.pts}</span>
                      <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>/{row.max}</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "0.875rem 1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", background: COLORS.white }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>Total</span>
                  <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", color: S.ink }}>{homefaxScore}</span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>/100</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Neighborhood Benchmark (4.3.2) */}
        {!loading && activeProperty?.zipCode && (
          <div style={{ marginBottom: "2rem" }}>
            <NeighborhoodBenchmark zipCode={activeProperty.zipCode} score={homefaxScore} />
          </div>
        )}

        {/* Score Goal Widget */}
        {!loading && hasProperty && (
          <div style={{ marginBottom: "2.5rem", border: `1px solid ${S.rule}`, background: COLORS.white, borderRadius: RADIUS.card, overflow: "hidden" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.white }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Score Goal
              </p>
              {scoreGoal !== null && (
                <button
                  onClick={() => setScoreGoal(null)}
                  style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Change goal
                </button>
              )}
            </div>

            {scoreGoal === null ? (
              /* Goal picker */
              <div style={{ padding: "1.25rem" }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "0.875rem" }}>
                  Set a target score to track your progress:
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[60, 75, 88, 100].map((g) => (
                    <button
                      key={g}
                      onClick={() => setScoreGoal(g)}
                      disabled={homefaxScore >= g}
                      style={{
                        flex: 1, padding: "0.875rem", border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.sm, cursor: homefaxScore >= g ? "default" : "pointer",
                        background: homefaxScore >= g ? COLORS.sageLight : COLORS.white,
                        opacity: homefaxScore >= g ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: homefaxScore >= g ? COLORS.sage : S.ink }}>
                        {g}
                      </div>
                      <div style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginTop: "0.25rem" }}>
                        {g === 60 ? "Good" : g === 75 ? "Great" : g === 88 ? "Excellent" : "Perfect"}
                      </div>
                      {homefaxScore >= g && (
                        <div style={{ fontFamily: S.mono, fontSize: "0.5rem", color: COLORS.sage, marginTop: "0.2rem" }}>✓ Achieved</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : homefaxScore >= scoreGoal ? (
              /* Goal achieved celebration */
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: COLORS.sage, marginBottom: "0.375rem" }}>
                  Goal reached — {homefaxScore}/{scoreGoal} ✓
                </p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "1rem" }}>
                  Your HomeFax Score hit {scoreGoal}. Set a new goal to keep improving.
                </p>
                <button
                  onClick={() => setScoreGoal(null)}
                  style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight, borderRadius: RADIUS.sm }}
                >
                  Set next goal
                </button>
              </div>
            ) : (
              /* Progress toward goal */
              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                    Current: <strong style={{ color: S.ink }}>{homefaxScore}</strong>
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                    Goal: <strong style={{ color: S.rust }}>{scoreGoal}</strong>
                  </span>
                </div>
                <div style={{ height: "6px", background: S.rule, marginBottom: "0.75rem", borderRadius: 100 }}>
                  <div style={{
                    height: "100%",
                    width: `${(homefaxScore / scoreGoal) * 100}%`,
                    background: `linear-gradient(to right, ${COLORS.sage}, ${COLORS.sageMid})`,
                    transition: "width 0.5s ease",
                    borderRadius: 100,
                  }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {scoreGoalGap && (
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, lineHeight: 1.5, flex: 1 }}>
                      {scoreGoalGap}
                    </p>
                  )}
                  <button
                    onClick={() => { setLogJobPrefill(undefined); setShowLogJobModal(true); }}
                    style={{
                      fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "0.4rem 0.875rem", background: S.ink, color: S.paper, border: "none", cursor: "pointer",
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
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Recommended Projects
              </span>
              <button
                onClick={() => navigate("/market")}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.rust, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                See all →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "1rem" }}>
              {recommendations.map((rec) => {
                const priorityColor = rec.priority === "High" ? S.rust : rec.priority === "Medium" ? COLORS.plumMid : S.inkLight;
                return (
                  <div key={rec.name} style={{ background: COLORS.white, padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, boxShadow: SHADOWS.card, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: S.ink, lineHeight: 1.2 }}>{rec.name}</p>
                      <span style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: priorityColor, border: `1px solid ${priorityColor}`, padding: "0.1rem 0.4rem", flexShrink: 0, opacity: 0.8, borderRadius: 100 }}>
                        {rec.priority}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                      <div>
                        <p style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.1rem" }}>Est. Cost</p>
                        <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.95rem", color: S.ink }}>${(rec.estimatedCostCents / 100).toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.1rem" }}>ROI</p>
                        <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.95rem", color: S.sage }}>{rec.estimatedRoiPercent}%</p>
                      </div>
                    </div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.04em", lineHeight: 1.5, flex: 1 }}>
                      {rec.rationale}
                    </p>
                    <button
                      onClick={() => { setLogJobPrefill({ serviceType: rec.category }); setShowLogJobModal(true); }}
                      style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.75rem", border: `1px solid ${S.rule}`, background: "none", color: S.inkLight, cursor: "pointer", alignSelf: "flex-start", borderRadius: RADIUS.sm }}
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
          const est = premiumEstimate(homefaxScore);
          if (!est) return null;
          const market = activeProperty ? `${activeProperty.city}, ${activeProperty.state}` : "your market";
          return (
            <div style={{
              border: `1px solid ${S.rust}30`, padding: "1.25rem 1.5rem", marginBottom: "2.5rem",
              background: COLORS.sageLight, borderRadius: RADIUS.card,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.rust, marginBottom: "0.375rem" }}>
                    Your Score in {market}
                  </p>
                  <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, color: S.ink }}>
                    ${est.low.toLocaleString()} – ${est.high.toLocaleString()}
                  </p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.375rem" }}>
                    estimated buyer premium above unverified comparable
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "0.625rem" }}>
                    HomeFax Score <strong style={{ color: S.ink }}>{homefaxScore}</strong> · Grade <strong style={{ color: S.ink }}>{scoreGrade}</strong>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate("/resale-ready")}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${S.rust}`, color: S.rust, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
                    >
                      See Full Analysis →
                    </button>
                    {activeProperty && (
                      <button
                        onClick={async () => {
                          const payload = {
                            address:     activeProperty.address,
                            score:       homefaxScore,
                            grade:       scoreGrade,
                            certified,
                            generatedAt: Date.now(),
                          };
                          const { token } = await certService.issueCert(String(activeProperty.id), payload);
                          const url = `${window.location.origin}/cert/${token}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Lender certificate link copied!");
                        }}
                        style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`, color: S.inkLight, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
                      >
                        Copy Cert Link
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: S.inkLight, marginTop: "0.875rem", borderTop: `1px solid ${S.rule}`, paddingTop: "0.625rem", lineHeight: 1.6 }}>
                Based on verified maintenance records for score band {homefaxScore < 55 ? "40–54" : homefaxScore < 70 ? "55–69" : homefaxScore < 85 ? "70–84" : "85+"}.
                Buyers and lenders pay more for homes with documented, verified maintenance history. Individual market conditions vary.
              </p>
            </div>
          );
        })()}

        {/* Warranty expiry alerts */}
        {!loading && expiringWarranties.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.rust }}>
                Warranties Expiring Soon
              </p>
              <button onClick={() => navigate("/warranties")} style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                View all →
              </button>
            </div>
            <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {expiringWarranties.map((job, i) => {
                const expiry   = new Date(job.date).getTime() + (job.warrantyMonths ?? 0) * 30.44 * 24 * 60 * 60 * 1000;
                const daysLeft = Math.round((expiry - Date.now()) / (24 * 60 * 60 * 1000));
                const color    = daysLeft <= 30 ? S.rust : COLORS.plumMid;
                return (
                  <div key={job.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1rem", borderBottom: i < expiringWarranties.length - 1 ? `1px solid ${S.rule}` : "none", background: COLORS.white }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{job.serviceType}</p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>{job.isDiy ? "DIY" : job.contractorName} · {job.date}</p>
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, color, border: `1px solid ${color}40`, padding: "0.2rem 0.6rem", flexShrink: 0, borderRadius: 100 }}>
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
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
              Property Comparison
            </div>
            <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "0.5rem 1rem", background: S.paper, borderBottom: `1px solid ${S.rule}` }}>
                {["Address", "Score", "Value Added", "Verified Jobs", "Level"].map((h) => (
                  <div key={h} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{h}</div>
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
                      padding: "0.875rem 1rem", alignItems: "center",
                      borderBottom: i < propertyComparison.length - 1 ? `1px solid ${S.rule}` : "none",
                      background: isTop ? COLORS.sageLight : COLORS.white,
                      cursor: "pointer",
                      borderLeft: isTop ? `3px solid ${S.sage}` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isTop ? COLORS.sageLight : COLORS.white; }}
                  >
                    <div>
                      <p style={{ fontSize: "0.8rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.property.address}</p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{row.property.city}, {row.property.state}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                      <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.125rem", color: isTop ? S.sage : S.ink }}>{row.score}</span>
                      <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{row.grade}</span>
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>${(row.value / 100).toLocaleString()}</div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>{row.verified} / {row.jobCount}</div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{row.property.verificationLevel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button variant="outline" icon={<Plus size={14} />}          onClick={() => navigate("/properties/new")}>Add Property</Button>
            <Button variant="outline" icon={<Wrench size={14} />}        onClick={() => { setLogJobPrefill(undefined); setShowLogJobModal(true); }}>Log a Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={() => setShowQuoteModal(true)}>Request Quote</Button>
            <Button variant="outline" icon={<Home size={14} />}          onClick={() => navigate("/contractors")}>Find Contractors</Button>
            <Button variant="outline" icon={<ShieldCheck size={14} />}   onClick={() => navigate("/insurance-defense")}>Insurance Defense</Button>
          </div>
        </div>

        {/* Properties */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
            My Properties
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}><div className="spinner-lg" /></div>
          ) : properties.length === 0 ? (
            <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
              <Home size={40} color={S.rule} style={{ margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No properties yet</p>
              <p style={{ fontSize: "0.875rem", color: S.inkLight, fontWeight: 300, maxWidth: "24rem", margin: "0 auto 1.5rem" }}>
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

        {/* Quote Requests */}
        {quoteRequests.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                  Quote Requests
                </div>
                {pendingQuoteCount(quoteRequests) > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "0.1rem 0.5rem", background: S.rust, color: "#fff", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
                    {pendingQuoteCount(quoteRequests)} {pendingQuoteCount(quoteRequests) === 1 ? "bid" : "bids"} waiting
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowQuoteModal(true)}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, background: "none", border: `1px solid ${S.rust}`, cursor: "pointer", padding: "0.3rem 0.75rem", borderRadius: RADIUS.sm }}
              >
                <Plus size={11} /> New Request
              </button>
            </div>
            <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {quoteRequests.map((req, i) => {
                const statusVariant =
                  req.status === "accepted" ? "success"
                  : req.status === "quoted"  ? "info"
                  : req.status === "closed"  ? "default"
                  : "warning";
                const isNew      = isNewSince(req.createdAt, lastLoginAt);
                const hasBids    = hasQuoteActivity(req.status);
                const bidCount   = bidCountMap[req.id] ?? 0;
                const daysAgo    = Math.floor((Date.now() - req.createdAt) / 86400000);
                const ageLabel   = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`;
                const stale      = req.status === "open" && daysAgo >= 5;
                const rowBg      = hasBids ? COLORS.sageLight : COLORS.white;
                return (
                  <div
                    key={req.id}
                    onClick={() => navigate(`/quotes/${req.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1rem",
                      borderBottom: i < quoteRequests.length - 1 ? `1px solid ${S.rule}` : "none",
                      background: rowBg, cursor: "pointer",
                      borderLeft: hasBids ? `3px solid ${S.rust}` : stale ? `3px solid ${COLORS.plumMid}` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                      <MessageSquare size={13} color={hasBids ? S.rust : S.inkLight} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.serviceType}
                        {stale && (
                          <span style={{ marginLeft: "0.5rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid }}>
                            No bids yet
                          </span>
                        )}
                      </p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.description}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexShrink: 0 }}>
                      {/* Bid count bubble */}
                      {bidCount > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "2rem" }}>
                          <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", lineHeight: 1, color: S.rust }}>{bidCount}</span>
                          <span style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>{bidCount === 1 ? "bid" : "bids"}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        {isNew && (
                          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, border: `1px solid ${S.rust}`, padding: "0.1rem 0.4rem", borderRadius: 100 }}>
                            New
                          </span>
                        )}
                        <Badge variant={statusVariant} size="sm">{req.status}</Badge>
                        <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>{ageLabel}</span>
                      </div>
                      <ArrowRight size={13} color={S.inkLight} />
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
            border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap", borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", gap: "0.75rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <Calendar size={13} color={S.sage} />
              </div>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage, marginBottom: "0.2rem" }}>
                  Next Step — {recentVerified.serviceType}
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 400, color: S.ink, marginBottom: "0.5rem" }}>
                  {nextServiceTip}
                </p>
                <button
                  onClick={() => navigate(`/maintenance?system=${encodeURIComponent(recentVerified.serviceType)}`)}
                  style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", border: `1px solid ${S.sage}`, background: "none", color: S.sage, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Add to Maintenance Schedule →
                </button>
              </div>
            </div>
            <button
              onClick={() => { localStorage.setItem(nextServiceKey, "1"); setNextServiceDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight, flexShrink: 0 }}
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
              border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "1rem",
              background: COLORS.white, flexWrap: "wrap", borderRadius: RADIUS.sm,
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                <ShieldCheck size={13} color={S.sage} />
              </div>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage, marginBottom: "0.2rem" }}>
                  Book Again — {prompt.serviceType}
                </p>
                <p style={{ fontSize: "0.875rem", fontWeight: 400, color: S.ink, marginBottom: "0.5rem" }}>
                  {prompt.message}
                </p>
                <button
                  onClick={() => navigate(`/quotes/new?contractor=${encodeURIComponent(prompt.contractorName)}&service=${encodeURIComponent(prompt.serviceType)}`)}
                  style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.875rem", border: `1px solid ${S.sage}`, background: "none", color: S.sage, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Request Quote →
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem(`homefax_reengage_${prompt.jobId}`, "1");
                setDismissedReEngagements((prev) => new Set([...prev, prompt.jobId]));
              }}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight, flexShrink: 0 }}
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
              <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Recurring Services
              </div>
              <button
                onClick={() => navigate("/recurring/new")}
                style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${S.rust}`, color: S.rust, background: "none", cursor: "pointer", borderRadius: RADIUS.sm }}
              >
                + Add
              </button>
            </div>
            {recurringServices.length === 0 ? (
              <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.5rem", textAlign: "center", borderRadius: RADIUS.card }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 300, color: S.inkLight, marginBottom: "0.75rem" }}>
                  Lawn care, pest control, pool service — log ongoing contracts once and let the visit log do the rest.
                </p>
                <button
                  onClick={() => navigate("/recurring/new")}
                  style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: `1px solid ${S.ink}`, background: "none", cursor: "pointer", color: S.ink, borderRadius: RADIUS.sm }}
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
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
              Recent Activity
            </div>
            <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
              {jobs.slice(0, 5).map((job, i) => (
                <div key={job.id} className="rsp-activity-row" style={{ borderBottom: i < Math.min(jobs.length, 5) - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
                  <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: RADIUS.sm }}>
                    <Wrench size={13} color={S.inkLight} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.serviceType} — {job.isDiy ? "DIY" : job.contractorName}
                    </p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>{job.date}</p>
                  </div>
                  <div className="rsp-activity-right">
                    <p style={{ fontFamily: S.mono, fontSize: "0.75rem", fontWeight: 500 }}>${(job.amount / 100).toLocaleString()}</p>
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
        isOpen={showLogJobModal}
        onClose={() => setShowLogJobModal(false)}
        onSuccess={() => { loadAllJobs(properties); loadQuoteRequests(); }}
        properties={properties}
        prefill={logJobPrefill}
      />

      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSuccess={(quoteId) => { setShowQuoteModal(false); navigate(`/quotes/${quoteId}`); }}
        properties={properties}
      />

    </Layout>
  );
}

function ScoreSparkline({ history, onExpand }: { history: ScoreSnapshot[]; onExpand?: () => void }) {
  if (history.length < 2) return null;

  const W = 80, H = 24, pad = 2;
  const scores = history.map((s) => s.score);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;

  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = H - pad - ((s - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div onClick={onExpand} style={{ cursor: onExpand ? "pointer" : "default", marginTop: "0.5rem" }}>
      <svg width={W} height={H} style={{ display: "block", opacity: 0.7 }}>
        <polyline points={pts} fill="none" stroke={COLORS.sageMid} strokeWidth="1.5" strokeLinejoin="round" />
        {scores.map((s, i) => {
          const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
          const y = H - pad - ((s - min) / range) * (H - pad * 2);
          return i === scores.length - 1
            ? <circle key={i} cx={x} cy={y} r="2.5" fill={COLORS.sage} />
            : null;
        })}
      </svg>
      {onExpand && (
        <div style={{ fontFamily: FONTS.mono, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, marginTop: "0.25rem" }}>
          View history ↗
        </div>
      )}
    </div>
  );
}

function ScoreHistoryChart({ history }: { history: ScoreSnapshot[] }) {
  const W = 560, H = 160, padL = 36, padR = 16, padT = 12, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const scores = history.map((s) => s.score);
  const minS   = Math.max(0, Math.min(...scores) - 10);
  const maxS   = Math.min(100, Math.max(...scores) + 10);
  const range  = maxS - minS || 1;

  const toX = (i: number) => padL + (i / Math.max(history.length - 1, 1)) * innerW;
  const toY = (s: number) => padT + innerH - ((s - minS) / range) * innerH;

  const pts    = history.map((s, i) => `${toX(i).toFixed(1)},${toY(s.score).toFixed(1)}`).join(" ");
  const areaD  = `M ${toX(0)},${toY(history[0].score)} ` +
    history.map((s, i) => `L ${toX(i).toFixed(1)},${toY(s.score).toFixed(1)}`).join(" ") +
    ` L ${toX(history.length - 1)},${padT + innerH} L ${toX(0)},${padT + innerH} Z`;

  // Y grid lines at 0, 25, 50, 75, 100
  const yGridLines = [0, 25, 50, 75, 100].filter((v) => v >= minS - 5 && v <= maxS + 5);

  // X labels — show every Nth point to avoid crowding
  const step = Math.max(1, Math.floor(history.length / 5));

  return (
    <div style={{ padding: "1rem", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: H, display: "block" }}>
        <defs>
          <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={COLORS.sage} stopOpacity="0.2" />
            <stop offset="100%" stopColor={COLORS.sage} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid */}
        {yGridLines.map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={padL + innerW} y2={toY(v)} stroke={COLORS.rule} strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={padL - 4} y={toY(v)} textAnchor="end" dominantBaseline="middle" fill={COLORS.plumMid} fontSize="9" fontFamily="'IBM Plex Mono', monospace">{v}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#scoreAreaGrad)" />

        {/* Line */}
        <polyline points={pts} fill="none" stroke={COLORS.sage} strokeWidth="1.5" strokeLinejoin="round" />

        {/* Data points */}
        {history.map((s, i) => (
          <circle key={i} cx={toX(i)} cy={toY(s.score)} r="2.5" fill={COLORS.sage} />
        ))}

        {/* X labels */}
        {history.map((s, i) => {
          if (i % step !== 0 && i !== history.length - 1) return null;
          const d   = new Date(s.timestamp);
          const lbl = `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
          return (
            <text key={i} x={toX(i)} y={padT + innerH + 14} textAnchor="middle" fill={COLORS.plumMid} fontSize="8" fontFamily="'IBM Plex Mono', monospace">
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function PropertyCard({ property, onClick, badge }: { property: Property; onClick: () => void; badge: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: COLORS.white,
        cursor: "pointer",
        padding: "1.5rem",
        borderRadius: RADIUS.card,
        border: `1.5px solid ${hovered ? COLORS.sageMid : COLORS.rule}`,
        boxShadow: hovered ? SHADOWS.hover : SHADOWS.card,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Property thumbnail */}
      <div style={{ height: "6rem", background: COLORS.sageLight, borderRadius: RADIUS.sm, marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <Home size={28} color={COLORS.sageMid} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <h3 style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: COLORS.plum }}>{property.address}</h3>
        {badge}
      </div>
      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "0.75rem" }}>
        {property.city}, {property.state} {property.zipCode}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight }}>
        <span style={{ textTransform: "uppercase" }}>{property.propertyType}</span>
        <span style={{ color: S.rust }}>View Details →</span>
      </div>
    </div>
  );
}
