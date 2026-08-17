import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Wrench, MessageSquare, Sparkles, Upload,
  AlertTriangle, CheckCircle, XCircle,
  FileText, TrendingUp, BarChart3,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { useAuthStore } from "@/store/authStore";
import {
  computeScoreWithDecay, getScoreGrade, scoreDelta, premiumEstimate,
} from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { getWeeklyPulse } from "@/services/pulseService";
import { getRecentScoreEvents, type ScoreEvent } from "@/services/scoreEventService";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import UpgradeModal from "@/components/UpgradeModal";
import RecurringServiceCreateModal from "@/components/RecurringServiceCreateModal";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { useQuoteSummary } from "@/hooks/useQuoteSummary";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { useSubscription } from "@/hooks/useSubscription";
import { useScoreTracking } from "@/hooks/useScoreTracking";
import { useDashboardDismissals } from "@/hooks/useDashboardDismissals";
import { C, FONTS } from "@/components/dashboard/tokens";
import {
  StatCard, Card,
  PropertyHealthScoreCard, UpcomingMaintenanceStatCard, OpenTasksStatCard, PropertyValueImpactCard,
  UpcomingMaintenancePanel, RecentDocumentsPanel, PropertyInsightsPanel, PropertyValueTrackerPanel,
  QuickActionsPanel, RecentActivityPanel, InviteNeighborPanel, MyPropertiesPanel,
  type ScheduledItem, type DocItem, type ValuePoint, type QuickAction, type ActivityItem,
} from "@/components/dashboard/panels";
import { AIAssistantPanel } from "@/components/dashboard/AIAssistantPanel";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { isMobile, isTablet } = useBreakpoint();
  const { isOpen: isWizardOpen, open: openAddProp } = useAddPropertyStore();

  // ─── Domain hooks ─────────────────────────────────────────────────────────────
  const {
    properties, managedProperties, ownerNotifs, loading: propLoading,
    dismissAllNotifications,
  } = usePropertySummary();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const propertyInitialized = useRef(false);

  const activePropertyId = selectedPropertyId ?? (properties.length === 1 ? String(properties[0].id) : null);
  const activeProperty   = activePropertyId
    ? properties.find((p) => String(p.id) === activePropertyId) ?? null
    : null;

  const jobSummary   = useJobSummary(properties, propLoading);
  const quoteSummary = useQuoteSummary();
  const { recurringServices, visitLogMap, systemAges } = useMaintenanceSchedule(properties, propLoading, activePropertyId);
  const { userTier } = useSubscription();

  const loading = propLoading || jobSummary.loading;

  const { allJobs, pendingProposals } = jobSummary;
  const { quoteRequests } = quoteSummary;

  const jobs = activePropertyId
    ? allJobs.filter((j) => j.propertyId === activePropertyId)
    : allJobs;

  // ─── Score ────────────────────────────────────────────────────────────────────
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

  const { scoreHistory } = useScoreTracking(activePropertyId, homegenticScore, loading);
  const delta = scoreDelta(scoreHistory);

  // ─── Dismissals ───────────────────────────────────────────────────────────────
  const d = useDashboardDismissals();

  // ─── Modals ───────────────────────────────────────────────────────────────────
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [logJobPrefill,    setLogJobPrefill]    = useState<{ serviceType?: string } | undefined>();
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAddService,   setShowAddService]   = useState(false);

  const openLogJob = (prefill?: { serviceType?: string }) => {
    setLogJobPrefill(prefill);
    setShowLogJobModal(true);
  };

  // ─── Effects ──────────────────────────────────────────────────────────────────
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

  // ─── Derived data ─────────────────────────────────────────────────────────────

  const est = React.useMemo(() => premiumEstimate(homegenticScore), [homegenticScore]);

  const openTaskCount = React.useMemo(
    () => jobs.filter((j) => !j.verified).length + pendingProposals.length,
    [jobs, pendingProposals]
  );

  const FREQ_DAYS: Record<string, number> = {
    Weekly: 7, BiWeekly: 14, Monthly: 30,
    Quarterly: 91, SemiAnnually: 182, Annually: 365,
  };
  const FREQ_LABELS: Record<string, string> = {
    Weekly: "Every week", BiWeekly: "Every 2 weeks", Monthly: "Every month",
    Quarterly: "Every 3 months", SemiAnnually: "Every 6 months", Annually: "Annually",
  };

  const maintenanceItems: ScheduledItem[] = React.useMemo(() => {
    const now = Date.now();
    return recurringServices
      .slice(0, 3)
      .map((svc) => {
        const logs       = visitLogMap[svc.id] ?? [];
        const lastVisit  = logs.length > 0
          ? new Date(logs[logs.length - 1].visitDate).getTime()
          : new Date(svc.startDate).getTime();
        const freqDays   = FREQ_DAYS[svc.frequency] ?? 365;
        const freqMs     = freqDays * 24 * 60 * 60 * 1000;
        const nextDue    = lastVisit + freqMs;
        const daysUntil  = Math.max(0, Math.round((nextDue - now) / (24 * 60 * 60 * 1000)));
        return {
          id:         svc.id,
          label:      `${svc.serviceType} Service`,
          dateStr:    new Date(nextDue).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          frequency:  FREQ_LABELS[svc.frequency] ?? svc.frequency,
          daysUntil,
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringServices, visitLogMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const maintenanceThisWeek  = maintenanceItems.filter((m) => m.daysUntil <= 7).length;
  const maintenanceThisMonth = maintenanceItems.filter((m) => m.daysUntil <= 30).length;

  const recentDocs: DocItem[] = React.useMemo(() => {
    return [...jobs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
      .map((job) => ({
        id:      job.id,
        title:   `${job.serviceType} ${job.isDiy ? "Record" : "Receipt"}`,
        dateStr: new Date(job.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        size:    `$${(job.amount / 100).toLocaleString()}`,
        type:    "PDF" as const,
      }));
  }, [jobs]);

  const pulseTip = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);

  const valuePoints: ValuePoint[] = React.useMemo(() => {
    if (!activeProperty || scoreHistory.length < 2) return [];
    const baseValue = 350_000;
    return scoreHistory.map((entry) => {
      const est2 = premiumEstimate(entry.score);
      const mid  = est2 ? Math.round((est2.low + est2.high) / 2) : 0;
      return {
        label: new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        value: baseValue + mid,
      };
    });
  }, [scoreHistory, activeProperty]);

  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []),
    [jobs, activeProperty, loading]
  );

  const activityItems: ActivityItem[] = React.useMemo(() => {
    return scoreEvents.slice(0, 4).map((ev) => ({
      id:      ev.id,
      icon:    ev.category === "Job"
        ? <CheckCircle size={14} color={C.green} />
        : ev.category === "Property"
        ? <Home size={14} color={C.blue} />
        : <FileText size={14} color={C.muted} />,
      iconBg:  ev.category === "Job"      ? C.greenBg
        : ev.category === "Property"      ? C.blueBg
        : "#F3F4F6",
      label:   ev.label,
      dateStr: new Date(ev.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    }));
  }, [scoreEvents]);

  // ─── Greeting ─────────────────────────────────────────────────────────────────
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.email
    ? profile.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()).split(" ")[0]
    : "";
  const displayName = firstName || "there";

  // ─── Quick actions ────────────────────────────────────────────────────────────
  const quickActions: QuickAction[] = [
    {
      icon:    <Wrench size={16} color={C.green} />,
      iconBg:  C.greenBg,
      label:   "Log Maintenance",
      desc:    "Add a new service or repair record",
      onClick: () => openLogJob(undefined),
    },
    {
      icon:    <Upload size={16} color={C.blue} />,
      iconBg:  C.blueBg,
      label:   "Upload Document",
      desc:    "Store receipts, reports, and more",
      onClick: () => navigate("/documents"),
    },
    {
      icon:    <MessageSquare size={16} color="#7C3AED" />,
      iconBg:  "#EDE9FE",
      label:   "Request Quote",
      desc:    "Get quotes from trusted pros",
      onClick: () => setShowQuoteModal(true),
    },
    {
      icon:    <Sparkles size={16} color="#D97706" />,
      iconBg:  C.orangeBg,
      label:   "AI Assistant",
      desc:    "Ask questions about your home",
      onClick: () => { /* scroll to AI panel */ },
    },
    {
      icon:    <BarChart3 size={16} color={C.blue} />,
      iconBg:  C.blueBg,
      label:   "View Reports",
      desc:    "See insights and property reports",
      onClick: () => navigate("/market"),
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{
        background:  C.bg,
        minHeight:   "100%",
        padding:     isMobile ? "1rem" : "1.5rem",
        display:     "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 320px",
        gap:         "1.5rem",
        alignItems:  "start",
      }}>

        {/* ── Main column ─────────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Welcome header */}
          <div>
            <h1 style={{
              fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.625rem",
              color: C.text, margin: "0 0 0.25rem",
            }}>
              {greeting}, {displayName}! 👋
            </h1>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.9375rem", color: C.muted }}>
              Here's what's happening with your home.
            </p>
          </div>

          {/* 4 stat cards */}
          {!loading && properties.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
              gap: "1rem",
            }}>
              <PropertyHealthScoreCard
                score={homegenticScore}
                grade={scoreGrade}
                delta={delta}
                onViewDetails={() => navigate(`/properties/${activePropertyId}`)}
                onImprove={() => navigate("/maintenance")}
              />
              <UpcomingMaintenanceStatCard
                thisWeek={maintenanceThisWeek}
                thisMonth={maintenanceThisMonth}
                onViewSchedule={() => navigate("/maintenance")}
              />
              <OpenTasksStatCard
                count={openTaskCount}
                onViewTasks={() => navigate(`/properties/${activePropertyId}`)}
              />
              {est ? (
                <PropertyValueImpactCard
                  low={est.low}
                  high={est.high}
                  onSeeInsights={() => navigate("/market")}
                />
              ) : (
                <StatCard
                  icon={<TrendingUp size={16} color={C.blue} />}
                  iconBg={C.blueBg}
                  title="Property Value Impact"
                >
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>
                    Log more jobs to unlock value insights.
                  </p>
                </StatCard>
              )}
            </div>
          )}

          {/* Upcoming Maintenance + Recent Documents */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1.5rem" }}>
            <UpcomingMaintenancePanel
              items={maintenanceItems}
              onViewSchedule={() => navigate("/maintenance")}
            />
            <RecentDocumentsPanel
              docs={recentDocs}
              onViewAll={() => navigate(`/properties/${activePropertyId}`)}
            />
          </div>

          {/* Property Insights + Value Tracker */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1.5rem" }}>
            <PropertyInsightsPanel
              insight={pulseTip?.headline ?? null}
              warnings={atRiskWarnings}
              onViewAll={() => navigate("/market")}
            />
            <PropertyValueTrackerPanel
              points={valuePoints}
              onViewFullReport={() => navigate("/market")}
            />
          </div>

          {/* Quick Actions */}
          {!isMobile && <QuickActionsPanel actions={quickActions} isTablet={isTablet} />}

          {/* My Properties */}
          <MyPropertiesPanel
            properties={properties}
            loading={loading}
            navigate={navigate}
            openAddProp={openAddProp}
            dismissals={d}
          />

          {/* Pending Contractor Proposals */}
          {pendingProposals.length > 0 && (
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
                <h2 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, margin: 0 }}>
                  Pending Contractor Proposals
                </h2>
                <span style={{
                  fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600,
                  color: "#fff", background: C.green, borderRadius: "1rem", padding: "0.125rem 0.625rem",
                }}>
                  {pendingProposals.length} awaiting review
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {pendingProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    data-testid="pending-proposal-card"
                    style={{
                      border: `1px solid ${C.border}`, borderRadius: "0.625rem",
                      padding: "1rem 1.25rem",
                      display: "flex", flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "flex-start" : "center", gap: "1rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.text }}>
                          {proposal.serviceType}
                        </span>
                        {(proposal as any).potentialDuplicateOf && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.red }}>
                            <AlertTriangle size={12} /> Possible duplicate
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>{proposal.description}</p>
                      <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                        {proposal.contractorName && (
                          <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>By {proposal.contractorName}</span>
                        )}
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>{proposal.date}</span>
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>
                          ${(proposal.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        onClick={() => jobSummary.approveProposal(proposal.id)}
                        data-testid="approve-proposal"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600,
                          padding: "0.5rem 1rem", background: C.green, color: "#fff",
                          border: "none", cursor: "pointer", borderRadius: "0.5rem",
                        }}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={() => jobSummary.rejectProposal(proposal.id)}
                        data-testid="reject-proposal"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          fontFamily: FONTS.sans, fontSize: "0.8125rem",
                          padding: "0.5rem 1rem", background: "none", color: C.muted,
                          border: `1px solid ${C.border}`, cursor: "pointer", borderRadius: "0.5rem",
                        }}
                      >
                        <XCircle size={14} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>

        {/* ── Right panel ──────────────────────────────────────────────────────── */}
        {!isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <RecentActivityPanel items={activityItems} onViewAll={() => navigate(`/properties/${activePropertyId}`)} />
            <AIAssistantPanel />
            <InviteNeighborPanel onInvite={() => navigate("/referrals")} />
          </div>
        )}

      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
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
      <RecurringServiceCreateModal
        open={showAddService}
        onClose={() => setShowAddService(false)}
        defaultPropertyId={activePropertyId ?? undefined}
        onSuccess={() => setShowAddService(false)}
      />
    </Layout>
  );
}
