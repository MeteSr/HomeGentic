import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X, ShieldCheck, Calendar, AlertTriangle, CheckCircle, XCircle, Mic, MicOff, Loader2, Volume2, ChevronLeft, ChevronRight } from "lucide-react";
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
import { PropertyCard }          from "@/components/PropertyCard";
import { BaselinePromptCard }    from "@/components/BaselinePromptCard";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { NeighborhoodBenchmark } from "@/components/NeighborhoodBenchmark";
import { ScoreActivityFeed } from "@/components/ScoreActivityFeed";
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
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import LocalBrokerModal, { isLocalBrokerArea, isLocalBrokerDismissed } from "@/components/LocalBrokerModal";

const UI = {
  ink:      COLORS.plum,
  paper:    "#ffffff",
  rule:     COLORS.rule,
  rust:     COLORS.sageText,   // primary accent: sageText for accessible contrast
  inkLight: COLORS.plumMid,
  sage:     COLORS.sageText,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

// ─── Modal state ──────────────────────────────────────────────────────────────
interface ModalState {
  showLogJobModal: boolean;
  logJobPrefill: { serviceType?: string; contractorName?: string } | undefined;
  showQuoteModal: boolean;
  showUpgradeModal: boolean;
  showAddService: boolean;
  showScoreBreakdown: boolean;
  showScoreChart: boolean;
}

const MODAL_INITIAL: ModalState = {
  showLogJobModal: false,
  logJobPrefill: undefined,
  showQuoteModal: false,
  showUpgradeModal: false,
  showAddService: false,
  showScoreBreakdown: false,
  showScoreChart: false,
};

// ─── AI Hero Bar ─────────────────────────────────────────────────────────────

function AIHeroBar() {
  const {
    state, transcript, response, error, isSupported,
    startListening, stopListening, reset, sendChat,
    fallbackNotice, quotaExhausted,
    pendingProposal, confirmProposal, dismissProposal,
  } = useVoiceAgent();
  const { profile } = useAuthStore();
  const [inputText, setInputText] = React.useState("");

  const EXAMPLE_PROMPTS = [
    "What's my HomeGentic Score?",
    "Which jobs should I verify next?",
    "Log an HVAC service",
    "What's the ROI on a kitchen remodel?",
    "Show upcoming maintenance tasks",
  ];
  const [promptIdx, setPromptIdx] = React.useState(0);
  const [typedText, setTypedText] = React.useState("");

  React.useEffect(() => {
    if (state !== "idle") return;
    const id = setInterval(() => setPromptIdx((i) => (i + 1) % EXAMPLE_PROMPTS.length), 4000);
    return () => clearInterval(id);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const target = EXAMPLE_PROMPTS[promptIdx];
    setTypedText("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTypedText(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, 38);
    return () => clearInterval(id);
  }, [promptIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.email
    ? profile.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).split(" ")[0]
    : "";

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";

  return (
    <div style={{ marginBottom: "2.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Greeting */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "0.625rem", marginBottom: "1.25rem",
      }}>
        <Sparkles size={28} color={COLORS.sage} strokeWidth={1.5} />
        <h1 style={{
          fontFamily: FONTS.serif, fontWeight: 700, fontSize: "2rem",
          color: COLORS.plum, lineHeight: 1, margin: 0,
        }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: "680px",
        background: "#ffffff",
        border: "1px solid #e5e5e5",
        borderRadius: "1rem",
        padding: "1rem 1.25rem 0.75rem",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {/* Response / transcript area */}
        {(transcript || response || error || (isProcessing && !response)) && (
          <div style={{ marginBottom: "0.75rem" }}>
            {fallbackNotice && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", color: "#aaa", margin: "0 0 0.375rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.65rem" }}>ⓘ</span> Agent limit reached — answering via chat
              </p>
            )}
            {transcript && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: "#666", fontStyle: "italic", margin: 0, marginBottom: response ? "0.375rem" : 0 }}>
                "{transcript}"
              </p>
            )}
            {isProcessing && !response && (
              <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: "#999" }}>Thinking…</span>
            )}
            {response && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.9rem", color: COLORS.plum, lineHeight: 1.6, margin: 0 }}>{response}</p>
            )}
            {error && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.rust, margin: 0 }}>{error}</p>
            )}
          </div>
        )}

        {/* Text input */}
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const text = inputText.trim();
              if (!text || isProcessing) return;
              setInputText("");
              sendChat(text);
            }
          }}
          placeholder={isIdle && !transcript && !response ? (typedText || "Ask HomeGentic AI…") : "Ask a follow-up…"}
          disabled={isProcessing || isListening}
          rows={1}
          style={{
            width: "100%", resize: "none", border: "none", outline: "none",
            fontFamily: FONTS.sans, fontSize: "0.9rem", color: COLORS.plum,
            background: "transparent", padding: 0, marginBottom: "0.625rem",
            lineHeight: 1.5, boxSizing: "border-box",
          }}
        />

        {/* Bottom bar */}
        <div style={{
          borderTop: "1px solid #f0f0f0", paddingTop: "0.625rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", letterSpacing: "0.04em", color: COLORS.plumMid, fontWeight: 400 }}>
            {quotaExhausted ? "Chat mode" : "HomeGentic AI"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {(transcript || response || error) && (
              <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, display: "flex", padding: 0 }} aria-label="Dismiss">
                <X size={14} />
              </button>
            )}
            {/* Send button — visible when there's typed text */}
            {inputText.trim() && (
              <button
                onClick={() => { const t = inputText.trim(); if (t) { setInputText(""); sendChat(t); } }}
                disabled={isProcessing}
                aria-label="Send"
                style={{
                  background: COLORS.plum, border: "none", borderRadius: "0.375rem",
                  padding: "0.25rem 0.625rem", cursor: isProcessing ? "not-allowed" : "pointer",
                  fontFamily: FONTS.sans, fontSize: "0.7rem", color: "#fff",
                  display: "flex", alignItems: "center",
                }}
              >
                Send
              </button>
            )}
            {isSupported && (
              <button
                onClick={isListening ? stopListening : isIdle ? startListening : undefined}
                disabled={isProcessing || isSpeaking}
                aria-label={isListening ? "Stop listening" : "Use voice mode"}
                style={{
                  background: "none", border: "none", padding: "0.25rem",
                  cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", color: isListening ? COLORS.rust : COLORS.plumMid,
                  transition: "color 0.15s",
                }}
              >
                {isListening  && <MicOff  size={18} />}
                {isProcessing && <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />}
                {isSpeaking   && <Volume2 size={18} />}
                {isIdle       && <Mic     size={18} />}
              </button>
            )}
          </div>
        </div>

        {/* Proposal strip */}
        {pendingProposal && (
          <div style={{
            marginTop: "0.5rem", borderTop: "1px solid #f0f0f0", paddingTop: "0.625rem",
            display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#aaa", marginRight: "0.5rem" }}>Proposal</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plum }}>
                {pendingProposal.serviceType} · {pendingProposal.propertyAddress} · ${(pendingProposal.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <button onClick={confirmProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.875rem", background: COLORS.sageText, border: "none", color: "#fff", cursor: "pointer", borderRadius: "0.25rem" }}>
                Confirm
              </button>
              <button onClick={dismissProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.875rem", background: "none", border: "1px solid #ddd", color: "#888", cursor: "pointer", borderRadius: "0.25rem" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick-action chips */}
      {isIdle && !transcript && !response && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.875rem" }}>
          {[
            { label: "My score",        prompt: "What's my HomeGentic Score and how can I improve it?" },
            { label: "Log a job",       prompt: "I want to log a maintenance job" },
            { label: "Upcoming tasks",  prompt: "Show my upcoming maintenance tasks" },
            { label: "Best ROI project",prompt: "What home improvement has the best ROI for my property?" },
          ].map(({ label, prompt }) => (
            <button
              key={label}
              onClick={() => sendChat(prompt)}
              style={{
                fontFamily: FONTS.sans, fontSize: "0.78rem", color: "#555",
                background: "#fff", border: "1px solid #e0e0e0",
                borderRadius: "2rem", padding: "0.375rem 0.875rem",
                cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#bbb"; (e.currentTarget as HTMLButtonElement).style.color = "#222"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e0e0e0"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Insights Strip ───────────────────────────────────────────────────────────

interface InsightItem {
  id:          string;
  content:     React.ReactNode;
  canDismiss:  boolean;
  onDismiss?:  () => void;
  bg:          string;
  borderColor: string;
}

function InsightsStrip({ items }: { items: InsightItem[] }) {
  const [idx, setIdx] = React.useState(0);
  if (items.length === 0) return null;
  const safeIdx = Math.min(idx, items.length - 1);
  const item    = items[safeIdx];

  const handleDismiss = () => {
    item.onDismiss?.();
    setIdx((i) => Math.max(0, i - 1));
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.625rem",
      padding: "0.75rem 1rem", marginBottom: "1.5rem",
      background: item.bg, border: `1px solid ${item.borderColor}`,
      borderRadius: RADIUS.sm,
    }}>
      {items.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", flexShrink: 0 }}>
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
            aria-label="Previous insight"
            style={{ background: "none", border: "none", cursor: safeIdx === 0 ? "default" : "pointer", opacity: safeIdx === 0 ? 0.3 : 1, display: "flex", padding: "0.1rem" }}
          >
            <ChevronLeft size={12} />
          </button>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", letterSpacing: "0.06em", color: COLORS.plumMid, minWidth: "2rem", textAlign: "center" }}>
            {safeIdx + 1} / {items.length}
          </span>
          <button
            onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
            disabled={safeIdx === items.length - 1}
            aria-label="Next insight"
            style={{ background: "none", border: "none", cursor: safeIdx === items.length - 1 ? "default" : "pointer", opacity: safeIdx === items.length - 1 ? 0.3 : 1, display: "flex", padding: "0.1rem" }}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>{item.content}</div>

      {item.canDismiss && item.onDismiss && (
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, flexShrink: 0, display: "flex" }} aria-label="Dismiss insight">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, lastLoginAt } = useAuthStore();
  const { isMobile } = useBreakpoint();
  const { isOpen: isWizardOpen, open: openAddProp } = useAddPropertyStore();

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

  // ─── Local broker modal ───────────────────────────────────────────────────────
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  useEffect(() => {
    if (propLoading || properties.length === 0 || isLocalBrokerDismissed()) return;
    const cities = properties.map((p) => (p as any).city ?? "");
    if (isLocalBrokerArea(cities)) setShowBrokerModal(true);
  }, [propLoading, properties]);

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

  // Redirect when user has exactly one property (nothing to select on dashboard).
  // Suppressed while the add-property wizard is open so mid-onboarding navigation
  // doesn't fire while the user is still stepping through the wizard.
  useEffect(() => {
    if (!propLoading && properties.length === 1 && !isWizardOpen) {
      navigate(`/properties/${properties[0].id}`, { replace: true });
    }
  }, [propLoading, properties.length, isWizardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise property selector to first property after load
  useEffect(() => {
    if (!propLoading && properties.length > 0 && !propertyInitialized.current) {
      propertyInitialized.current = true;
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [propLoading, properties]);

  // Auto-open the add-property modal for new users who haven't completed onboarding
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!propLoading && !autoOpenedRef.current && profile && !profile.onboardingComplete && properties.length === 0) {
      autoOpenedRef.current = true;
      openAddProp();
    }
  }, [propLoading, profile, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived UI values ───────────────────────────────────────────────────────

  const hasProperty = properties.length > 0;
  const hasJob      = jobs.length > 0;

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
  const showMilestone = !loading && hasJob && !d.milestoneDismissed
    && accountAgeMs >= 11 * 30 * 24 * 60 * 60 * 1000;

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

  // ─── Insights for strip ─────────────────────────────────────────────────────
  const insightItems: InsightItem[] = [];

  if (showMilestone) {
    insightItems.push({
      id: "milestone",
      content: (
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: "#F4F1EB", fontWeight: 300 }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginRight: "0.5rem" }}>One Year</span>
          <strong style={{ fontWeight: 600 }}>${(totalValue / 100).toLocaleString()} in documented improvements</strong> — real value for your next sale.{" "}
          <button onClick={() => navigate("/resale-ready")} style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${UI.rust}`, background: "none", color: UI.rust, cursor: "pointer", borderRadius: RADIUS.sm, marginLeft: "0.5rem" }}>
            Resale Summary →
          </button>
        </p>
      ),
      canDismiss: true,
      onDismiss: d.dismissMilestone,
      bg: UI.ink,
      borderColor: UI.rust,
    });
  }

  if (!loading && verifiedCount >= 3 && !d.milestone3Dismissed) {
    insightItems.push({
      id: "milestone3",
      content: (
        <p style={{ fontSize: "0.875rem", fontWeight: 300 }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.sage, marginRight: "0.5rem" }}>Milestone</span>
          <strong style={{ fontWeight: 600 }}>{verifiedCount} verified records</strong> on the blockchain. Buyers can now see a real maintenance history.
        </p>
      ),
      canDismiss: true,
      onDismiss: d.dismissMilestone3,
      bg: COLORS.sageLight,
      borderColor: COLORS.sageMid,
    });
  }

  if (showPulse && pulseTip) {
    insightItems.push({
      id: "pulse",
      content: (
        <div>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.125rem" }}>
            Home Pulse · <span style={{ color: COLORS.plumMid }}>{pulseTip.category}</span>
          </p>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.1rem" }}>{pulseTip.headline}</p>
          <p style={{ fontSize: "0.78rem", color: UI.inkLight, fontWeight: 300 }}>{pulseTip.detail}</p>
        </div>
      ),
      canDismiss: true,
      onDismiss: d.dismissPulse,
      bg: "#fff",
      borderColor: UI.rule,
    });
  }

  if (!loading && scoreStagnant) {
    insightItems.push({
      id: "stagnant",
      content: (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.125rem" }}>
              Score Hasn't Moved in 30 Days
            </p>
            <p style={{ fontSize: "0.8rem", fontWeight: 300, color: UI.inkLight }}>
              Log a recent job or verify a property to keep your HomeGentic Score growing.
            </p>
          </div>
          <button
            onClick={() => openLogJob(undefined)}
            style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: UI.ink, color: UI.paper, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem", flexShrink: 0, borderRadius: RADIUS.pill }}
          >
            Log a Job <ArrowRight size={12} />
          </button>
        </div>
      ),
      canDismiss: false,
      bg: "#fff",
      borderColor: UI.rule,
    });
  }

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* AI Hero Bar */}
        <AIHeroBar />

        {/* Insights Strip — consolidates milestone, verified milestone, pulse, stagnant */}
        <InsightsStrip items={insightItems} />


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
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.sageText }}>
                Score Up +{delta} pts
              </span>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.sageText }}>
                {scoreValueChange != null
                  ? `— Your score went from ${prevScore} to ${homegenticScore}. A ${delta}-point increase ≈ $${scoreValueChange.toLocaleString()} in estimated home value.`
                  : `— Your HomeGentic Score is now ${homegenticScore}. Keep logging jobs to grow your record.`}
              </span>
            </div>
            <button onClick={d.dismissScoreIncrease} aria-label="Dismiss score update" style={{ background: "none", border: "none", cursor: "pointer", color: UI.sage, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {!isAllView && (
          <>

        {/* Midsection: Score | Stats */}
        {(() => {
          const r = 46, cx = 60, cy = 60;
          const circ = 2 * Math.PI * r;
          const arcLen = circ * 0.75;
          const fill = arcLen * (homegenticScore / 100);
          const textGrade = homegenticScore >= 88 ? "Excellent" : homegenticScore >= 75 ? "Great" : homegenticScore >= 60 ? "Good" : "Fair";
          const stats = [
            { label: "Total Value",         value: `$${(totalValue / 100).toLocaleString()}`,                             sub: scoreValueChange ? `↑ $${scoreValueChange.toLocaleString()} this month` : null, icon: <CheckCircle size={18} strokeWidth={1.5} /> },
            { label: "Verified Jobs",        value: String(verifiedCount),                                                 sub: verifiedCount > 0 ? `↑ ${verifiedCount} this month` : null,                      icon: <CheckCircle size={18} strokeWidth={1.5} /> },
            { label: "HomeGentic Premium™",  value: `$${Math.round((totalValue / 100) * 0.03).toLocaleString()}`,          sub: "Active",                                                                         icon: <CheckCircle size={18} strokeWidth={1.5} /> },
          ];
          return (
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", width: "100%", maxWidth: "680px", margin: "0 auto 2.5rem", border: `1px solid ${COLORS.rule}`, borderRadius: "1rem", overflow: "hidden", alignItems: "stretch" }}>

              {/* Score gauge */}
              <div style={{ background: COLORS.plum, padding: "1.75rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: `1px solid rgba(122,175,118,0.15)` }}>
                <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: "0.875rem" }}>
                  HomeGentic Score
                </div>
                <div style={{ position: "relative", width: 120, height: 120 }}>
                  <svg viewBox="0 0 120 120" width="120" height="120">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arcLen} ${circ - arcLen}`} transform={`rotate(135 ${cx} ${cy})`} />
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.sage} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${fill} ${circ - fill}`} transform={`rotate(135 ${cx} ${cy})`} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: "8px" }}>
                    <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", color: "white", lineHeight: 1 }}>{homegenticScore}</span>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>/100</span>
                  </div>
                </div>
                <div style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1rem", color: COLORS.sage, marginTop: "0.625rem" }}>
                  {textGrade}
                </div>
                {delta !== 0 && (
                  <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: delta > 0 ? COLORS.sage : COLORS.blush, marginTop: "0.25rem", letterSpacing: "0.04em" }}>
                    {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} pts this month
                  </div>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {stats.map((stat, i, arr) => (
                  <div key={stat.label} style={{ flex: 1, padding: "1.25rem 1.5rem", borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.rule}` : "none", display: "flex", alignItems: "center", gap: "1rem", background: COLORS.white }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.375rem" }}>
                        {stat.label}
                      </div>
                      <div style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: UI.ink }}>
                        {stat.value}
                      </div>
                      {stat.sub && (
                        <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: COLORS.sageText, marginTop: "0.3rem", letterSpacing: "0.03em" }}>
                          {stat.sub}
                        </div>
                      )}
                    </div>
                    <div style={{ color: "rgba(46,37,64,0.2)", flexShrink: 0 }}>{stat.icon}</div>
                  </div>
                ))}
              </div>

            </div>
          );
        })()}


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
            {modals.showScoreBreakdown && (
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
                      <div style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: homegenticScore >= g ? COLORS.sageText : UI.ink }}>{g}</div>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, marginTop: "0.25rem" }}>
                        {g === 60 ? "Good" : g === 75 ? "Great" : g === 88 ? "Excellent" : "Perfect"}
                      </div>
                      {homegenticScore >= g && (
                        <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: COLORS.sageText, marginTop: "0.2rem" }}>✓ Achieved</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : homegenticScore >= scoreGoal ? (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: COLORS.sageText, marginBottom: "0.375rem" }}>
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
                      <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: priorityColor, border: `1px solid ${priorityColor}`, padding: "0.1rem 0.4rem", flexShrink: 0, borderRadius: 100 }}>
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
          <>
          {/* Aggregate stats — mirrors the single-property midsection */}
          {(() => {
            const avgScore      = Math.round(propertyComparison.reduce((s, r) => s + r.score, 0) / propertyComparison.length);
            const totalVal      = propertyComparison.reduce((s, r) => s + r.value, 0);
            const totalVerified = propertyComparison.reduce((s, r) => s + r.verified, 0);
            const avgGrade      = avgScore >= 88 ? "Excellent" : avgScore >= 75 ? "Great" : avgScore >= 60 ? "Good" : "Fair";
            const r2 = 46, cx2 = 60, cy2 = 60;
            const circ2  = 2 * Math.PI * r2;
            const arcLen2 = circ2 * 0.75;
            const fill2   = arcLen2 * (avgScore / 100);
            const aggStats = [
              { label: "Total Portfolio Value", value: `$${(totalVal / 100).toLocaleString()}`,                          sub: null,                                          icon: <CheckCircle size={18} strokeWidth={1.5} /> },
              { label: "Total Verified Jobs",   value: String(totalVerified),                                            sub: `across ${properties.length} properties`,      icon: <CheckCircle size={18} strokeWidth={1.5} /> },
              { label: "HomeGentic Premium™",   value: `$${Math.round((totalVal / 100) * 0.03).toLocaleString()}`,       sub: "Active",                                      icon: <CheckCircle size={18} strokeWidth={1.5} /> },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", width: "100%", maxWidth: "680px", margin: "0 auto 2.5rem", border: `1px solid ${COLORS.rule}`, borderRadius: "1rem", overflow: "hidden", alignItems: "stretch" }}>
                <div style={{ background: COLORS.plum, padding: "1.75rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: `1px solid rgba(122,175,118,0.15)` }}>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: "0.875rem" }}>Avg Score</div>
                  <div style={{ position: "relative", width: 120, height: 120 }}>
                    <svg viewBox="0 0 120 120" width="120" height="120">
                      <circle cx={cx2} cy={cy2} r={r2} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arcLen2} ${circ2 - arcLen2}`} transform={`rotate(135 ${cx2} ${cy2})`} />
                      <circle cx={cx2} cy={cy2} r={r2} fill="none" stroke={COLORS.sage} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${fill2} ${circ2 - fill2}`} transform={`rotate(135 ${cx2} ${cy2})`} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: "8px" }}>
                      <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", color: "white", lineHeight: 1 }}>{avgScore}</span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>/100</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1rem", color: COLORS.sage, marginTop: "0.625rem" }}>{avgGrade}</div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: "rgba(255,255,255,0.7)", marginTop: "0.25rem" }}>{properties.length} properties</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {aggStats.map((stat, i, arr) => (
                    <div key={stat.label} style={{ flex: 1, padding: "1.25rem 1.5rem", borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.rule}` : "none", display: "flex", alignItems: "center", gap: "1rem", background: COLORS.white }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.375rem" }}>{stat.label}</div>
                        <div style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: UI.ink }}>{stat.value}</div>
                        {stat.sub && <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: COLORS.sageText, marginTop: "0.3rem", letterSpacing: "0.03em" }}>{stat.sub}</div>}
                      </div>
                      <div style={{ color: "rgba(46,37,64,0.2)", flexShrink: 0 }}>{stat.icon}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Property comparison table */}
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
          </>
        )}

        {/* Properties */}
        <div style={{ maxWidth: "680px", margin: "0 auto 2.5rem", border: `1px solid ${COLORS.rule}`, borderRadius: "1rem", overflow: "hidden" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, padding: "0.875rem 1.25rem", borderBottom: `1px solid ${COLORS.rule}` }}>
            My Properties
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}><div className="spinner-lg" /></div>
          ) : properties.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <Home size={40} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No properties yet</p>
              <p style={{ fontSize: "0.875rem", color: UI.inkLight, fontWeight: 300, maxWidth: "24rem", margin: "0 auto 1.5rem" }}>
                Add your first property to start building a verified, on-chain maintenance history.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <Button onClick={openAddProp} icon={<Sparkles size={14} />}>Get started</Button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem", padding: "1.25rem" }}>
                {properties.map((property) => (
                  <PropertyCard key={String(property.id)} property={property} onClick={() => navigate(`/properties/${property.id}`)} badge={verificationBadge(property.verificationLevel)} />
                ))}
              </div>

              {/* Baseline photo prompts — one per property, hidden once dismissed or all 6 captured */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0 1.25rem 1.25rem" }}>
                {properties.map((property) => (
                  <BaselinePromptCard
                    key={String(property.id)}
                    property={property}
                    dismissed={d.dismissedBaselinePrompts.has(String(property.id))}
                    onDismiss={() => d.dismissBaselinePrompt(String(property.id))}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pending Contractor Proposals */}
        {pendingProposals.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Pending Contractor Proposals
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "0.1rem 0.5rem", background: COLORS.sageText, color: "#fff", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
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
                        padding: "0.4rem 0.875rem", background: COLORS.sageText, color: COLORS.white,
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
                  <div style={{ display: "inline-flex", padding: "0.1rem 0.5rem", background: COLORS.sageText, color: "#fff", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 100 }}>
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
              aria-label="Dismiss next service reminder"
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
              aria-label="Dismiss re-engagement prompt"
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
                onClick={() => setModals((m) => ({ ...m, showAddService: true }))}
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
                  onClick={() => setModals((m) => ({ ...m, showAddService: true }))}
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

      <RecurringServiceCreateModal
        open={modals.showAddService}
        onClose={() => setModals((m) => ({ ...m, showAddService: false }))}
        onSuccess={() => { /* useMaintenanceSchedule / usePropertySummary will refresh on next mount */ }}
      />

      {/* Local broker modal — Daytona area geo-targeting */}
      {showBrokerModal && (
        <LocalBrokerModal
          propertyAddress={(properties[0] as any)?.address ?? ""}
          onClose={() => setShowBrokerModal(false)}
        />
      )}

    </Layout>
  );
}
