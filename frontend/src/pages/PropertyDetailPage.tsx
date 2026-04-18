import React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Share2, Shield, Wrench, MessageSquare, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { GenerateReportModal }     from "@/components/GenerateReportModal";
import { LogJobModal }              from "@/components/LogJobModal";
import { RequestQuoteModal }        from "@/components/RequestQuoteModal";
import { InviteContractorModal }    from "@/components/InviteContractorModal";
import PropertyVerifyModal              from "@/components/PropertyVerifyModal";
import SystemAgesModal                  from "@/components/SystemAgesModal";
import RecurringServiceCreateModal      from "@/components/RecurringServiceCreateModal";
import InitListingModal                 from "@/components/InitListingModal";
import { fsboService } from "@/services/fsbo";
import { type Job, jobService } from "@/services/job";
import { computeScoreWithDecay, computeBreakdown, getScoreGrade, premiumEstimate, isCertified, scoreDelta } from "@/services/scoreService";
import { ScoreValueBanner } from "@/components/ScoreValueBanner";
import { PropertyEstimatedValueInput, getStoredEstimatedValue } from "@/components/PropertyEstimatedValueInput";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { getRecentScoreEvents, type ScoreEvent } from "@/services/scoreEventService";
import { getReEngagementPrompts, type ReEngagementPrompt } from "@/services/reEngagementService";
import { marketService, jobToSummary, type PropertyProfile, type ProjectRecommendation } from "@/services/market";
import { getWeeklyPulse } from "@/services/pulseService";
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
import { usePropertyDetail } from "@/hooks/usePropertyDetail";
import { usePropertyJobs } from "@/hooks/usePropertyJobs";
import { usePropertyPhotos } from "@/hooks/usePropertyPhotos";
import { usePropertyRooms } from "@/hooks/usePropertyRooms";
import { usePropertyMaintenance } from "@/hooks/usePropertyMaintenance";
import { usePropertyScore } from "@/hooks/usePropertyScore";
import { useUserTier } from "@/hooks/useUserTier";
import { TimelineTab }  from "./PropertyDetail/TimelineTab";
import { JobsTab }      from "./PropertyDetail/JobsTab";
import { DocumentsTab } from "./PropertyDetail/DocumentsTab";
import { SettingsTab }  from "./PropertyDetail/SettingsTab";
import { RoomsTab }     from "./PropertyDetail/RoomsTab";
import { BillsTab }     from "./PropertyDetail/BillsTab";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

type Tab = "timeline" | "jobs" | "rooms" | "documents" | "bills" | "settings";

interface ModalState {
  report:        boolean;
  logJob:        boolean;
  quote:         boolean;
  verify:        boolean;
  systemAges:    boolean;
  addService:    boolean;
  listing:       boolean;
  inviteJob:     Job | null;
  logJobPrefill:   { serviceType?: string; contractorName?: string } | undefined;
  quotePrefill:    { serviceType?: string; description?: string }    | undefined;
}

const MODALS_CLOSED: ModalState = {
  report:        false,
  logJob:        false,
  quote:         false,
  verify:        false,
  systemAges:    false,
  addService:    false,
  listing:       false,
  inviteJob:     null,
  logJobPrefill: undefined,
  quotePrefill:  undefined,
};

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties: storeProperties } = usePropertyStore();
  const { principal, profile } = useAuthStore();

  // ── domain hooks (each owns its own data + loading) ──────────────────────
  const { property, loading: propLoading } = usePropertyDetail(id);
  const { jobs, loading: jobsLoading, reload: reloadJobs, verifyJob } = usePropertyJobs(id);
  const { photosByJob, uploadPhoto, uploadRoomPhoto } = usePropertyPhotos(id);
  const { rooms, setRooms } = usePropertyRooms(id);
  const { recurringServices, visitLogMap, systemAges } = usePropertyMaintenance(id);
  const loading = propLoading || jobsLoading;
  const { scoreHistory } = usePropertyScore(id, property, jobs, loading);
  const userTier = useUserTier();

  // ── Check whether the user already has an active FSBO listing ────────────
  const [fsboRecord, setFsboRecord] = useState(() => id ? fsboService.getRecord(id) : null);
  useEffect(() => {
    if (id) setFsboRecord(fsboService.getRecord(id));
  }, [id]);

  // ── UI state (3 useState calls) ───────────────────────────────────────────
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "timeline";
  const [tab,   setTab]   = useState<Tab>(initialTab);
  const [modals, setModals] = useState<ModalState>(MODALS_CLOSED);
  const [estimatedHomeDollars, setEstimatedHomeDollars] = useState<number | null>(null);

  useEffect(() => {
    if (id) setEstimatedHomeDollars(getStoredEstimatedValue(id));
  }, [id]);

  // ── derived values ────────────────────────────────────────────────────────
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
  const homegenticScore = property ? computeScoreWithDecay(jobs, [property], totalDecay) : 0;
  const scoreGrade      = getScoreGrade(homegenticScore);
  const delta           = scoreDelta(scoreHistory);
  const certified       = isCertified(homegenticScore, jobs);

  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => !loading && property ? getRecentScoreEvents(jobs, [property]) : [],
    [jobs, property, loading]
  );

  const reEngagementPrompts: ReEngagementPrompt[] = React.useMemo(
    () => !loading ? getReEngagementPrompts(jobs) : [],
    [jobs, loading]
  );

  const recommendations: ProjectRecommendation[] = React.useMemo(() => {
    if (!property) return [];
    const prof: PropertyProfile = {
      yearBuilt:    Number(property.yearBuilt),
      squareFeet:   Number(property.squareFeet),
      propertyType: String(property.propertyType),
      state:        property.state,
      zipCode:      property.zipCode,
    };
    return marketService.recommendValueAddingProjects(prof, jobs.map(jobToSummary), 0).slice(0, 3);
  }, [property, jobs]);

  const pulseTip = React.useMemo(
    () => !loading && property ? getWeeklyPulse([property], jobs) : null,
    [property, jobs, loading]
  );
  const pulseEnabled = localStorage.getItem("homegentic_pulse_enabled") !== "false";

  const scoreStagnant = React.useMemo(() => {
    if (scoreHistory.length < 2) return false;
    const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
    const now     = Date.now();
    const current = scoreHistory[scoreHistory.length - 1];
    const old     = scoreHistory.find((s) => now - s.timestamp >= FOUR_WEEKS_MS);
    if (!old) return false;
    return current.score <= old.score;
  }, [scoreHistory]);

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
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
              <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, margin: 0 }}>
                {property.address}
              </h1>
              {property.verificationLevel === "Unverified" ? (
                <span style={{ display: "inline-flex", alignItems: "center", fontFamily: UI.mono, fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.2rem 0.625rem", borderRadius: 100, backgroundColor: COLORS.rust, color: "#fff", border: `1px solid ${COLORS.rust}`, flexShrink: 0 }}>
                  Unverified
                </span>
              ) : (
                <Badge variant={verificationColor as any}>{property.verificationLevel}</Badge>
              )}
            </div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
              {property.city}, {property.state} {property.zipCode} · {property.propertyType} · Built {String(property.yearBuilt)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              variant="primary"
              icon={<Wrench size={14} />}
              onClick={() => setModals((m) => ({ ...m, logJob: true }))}
            >
              Log Job
            </Button>
            <Button
              variant="secondary"
              icon={<MessageSquare size={14} />}
              onClick={() => setModals((m) => ({ ...m, quote: true }))}
            >
              Request Quote
            </Button>
            {property.verificationLevel !== "Unverified" && (
              <>
                <Button variant="outline" icon={<Share2 size={14} />} onClick={() => setModals((m) => ({ ...m, report: true }))}>
                  Share Report
                </Button>
                {!fsboRecord?.isFsbo && (
                  <Button
                    variant="outline"
                    style={{ borderColor: COLORS.sage, color: COLORS.sage }}
                    onClick={() => setModals((m) => ({ ...m, listing: true }))}
                  >
                    List Your Home
                  </Button>
                )}
              </>
            )}
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
            <Button size="sm" onClick={() => setModals((m) => ({ ...m, verify: true }))}>
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
              onLogJob={() => setModals((m) => ({ ...m, logJob: true, logJobPrefill: undefined }))}
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
              onRequestQuote={() => setModals((m) => ({ ...m, quote: true }))}
              onLogJob={(prefill) => setModals((m) => ({ ...m, logJob: true, logJobPrefill: prefill }))}
            />
            <MarketIntelPanel
              recommendations={recommendations}
              onRequestQuote={(prefill) => setModals((m) => ({ ...m, quote: true, quotePrefill: prefill }))}
              onSeeAll={() => navigate("/market")}
            />
            <RecurringServicesPanel
              services={recurringServices}
              visitLogMap={visitLogMap}
              userTier={userTier}
              onAddService={() => setModals((m) => ({ ...m, addService: true }))}
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

        {tab === "timeline"  && <TimelineTab property={property} jobs={jobs} onVerify={verifyJob} currentPrincipal={principal} photosByJob={photosByJob} onPhotoUpload={(jobId, file) => uploadPhoto(jobId, file, id!)} onInviteContractor={(job) => setModals((m) => ({ ...m, inviteJob: job }))} />}
        {tab === "jobs"      && <JobsTab jobs={jobs} />}
        {tab === "rooms"     && <RoomsTab propertyId={id!} rooms={rooms} onRoomsChange={setRooms} photosByJob={photosByJob} onRoomPhotoUpload={(roomId, file) => uploadRoomPhoto(roomId, file, id!)} />}
        {tab === "documents" && <DocumentsTab propertyId={id!} />}
        {tab === "bills"     && <BillsTab propertyId={id!} />}
        {tab === "settings"  && <SettingsTab property={property} currentPrincipal={principal ?? ""} onVerifyOwnership={() => setModals((m) => ({ ...m, verify: true }))} />}
      </div>

      {modals.report && (
        <GenerateReportModal property={property} onClose={() => setModals((m) => ({ ...m, report: false }))} />
      )}

      <LogJobModal
        isOpen={modals.logJob}
        onClose={() => setModals((m) => ({ ...m, logJob: false }))}
        onSuccess={reloadJobs}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
        prefill={modals.logJobPrefill}
      />

      <RequestQuoteModal
        isOpen={modals.quote}
        onClose={() => setModals((m) => ({ ...m, quote: false, quotePrefill: undefined }))}
        onSuccess={(quoteId) => { setModals((m) => ({ ...m, quote: false, quotePrefill: undefined })); navigate(`/quotes/${quoteId}`); }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
        prefill={modals.quotePrefill}
      />

      {modals.inviteJob && property && (
        <InviteContractorModal
          job={modals.inviteJob}
          propertyAddress={`${property.address}, ${property.city} ${property.state} ${property.zipCode}`}
          onClose={() => setModals((m) => ({ ...m, inviteJob: null }))}
        />
      )}

      <PropertyVerifyModal
        open={modals.verify}
        onClose={() => setModals((m) => ({ ...m, verify: false }))}
        propertyId={id ?? ""}
      />

      <SystemAgesModal
        open={modals.systemAges}
        onClose={() => setModals((m) => ({ ...m, systemAges: false }))}
        propertyId={id ?? ""}
        yearBuilt={property ? Number(property.yearBuilt) : new Date().getFullYear() - 20}
      />

      <RecurringServiceCreateModal
        open={modals.addService}
        onClose={() => setModals((m) => ({ ...m, addService: false }))}
        defaultPropertyId={id}
      />

      {modals.listing && property && (
        <InitListingModal
          open
          onClose={() => setModals((m) => ({ ...m, listing: false }))}
          property={property}
          jobs={jobs}
          score={homegenticScore}
        />
      )}
    </Layout>
  );
}
