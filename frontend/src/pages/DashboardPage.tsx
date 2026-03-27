import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { quoteService, QuoteRequest } from "@/services/quote";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { isNewSince, hasQuoteActivity, pendingQuoteCount } from "@/services/notifications";
import { computeScore, getScoreGrade, loadHistory, recordSnapshot, scoreDelta, premiumEstimate, isCertified, generateCertToken, type ScoreSnapshot } from "@/services/scoreService";
import { getWeeklyPulse } from "@/services/pulseService";
import { marketService, jobToSummary, type PropertyProfile, type ProjectRecommendation } from "@/services/market";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { principal, profile, lastLoginAt } = useAuthStore();
  const { properties, setProperties } = usePropertyStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [bidCountMap,   setBidCountMap]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [bannerDismissed,     setBannerDismissed]     = useState(false);
  const [showScoreBreakdown,  setShowScoreBreakdown]  = useState(false);
  const [showScoreChart,      setShowScoreChart]      = useState(false);
  const [scoreGoal, setScoreGoalState] = useState<number | null>(() => {
    const v = localStorage.getItem("homefax_score_goal");
    return v ? parseInt(v, 10) : null;
  });
  const [milestoneDismissed,  setMilestoneDismissed]  = useState(() => !!localStorage.getItem("homefax_milestone_dismissed"));
  const [milestone3Dismissed, setMilestone3Dismissed] = useState(() => !!localStorage.getItem("homefax_3job_milestone"));
  const [pulseDismissed,      setPulseDismissed]      = useState(() => !!localStorage.getItem(`homefax_pulse_${new Date().toISOString().slice(0, 7)}`));
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>([]);

  useEffect(() => {
    Promise.all([loadProperties(), loadJobs(), loadQuoteRequests()]).finally(() => setLoading(false));
    setScoreHistory(loadHistory());
  }, []);

  async function loadProperties() {
    if ((window as any).__e2e_properties) { setProperties((window as any).__e2e_properties); return; }
    try { setProperties(await propertyService.getMyProperties()); }
    catch (err: any) { toast.error("Failed to load properties: " + err.message); }
  }

  async function loadJobs() {
    try { setJobs(await jobService.getAll()); } catch { /* canister not deployed */ }
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

  const totalValue    = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);
  const homefaxScore  = computeScore(jobs, properties);
  const scoreGrade    = getScoreGrade(homefaxScore);
  const delta         = scoreDelta(scoreHistory);

  const hasProperty  = properties.length > 0;
  const hasVerified  = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob       = jobs.length > 0;
  const showBanner   = !loading && !(hasProperty && hasVerified && hasJob) && !bannerDismissed;
  const certified    = isCertified(homefaxScore, jobs);

  // Score breakdown — per-component contribution for the explanatory panel
  const scoreBreakdown = React.useMemo(() => {
    const verifiedJobs     = jobs.filter((j) => j.verified);
    const verifiedJobPts   = Math.min(verifiedJobs.length * 4, 40);
    const totalValueDollars = jobs.reduce((s, j) => s + j.amount, 0) / 100;
    const valuePts          = Math.min(Math.floor(totalValueDollars / 2500), 20);
    let verPts = 0;
    for (const p of properties) {
      if (p.verificationLevel === "Premium") verPts += 10;
      else if (p.verificationLevel === "Basic") verPts += 5;
    }
    verPts = Math.min(verPts, 20);
    const uniqueTypes  = new Set(jobs.map((j) => j.serviceType)).size;
    const diversityPts = Math.min(uniqueTypes * 4, 20);
    return [
      { label: "Verified Jobs",      pts: verifiedJobPts, max: 40, detail: `${verifiedJobs.length} verified job${verifiedJobs.length !== 1 ? "s" : ""} × 4 pts` },
      { label: "Total Value",        pts: valuePts,        max: 20, detail: `$${Math.round(totalValueDollars).toLocaleString()} documented` },
      { label: "Verification Level", pts: verPts,          max: 20, detail: properties.map((p) => p.verificationLevel).join(", ") || "No properties" },
      { label: "Job Diversity",      pts: diversityPts,    max: 20, detail: `${uniqueTypes} service categor${uniqueTypes !== 1 ? "ies" : "y"}` },
    ];
  }, [jobs, properties]);

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
  const pulseKey  = `homefax_pulse_${new Date().toISOString().slice(0, 7)}`;
  const pulseTip  = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);
  const showPulse = !loading && hasProperty && !!pulseTip && !pulseDismissed;

  // Multi-property score comparison — computed when user has 2+ properties
  const propertyComparison = React.useMemo(() => {
    if (properties.length < 2) return null;
    return properties.map((p) => {
      const pJobs    = jobs.filter((j) => j.propertyId === String(p.id));
      const score    = computeScore(pJobs, [p]);
      const grade    = getScoreGrade(score);
      const value    = jobService.getTotalValue(pJobs);
      const verified = jobService.getVerifiedCount(pJobs);
      return { property: p, score, grade, value, verified, jobCount: pJobs.length };
    }).sort((a, b) => b.score - a.score);
  }, [properties, jobs]);

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

  // Smart project recommendations — top 3 ROI-ranked for first property
  const recommendations = React.useMemo((): ProjectRecommendation[] => {
    if (!hasProperty || properties.length === 0) return [];
    const p = properties[0];
    const profile: PropertyProfile = {
      yearBuilt:    Number(p.yearBuilt),
      squareFeet:   Number(p.squareFeet),
      propertyType: String(p.propertyType),
      state:        p.state,
      zipCode:      p.zipCode,
    };
    const pJobs = jobs.filter((j) => j.propertyId === String(p.id)).map(jobToSummary);
    return marketService.recommendValueAddingProjects(profile, pJobs, 0).slice(0, 3);
  }, [properties, jobs, hasProperty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score goal helpers
  const setScoreGoal = (goal: number | null) => {
    setScoreGoalState(goal);
    if (goal === null) localStorage.removeItem("homefax_score_goal");
    else localStorage.setItem("homefax_score_goal", String(goal));
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
    if (!loading && (jobs.length > 0 || properties.length > 0)) {
      const history = recordSnapshot(homefaxScore);
      setScoreHistory(history);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Onboarding banner */}
        {showBanner && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#FAF0ED", flexWrap: "wrap",
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
            background: S.ink, flexWrap: "wrap",
          }}>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.25rem" }}>
                One Year of HomeFax
              </p>
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.875rem", color: S.paper, fontWeight: 300 }}>
                You've been building your verified home history for nearly a year.{" "}
                <strong style={{ fontWeight: 600 }}>${(totalValue / 100).toLocaleString()} in documented improvements</strong> — that's real value for your next sale.
              </p>
            </div>
            <button
              onClick={() => { localStorage.setItem(milestoneKey, "1"); setMilestoneDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7268", flexShrink: 0 }}
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
            background: "#F0F6F3", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `2px solid ${S.sage}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: S.sage }}>
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

        {/* Home Pulse tip */}
        {showPulse && pulseTip && (
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#fff", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", gap: "0.875rem", flex: 1 }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.125rem" }}>
                <Sparkles size={13} color={S.rust} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.rust }}>
                    Home Pulse
                  </p>
                  <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, border: `1px solid ${S.rule}`, padding: "0.05rem 0.375rem" }}>
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
            background: "#fff", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
              onClick={() => navigate("/jobs/new")}
              style={{
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "0.5rem 1rem", background: S.ink, color: S.paper,
                border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem", flexShrink: 0,
              }}
            >
              Log a Job <ArrowRight size={12} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}`, marginBottom: "2.5rem" }}>
          {[
            { label: "Properties",       value: String(properties.length),                                         accent: false },
            { label: "Verified Jobs",    value: String(verifiedCount),                                             accent: false },
            { label: "Total Value",      value: `$${(totalValue / 100).toLocaleString()}`,                         accent: false },
            { label: "HomeFax Premium™", value: `$${Math.round((totalValue / 100) * 0.03).toLocaleString()}`,      accent: false },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "1.5rem", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, background: "#fff" }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.625rem" }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: S.ink }}>
                {stat.value}
              </div>
            </div>
          ))}
          {/* HomeFax Score — accent cell */}
          <div style={{ padding: "1.5rem", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, background: S.ink }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#7A7268", marginBottom: "0.625rem" }}>
              HomeFax Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: "#F4F1EB" }}>{homefaxScore}</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: "#7A7268" }}>/100 · {scoreGrade}</span>
            </div>
            {delta !== 0 && (
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: delta > 0 ? "#6EAF8A" : "#C94C2E", letterSpacing: "0.06em" }}>
                {delta > 0 ? "+" : ""}{delta} pts this period
              </div>
            )}
            <ScoreSparkline history={scoreHistory} onExpand={() => setShowScoreChart((v) => !v)} />
          </div>
        </div>

        {/* Score history chart */}
        {showScoreChart && scoreHistory.length >= 2 && (
          <div style={{ marginBottom: "2rem", border: `1px solid ${S.rule}`, background: "#fff" }}>
            <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAF8" }}>
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
                background: showScoreBreakdown ? "#FAFAF8" : "#fff",
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: S.inkLight, cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ flex: 1 }}>How is my HomeFax Score calculated?</span>
              <span style={{ fontSize: "0.75rem" }}>{showScoreBreakdown ? "▲" : "▼"}</span>
            </button>
            {showScoreBreakdown && (
              <div style={{ border: `1px solid ${S.rule}`, borderTop: "none", background: "#fff" }}>
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
                    <div style={{ flex: 1, height: "4px", background: S.rule }}>
                      <div style={{ height: "4px", background: S.rust, width: `${(row.pts / row.max) * 100}%`, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink }}>{row.pts}</span>
                      <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>/{row.max}</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "0.875rem 1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", background: "#FAFAF8" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>Total</span>
                  <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", color: S.ink }}>{homefaxScore}</span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>/100</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Score Goal Widget */}
        {!loading && hasProperty && (
          <div style={{ marginBottom: "2.5rem", border: `1px solid ${S.rule}`, background: "#fff" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAF8" }}>
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
                <div style={{ display: "flex", gap: "1px", background: S.rule }}>
                  {[60, 75, 88, 100].map((g) => (
                    <button
                      key={g}
                      onClick={() => setScoreGoal(g)}
                      disabled={homefaxScore >= g}
                      style={{
                        flex: 1, padding: "0.875rem", border: "none", cursor: homefaxScore >= g ? "default" : "pointer",
                        background: homefaxScore >= g ? "#F0F6F3" : "#fff",
                        opacity: homefaxScore >= g ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: homefaxScore >= g ? "#3D6B57" : S.ink }}>
                        {g}
                      </div>
                      <div style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginTop: "0.25rem" }}>
                        {g === 60 ? "Good" : g === 75 ? "Great" : g === 88 ? "Excellent" : "Perfect"}
                      </div>
                      {homefaxScore >= g && (
                        <div style={{ fontFamily: S.mono, fontSize: "0.5rem", color: "#3D6B57", marginTop: "0.2rem" }}>✓ Achieved</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : homefaxScore >= scoreGoal ? (
              /* Goal achieved celebration */
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: "#3D6B57", marginBottom: "0.375rem" }}>
                  Goal reached — {homefaxScore}/{scoreGoal} ✓
                </p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "1rem" }}>
                  Your HomeFax Score hit {scoreGoal}. Set a new goal to keep improving.
                </p>
                <button
                  onClick={() => setScoreGoal(null)}
                  style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
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
                <div style={{ height: "6px", background: S.rule, marginBottom: "0.75rem" }}>
                  <div style={{
                    height: "100%",
                    width: `${(homefaxScore / scoreGoal) * 100}%`,
                    background: `linear-gradient(to right, ${S.rust}, #D4820E)`,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {scoreGoalGap && (
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, lineHeight: 1.5, flex: 1 }}>
                      {scoreGoalGap}
                    </p>
                  )}
                  <button
                    onClick={() => navigate("/jobs/new")}
                    style={{
                      fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "0.4rem 0.875rem", background: S.ink, color: S.paper, border: "none", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: "0.375rem", flexShrink: 0, marginLeft: "1rem",
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "1px", background: S.rule }}>
              {recommendations.map((rec) => {
                const priorityColor = rec.priority === "High" ? S.rust : rec.priority === "Medium" ? "#D4820E" : S.inkLight;
                return (
                  <div key={rec.name} style={{ background: "#fff", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: S.ink, lineHeight: 1.2 }}>{rec.name}</p>
                      <span style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: priorityColor, border: `1px solid ${priorityColor}`, padding: "0.1rem 0.4rem", flexShrink: 0, opacity: 0.8 }}>
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
                      onClick={() => navigate("/jobs/new", { state: { prefill: { serviceType: rec.category } } })}
                      style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.75rem", border: `1px solid ${S.rule}`, background: "none", color: S.inkLight, cursor: "pointer", alignSelf: "flex-start" }}
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
          return (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem",
              border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "2.5rem",
              background: "#fff",
            }}>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.375rem" }}>
                  Estimated Buyer Premium
                </p>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>
                  ${est.low.toLocaleString()} – ${est.high.toLocaleString()}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight, maxWidth: "20rem", marginBottom: "0.75rem" }}>
                  Based on HomeFax Score {homefaxScore} ({scoreGrade}). Verified maintenance history typically
                  adds 1–10% to sale price in US markets.
                </p>
                {properties[0] && (
                  <button
                    onClick={() => {
                      const token = generateCertToken({
                        address:     properties[0].address,
                        score:       homefaxScore,
                        grade:       scoreGrade,
                        certified,
                        generatedAt: Date.now(),
                      });
                      const url = `${window.location.origin}/cert/${token}`;
                      navigator.clipboard.writeText(url);
                      toast.success("Lender certificate link copied!");
                    }}
                    style={{
                      fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                      padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`, color: S.inkLight,
                      background: "none", cursor: "pointer",
                    }}
                  >
                    Copy Lender Certificate Link
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Warranty expiry alerts */}
        {!loading && expiringWarranties.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.rust, marginBottom: "0.75rem" }}>
              Warranties Expiring Soon
            </p>
            <div style={{ border: `1px solid ${S.rule}` }}>
              {expiringWarranties.map((job, i) => {
                const expiry   = new Date(job.date).getTime() + (job.warrantyMonths ?? 0) * 30.44 * 24 * 60 * 60 * 1000;
                const daysLeft = Math.round((expiry - Date.now()) / (24 * 60 * 60 * 1000));
                const color    = daysLeft <= 30 ? S.rust : "#D4820E";
                return (
                  <div key={job.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1rem", borderBottom: i < expiringWarranties.length - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{job.serviceType}</p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>{job.isDiy ? "DIY" : job.contractorName} · {job.date}</p>
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, color, border: `1px solid ${color}40`, padding: "0.2rem 0.6rem", flexShrink: 0 }}>
                      {daysLeft}d left
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Multi-property comparison */}
        {!loading && propertyComparison && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
              Property Comparison
            </div>
            <div style={{ border: `1px solid ${S.rule}` }}>
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
                      background: isTop ? "#FAFAF8" : "#fff",
                      cursor: "pointer",
                      borderLeft: isTop ? `3px solid ${S.sage}` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isTop ? "#FAFAF8" : "#fff"; }}
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
            <Button variant="outline" icon={<Plus size={14} />}         onClick={() => navigate("/properties/new")}>Add Property</Button>
            <Button variant="outline" icon={<Wrench size={14} />}       onClick={() => navigate("/jobs/new")}>Log a Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={() => navigate("/quotes/new")}>Request Quote</Button>
            <Button variant="outline" icon={<Home size={14} />}         onClick={() => navigate("/contractors")}>Find Contractors</Button>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1px", background: S.rule }}>
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
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "0.1rem 0.5rem", background: S.rust, color: "#fff", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {pendingQuoteCount(quoteRequests)} {pendingQuoteCount(quoteRequests) === 1 ? "bid" : "bids"} waiting
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate("/quotes/new")}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <Plus size={11} /> New Request
              </button>
            </div>
            <div style={{ border: `1px solid ${S.rule}` }}>
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
                const rowBg      = hasBids ? "#FDFAF9" : "#fff";
                return (
                  <div
                    key={req.id}
                    onClick={() => navigate(`/quotes/${req.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1rem",
                      borderBottom: i < quoteRequests.length - 1 ? `1px solid ${S.rule}` : "none",
                      background: rowBg, cursor: "pointer",
                      borderLeft: hasBids ? `3px solid ${S.rust}` : stale ? `3px solid #D4820E` : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MessageSquare size={13} color={hasBids ? S.rust : S.inkLight} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.serviceType}
                        {stale && (
                          <span style={{ marginLeft: "0.5rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#D4820E" }}>
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
                          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, border: `1px solid ${S.rust}`, padding: "0.1rem 0.4rem" }}>
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

        {/* Recent Activity */}
        {jobs.length > 0 && (
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
              Recent Activity
            </div>
            <div style={{ border: `1px solid ${S.rule}` }}>
              {jobs.slice(0, 5).map((job, i) => (
                <div key={job.id} className="rsp-activity-row" style={{ borderBottom: i < Math.min(jobs.length, 5) - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
                  <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
        <polyline points={pts} fill="none" stroke="#C8C3B8" strokeWidth="1.5" strokeLinejoin="round" />
        {scores.map((s, i) => {
          const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
          const y = H - pad - ((s - min) / range) * (H - pad * 2);
          return i === scores.length - 1
            ? <circle key={i} cx={x} cy={y} r="2.5" fill="#F4F1EB" />
            : null;
        })}
      </svg>
      {onExpand && (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A7268", marginTop: "0.25rem" }}>
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
            <stop offset="0%"   stopColor="#C94C2E" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#C94C2E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid */}
        {yGridLines.map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={padL + innerW} y2={toY(v)} stroke="#C8C3B8" strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={padL - 4} y={toY(v)} textAnchor="end" dominantBaseline="middle" fill="#7A7268" fontSize="9" fontFamily="'IBM Plex Mono', monospace">{v}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#scoreAreaGrad)" />

        {/* Line */}
        <polyline points={pts} fill="none" stroke="#C94C2E" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Data points */}
        {history.map((s, i) => (
          <circle key={i} cx={toX(i)} cy={toY(s.score)} r="2.5" fill="#C94C2E" />
        ))}

        {/* X labels */}
        {history.map((s, i) => {
          if (i % step !== 0 && i !== history.length - 1) return null;
          const d   = new Date(s.timestamp);
          const lbl = `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
          return (
            <text key={i} x={toX(i)} y={padT + innerH + 14} textAnchor="middle" fill="#7A7268" fontSize="8" fontFamily="'IBM Plex Mono', monospace">
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function PropertyCard({ property, onClick, badge }: { property: Property; onClick: () => void; badge: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", cursor: "pointer", padding: "1.5rem", transition: "background 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff"; }}
    >
      {/* Blueprint thumbnail */}
      <div style={{ height: "6rem", background: "#E8E4DC", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 11px,#C8C3B8 11px,#C8C3B8 12px),repeating-linear-gradient(90deg,transparent,transparent 11px,#C8C3B8 11px,#C8C3B8 12px)",
          opacity: 0.3,
        }} />
        <Home size={28} color="#C8C3B8" />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 500 }}>{property.address}</h3>
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
