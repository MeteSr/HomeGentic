import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Share2, Shield, Wrench, MessageSquare, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { GenerateReportModal }     from "@/components/GenerateReportModal";
import { LogJobModal }              from "@/components/LogJobModal";
import { RequestQuoteModal }        from "@/components/RequestQuoteModal";
import { InviteContractorModal }    from "@/components/InviteContractorModal";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { photoService, Photo } from "@/services/photo";
import { computeScore, computeScoreWithDecay, computeBreakdown, getScoreGrade, recordSnapshot, premiumEstimate, isCertified, loadHistory, scoreDelta, type ScoreSnapshot } from "@/services/scoreService";
import { ScoreValueBanner } from "@/components/ScoreValueBanner";
import { PropertyEstimatedValueInput, getStoredEstimatedValue } from "@/components/PropertyEstimatedValueInput";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { systemAgesService, type SystemAges } from "@/services/systemAges";
import { recurringService, type RecurringService, type VisitLog } from "@/services/recurringService";
import { getRecentScoreEvents, type ScoreEvent } from "@/services/scoreEventService";
import { getReEngagementPrompts, type ReEngagementPrompt } from "@/services/reEngagementService";
import { marketService, jobToSummary, type PropertyProfile, type ProjectRecommendation } from "@/services/market";
import { getWeeklyPulse } from "@/services/pulseService";
import { roomService, type Room as RoomRecord } from "@/services/room";
import { paymentService, type PlanTier } from "@/services/payment";
import { ScorePanel } from "@/components/ScorePanel";
import { ScoreActivityFeed } from "@/components/ScoreActivityFeed";
import { AlertStack } from "@/components/AlertStack";
import { MilestoneStack } from "@/components/MilestoneStack";
import { ReEngagementStack } from "@/components/ReEngagementStack";
import { MarketIntelPanel } from "@/components/MarketIntelPanel";
import { RecurringServicesPanel } from "@/components/RecurringServicesPanel";
import FsboPanel from "@/components/FsboPanel";
import { usePropertyStore } from "@/store/propertyStore";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import { TimelineTab }  from "./PropertyDetail/TimelineTab";
import { JobsTab }      from "./PropertyDetail/JobsTab";
import { DocumentsTab } from "./PropertyDetail/DocumentsTab";
import { SettingsTab }  from "./PropertyDetail/SettingsTab";
import { RoomsTab }     from "./PropertyDetail/RoomsTab";
import { BillsTab }     from "./PropertyDetail/BillsTab";

import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

type Tab = "timeline" | "jobs" | "rooms" | "documents" | "bills" | "settings";

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties: storeProperties } = usePropertyStore();
  const { principal, profile } = useAuthStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "timeline";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [showReportModal,  setShowReportModal]  = useState(false);
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [inviteJob,        setInviteJob]        = useState<Job | null>(null);
  const [logJobPrefill,    setLogJobPrefill]    = useState<{ serviceType?: string; contractorName?: string } | undefined>(undefined);
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
  const [photosByJob, setPhotosByJob] = useState<Record<string, Photo[]>>({});
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [userTier, setUserTier] = useState<PlanTier>("Free");
  const [systemAges,         setSystemAges]         = useState<SystemAges>({});
  const [recurringServices,  setRecurringServices]  = useState<RecurringService[]>([]);
  const [visitLogMap,        setVisitLogMap]        = useState<Record<string, VisitLog[]>>({});
  const [scoreHistory,       setScoreHistory]       = useState<ScoreSnapshot[]>([]);
  const [estimatedHomeDollars, setEstimatedHomeDollars] = useState<number | null>(null);

  // Load persisted estimated home value for this property
  useEffect(() => {
    if (id) setEstimatedHomeDollars(getStoredEstimatedValue(id));
  }, [id]);

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      propertyService.getProperty(BigInt(id)).then(setProperty).catch(() => {
        const cached = storeProperties.find((p) => String(p.id) === id);
        if (cached) setProperty(cached);
      }),
      jobService.getByProperty(id).then(setJobs).catch(() => {}),
      roomService.getRoomsByProperty(id).then(setRooms).catch(() => {}),
      photoService.getByProperty(id).then((photos) => {
        const map: Record<string, Photo[]> = {};
        for (const p of photos) {
          (map[p.jobId] ??= []).push(p);
        }
        setPhotosByJob(map);
      }).catch(() => {}),
      // Load recurring services for Home Panel
      recurringService.getByProperty(id).then(async (svcs) => {
        setRecurringServices(svcs);
        const logEntries = await Promise.all(
          svcs.map(async (s) => {
            const logs = await recurringService.getVisitLogs(s.id).catch(() => [] as VisitLog[]);
            return [s.id, logs] as [string, VisitLog[]];
          })
        );
        setVisitLogMap(Object.fromEntries(logEntries));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
    // Load system ages and score history
    setSystemAges(systemAgesService.get(id));
    setScoreHistory(loadHistory(id));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record score snapshot (with decay) whenever property + jobs are resolved
  useEffect(() => {
    if (!loading && property) {
      const rawScore = computeScore(jobs, [property]);
      const history  = recordSnapshot(rawScore, String(property.id));
      setScoreHistory(history);
    }
  }, [loading, property, jobs]);

  const handlePhotoUpload = async (jobId: string, file: File) => {
    try {
      const photo = await photoService.upload(file, jobId, id!, "PostConstruction", "Job photo");
      setPhotosByJob((prev) => ({
        ...prev,
        [jobId]: [...(prev[jobId] ?? []), photo],
      }));
    } catch (err: any) {
      toast.error(err.message ?? "Photo upload failed");
    }
  };

  const handleRoomPhotoUpload = async (roomId: string, file: File) => {
    try {
      const photo = await photoService.uploadRoomPhoto(file, roomId, id!, "PostConstruction", "Room photo");
      const key = `ROOM_${roomId}`;
      setPhotosByJob((prev) => ({
        ...prev,
        [key]: [...(prev[key] ?? []), photo],
      }));
    } catch (err: any) {
      toast.error(err.message ?? "Photo upload failed");
    }
  };

  const handleVerify = async (jobId: string) => {
    try {
      const updated = await jobService.verifyJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch {
      toast.error("Could not sign job. Please try again.");
    }
  };

  const totalValue = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);

  // Decay-aware score
  const decayEvents: DecayEvent[] = React.useMemo(
    () => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const atRiskWarnings: AtRiskWarning[] = React.useMemo(
    () => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const totalDecay   = getTotalDecay(decayEvents);
  const homegenticScore = property ? computeScoreWithDecay(jobs, [property], totalDecay) : 0;
  const scoreGrade   = getScoreGrade(homegenticScore);
  const delta        = scoreDelta(scoreHistory);
  const certified    = isCertified(homegenticScore, jobs);

  // Score activity feed (positive events + decay)
  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => !loading && property ? getRecentScoreEvents(jobs, [property]) : [],
    [jobs, property, loading]
  );

  // Contractor re-engagement prompts
  const reEngagementPrompts: ReEngagementPrompt[] = React.useMemo(
    () => !loading ? getReEngagementPrompts(jobs) : [],
    [jobs, loading]
  );

  // ROI-ranked project recommendations
  const recommendations: ProjectRecommendation[] = React.useMemo(() => {
    if (!property) return [];
    const profile: PropertyProfile = {
      yearBuilt:    Number(property.yearBuilt),
      squareFeet:   Number(property.squareFeet),
      propertyType: String(property.propertyType),
      state:        property.state,
      zipCode:      property.zipCode,
    };
    return marketService.recommendValueAddingProjects(profile, jobs.map(jobToSummary), 0).slice(0, 3);
  }, [property, jobs]);

  // Weekly pulse tip
  const pulseTip = React.useMemo(
    () => !loading && property ? getWeeklyPulse([property], jobs) : null,
    [property, jobs, loading]
  );
  const pulseEnabled = localStorage.getItem("homegentic_pulse_enabled") !== "false";

  // Score stagnation
  const scoreStagnant = React.useMemo(() => {
    if (scoreHistory.length < 2) return false;
    const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
    const now     = Date.now();
    const current = scoreHistory[scoreHistory.length - 1];
    const old     = scoreHistory.find((s) => now - s.timestamp >= FOUR_WEEKS_MS);
    if (!old) return false;
    return current.score <= old.score;
  }, [scoreHistory]);

  // Account age (for milestone logic)
  const accountAgeMs = profile?.createdAt ? Date.now() - Number(profile.createdAt) / 1_000_000 : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline",  label: "Timeline" },
    { key: "jobs",      label: `Jobs (${jobs.length})` },
    { key: "rooms",     label: `Rooms (${rooms.length})` },
    { key: "documents", label: "Documents" },
    { key: "bills",     label: "Bills" },
    { key: "settings",  label: "Settings" },
  ];

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "2rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <AlertCircle size={48} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontFamily: UI.serif, fontWeight: 900, color: UI.ink }}>Property not found</h2>
          <Button onClick={() => navigate("/dashboard")} style={{ marginTop: "1rem" }}>
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  const verificationColor =
    property.verificationLevel === "Premium" ? "success"
    : property.verificationLevel === "Basic" ? "info"
    : property.verificationLevel === "PendingReview" ? "warning"
    : "default";

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Back — hidden for single-property users whose home base is this page */}
        {storeProperties.length !== 1 && (
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
              textTransform: "uppercase", color: UI.inkLight,
              background: "none", border: "none", cursor: "pointer",
              padding: 0, marginBottom: "1.5rem",
            }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: COLORS.butter, color: COLORS.plum, padding: "4px 14px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.625rem", border: `1px solid rgba(46,37,64,0.1)` }}>
              Property Record
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
              {property.address}
            </h1>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
              {property.city}, {property.state} {property.zipCode} · {property.propertyType} · Built {String(property.yearBuilt)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <Badge variant={verificationColor as any}>{property.verificationLevel}</Badge>
            <Button variant="outline" icon={<Wrench size={14} />} onClick={() => setShowLogJobModal(true)}>Log Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={() => setShowQuoteModal(true)}>Request Quote</Button>
            <Button icon={<Share2 size={14} />} onClick={() => setShowReportModal(true)}>
              Share HomeGentic Report
            </Button>
          </div>
        </div>

        {/* Verification banners */}
        {property.verificationLevel === "Unverified" && (
          <div style={{
            border: `1px solid ${UI.rust}`, padding: "1rem 1.25rem",
            marginBottom: "1.5rem", background: COLORS.sageLight,
            display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
          }}>
            <Shield size={16} color={UI.rust} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Ownership not verified
              </p>
              <p style={{ fontSize: "0.8rem", color: UI.inkLight, fontWeight: 300 }}>
                Upload a utility bill, deed, or tax record to confirm ownership. Unverified properties cannot generate shareable HomeGentic reports.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/properties/${property.id}/verify`)}>
              Verify Now
            </Button>
          </div>
        )}

        {property.verificationLevel === "PendingReview" && (
          <div style={{
            border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem",
            marginBottom: "1.5rem", background: COLORS.butter,
            display: "flex", alignItems: "center", gap: "1rem",
          }}>
            <Shield size={16} color={COLORS.plum} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Under review
              </p>
              <p style={{ fontSize: "0.8rem", color: UI.inkLight, fontWeight: 300 }}>
                Your documents are awaiting review. Reports will be unlocked once approved (typically 1–2 business days).
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[
            { label: "Total Jobs",   value: String(jobs.length) },
            { label: "Verified",     value: String(verifiedCount) },
            { label: "Value Added",  value: `$${(totalValue / 100).toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} style={{ padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, background: COLORS.white, boxShadow: SHADOWS.card }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
                {s.label}
              </div>
              <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, color: UI.ink }}>
                {s.value}
              </div>
            </div>
          ))}
          {/* HomeGentic Score — accent cell */}
          <div style={{ padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.plum}`, background: COLORS.plum, boxShadow: SHADOWS.card }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.5rem" }}>
              HomeGentic Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, color: COLORS.white }}>
                {homegenticScore}
              </div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: "rgba(255,255,255,0.7)" }}>
                {scoreGrade}
              </div>
            </div>
          </div>
        </div>

        {/* §17.3.2 — Score → Dollar Value (zip-aware + home value personalization) */}
        {!loading && homegenticScore >= 40 && property && (
          <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <ScoreValueBanner
              score={homegenticScore}
              zip={property.zipCode || undefined}
              homeValueDollars={estimatedHomeDollars ?? undefined}
            />
            <PropertyEstimatedValueInput
              propertyId={String(property.id)}
              onValueChange={setEstimatedHomeDollars}
            />
          </div>
        )}

        {/* Improvement actions (15.4.2) */}
        {!loading && homegenticScore > 0 && (() => {
          const unverified = jobs.filter((j) => j.status !== "verified").length;
          const uniqueTypes = new Set(jobs.map((j) => j.serviceType)).size;
          const actions = [
            unverified > 0
              ? `Verify ${unverified} unverified job${unverified > 1 ? "s" : ""} — each verified record adds up to 4 pts`
              : null,
            uniqueTypes < 5
              ? `Log a new service type — diversity adds up to 10 pts (currently ${uniqueTypes}/5 categories)`
              : null,
            jobs.length < 10
              ? `Add more maintenance records — ${10 - jobs.length} more job${10 - jobs.length !== 1 ? "s" : ""} to reach 10 total`
              : null,
            "Attach photos to each job — documented proof strengthens your verified score",
          ].filter(Boolean).slice(0, 3) as string[];

          return (
            <div style={{ border: `1px solid ${COLORS.rule}`, background: COLORS.white, marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.75rem 1.25rem", borderBottom: `1px solid ${COLORS.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                  How to improve your score
                </span>
                <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
                  {actions.length} action{actions.length !== 1 ? "s" : ""}
                </span>
              </div>
              {userTier === "Free" ? (
                <div style={{ padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
                    {actions.length} action{actions.length !== 1 ? "s" : ""} available — upgrade to see them
                  </p>
                  <button
                    onClick={() => navigate("/pricing")}
                    style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: "none", background: COLORS.plum, color: COLORS.white, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Upgrade to Pro →
                  </button>
                </div>
              ) : (
                <div>
                  {actions.map((action, i) => (
                    <div key={i} style={{ padding: "0.75rem 1.25rem", borderBottom: i < actions.length - 1 ? `1px solid ${COLORS.rule}` : "none", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.sage, marginTop: "0.1rem", flexShrink: 0 }}>→</span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.ink, lineHeight: 1.5 }}>{action}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Home Panel (16.2) — visible only to single-property users ──────── */}
        {storeProperties.length === 1 && !loading && (
          <div style={{ marginBottom: "2rem" }}>
            <ScorePanel
              score={homegenticScore}
              grade={scoreGrade}
              delta={delta}
              certified={certified}
              premium={premiumEstimate(homegenticScore)}
              market={property ? `${property.city}, ${property.state}` : ""}
              onResaleReady={() => navigate("/resale-ready")}
              onCopyCertLink={async () => {
                if (!property) return;
                const { certService } = await import("@/services/cert");
                const payload = { address: property.address, score: homegenticScore, grade: scoreGrade, certified, generatedAt: Date.now(), planTier: userTier, breakdown: computeBreakdown(jobs, [property]) };
                const { token } = await certService.issueCert(String(property.id), payload);
                navigator.clipboard.writeText(`${window.location.origin}/cert/${token}`);
                toast.success("Lender certificate link copied!");
              }}
            />
            <AlertStack
              atRiskWarnings={atRiskWarnings}
              scoreStagnant={scoreStagnant}
              pulseTip={pulseTip}
              pulseEnabled={pulseEnabled}
              userTier={userTier}
              onLogJob={() => { setLogJobPrefill(undefined); setShowLogJobModal(true); }}
              onNavigate={(path) => navigate(path)}
            />
            <MilestoneStack
              verifiedJobCount={verifiedCount}
              accountAgeMs={accountAgeMs}
              certified={certified}
              onNavigate={(path) => navigate(path)}
            />
            <ScoreActivityFeed scoreEvents={scoreEvents} decayEvents={decayEvents} />
            <ReEngagementStack
              prompts={reEngagementPrompts}
              onRequestQuote={(prefill) => { setShowQuoteModal(true); }}
              onLogJob={(prefill) => { setLogJobPrefill(prefill); setShowLogJobModal(true); }}
            />
            <MarketIntelPanel
              recommendations={recommendations}
              onLogJob={(prefill) => { setLogJobPrefill(prefill); setShowLogJobModal(true); }}
              onSeeAll={() => navigate("/market")}
            />
            <RecurringServicesPanel
              services={recurringServices}
              visitLogMap={visitLogMap}
              userTier={userTier}
              onAddService={() => navigate("/recurring/new")}
              onViewService={(svcId) => navigate(`/recurring/${svcId}`)}
            />
          </div>
        )}

        {/* 10.1 — FSBO Panel */}
        {!loading && property && (
          <div style={{ marginBottom: "2rem" }}>
            <FsboPanel
              propertyId={String(property.id)}
              score={homegenticScore}
              verifiedJobCount={verifiedCount}
              hasReport={false}
            />
          </div>
        )}

        {/* Upsell card (16.3.3) — multi-property prompt for single-property users */}
        {storeProperties.length === 1 && !loading && (
          <div style={{
            border: `1px solid ${COLORS.rule}`, background: COLORS.white,
            padding: "1.25rem 1.5rem", marginBottom: "2rem",
            borderRadius: 0, display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: "1rem", flexWrap: "wrap",
          }}>
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.25rem" }}>
                Own more than one property?
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.inkLight }}>
                Track all your properties in one place — compare scores, share reports, and manage maintenance across your portfolio.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/properties/new")}>
              Add Another Property →
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.rule}`, marginBottom: "1.5rem" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "0.625rem 1.25rem",
                fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? COLORS.sage : COLORS.plumMid,
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? `2px solid ${COLORS.sage}` : "2px solid transparent",
                marginBottom: "-1px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "timeline"  && <TimelineTab property={property} jobs={jobs} onVerify={handleVerify} currentPrincipal={principal} photosByJob={photosByJob} onPhotoUpload={handlePhotoUpload} onInviteContractor={setInviteJob} />}
        {tab === "jobs"      && <JobsTab jobs={jobs} />}
        {tab === "rooms"     && <RoomsTab propertyId={id!} rooms={rooms} onRoomsChange={setRooms} photosByJob={photosByJob} onRoomPhotoUpload={handleRoomPhotoUpload} />}
        {tab === "documents" && <DocumentsTab propertyId={id!} />}
        {tab === "bills"     && <BillsTab propertyId={id!} />}
        {tab === "settings"  && <SettingsTab property={property} currentPrincipal={principal ?? ""} />}
      </div>

      {showReportModal && (
        <GenerateReportModal property={property} onClose={() => setShowReportModal(false)} />
      )}

      <LogJobModal
        isOpen={showLogJobModal}
        onClose={() => setShowLogJobModal(false)}
        onSuccess={() => {
          jobService.getByProperty(id!).then(setJobs).catch(() => {});
        }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
        prefill={logJobPrefill}
      />

      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSuccess={(quoteId) => { setShowQuoteModal(false); navigate(`/quotes/${quoteId}`); }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
      />

      {inviteJob && property && (
        <InviteContractorModal
          job={inviteJob}
          propertyAddress={`${property.address}, ${property.city} ${property.state} ${property.zipCode}`}
          onClose={() => setInviteJob(null)}
        />
      )}
    </Layout>
  );
}

