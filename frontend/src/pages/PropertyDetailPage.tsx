import React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MobilePropertyPage } from "@/pages/MobilePropertyPage";
import {
  Share2, Shield, Wrench, MessageSquare, AlertCircle,
  CalendarDays, Activity, Cpu, ArrowRight,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { GenerateReportModal }       from "@/components/GenerateReportModal";
import { InsuranceShareModal }       from "@/components/InsuranceShareModal";
import { LogJobModal }               from "@/components/LogJobModal";
import { AddRoomModal }              from "@/components/AddRoomModal";
import { RequestQuoteModal }         from "@/components/RequestQuoteModal";
import { InviteContractorModal }     from "@/components/InviteContractorModal";
import PropertyVerifyModal           from "@/components/PropertyVerifyModal";
import SystemAgesModal               from "@/components/SystemAgesModal";
import RecurringServiceCreateModal   from "@/components/RecurringServiceCreateModal";
import InitListingModal              from "@/components/InitListingModal";
import { fsboService }               from "@/services/fsbo";
import { type Job, jobService }      from "@/services/job";
import { computeScoreWithDecay, getScoreGrade, scoreDelta } from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay } from "@/services/scoreDecayService";
import { type RecurringService, SERVICE_TYPE_LABELS } from "@/services/recurringService";
import { getStoredEstimatedValue }   from "@/components/PropertyEstimatedValueInput";
import { usePropertyStore }          from "@/store/propertyStore";
import { useAuthStore }              from "@/store/authStore";
import { usePropertyDetail }         from "@/hooks/usePropertyDetail";
import { usePropertyJobs }           from "@/hooks/usePropertyJobs";
import { usePropertyPhotos }         from "@/hooks/usePropertyPhotos";
import { usePropertyRooms }          from "@/hooks/usePropertyRooms";
import { usePropertyMaintenance }    from "@/hooks/usePropertyMaintenance";
import { usePropertyScore }          from "@/hooks/usePropertyScore";
import { TimelineTab }  from "./PropertyDetail/TimelineTab";
import { JobsTab }      from "./PropertyDetail/JobsTab";
import { DocumentsTab } from "./PropertyDetail/DocumentsTab";
import { SettingsTab }  from "./PropertyDetail/SettingsTab";
import { RoomsTab }     from "./PropertyDetail/RoomsTab";
import { BillsTab }     from "./PropertyDetail/BillsTab";
import { useState, useEffect } from "react";
import { Panel, spinnerVars } from "@/components/hud";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = "timeline" | "jobs" | "rooms" | "documents" | "bills" | "settings";

interface ModalState {
  report:        boolean;
  insurance:     boolean;
  logJob:        boolean;
  addRoom:       boolean;
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
  report: false, insurance: false, logJob: false, addRoom: false, quote: false,
  verify: false, systemAges: false, addService: false, listing: false,
  inviteJob: null, logJobPrefill: undefined, quotePrefill: undefined,
};

// ─── Local components ──────────────────────────────────────────────────────────

interface PickerProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  verificationLevel?: string;
}

function PropertyPicker({
  activeProperty,
  properties,
  onSelect,
}: {
  activeProperty: PickerProperty;
  properties: PickerProperty[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", borderRadius: 100, padding: "4px 9px 4px 0" }}
      >
        <div style={{ font: `400 13px/1.3 ${BODY}`, color: "var(--hg-ink-3)" }}>
          {activeProperty.address} · {activeProperty.city} {activeProperty.state} {activeProperty.zipCode}
        </div>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--hg-muted)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </div>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: 34, left: 0, zIndex: 20, width: 300, background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)", borderRadius: 16, padding: 7, boxShadow: "0 24px 60px var(--hg-shadow)" }}>
            {properties.map(p => (
              <div
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 11, background: p.id === activeProperty.id ? "var(--hg-blue-wash)" : "transparent", cursor: "pointer" }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: p.id === activeProperty.id ? "var(--hg-blue)" : "var(--hg-line-2)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `600 13px/1.3 ${BODY}`, color: "var(--hg-ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.address}</div>
                  <div style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: "var(--hg-muted)", marginTop: 6 }}>
                    {p.city}, {p.state}{p.verificationLevel ? ` · ${p.verificationLevel.toUpperCase()}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HealthGauge({ score, grade }: { score: number; grade: string }) {
  const r = 44, circ = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--hg-good)" : score >= 50 ? "var(--hg-warn)" : "var(--hg-bad)";
  return (
    <div style={{ position: "relative", width: 110, height: 110 }}>
      <svg width={110} height={110} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={55} cy={55} r={r} fill="none" stroke="var(--hg-line)" strokeWidth={10} />
        <circle cx={55} cy={55} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${Math.min(score / 100, 1) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "1.5rem", color: "var(--hg-ink)", lineHeight: 1 }}>{score}</div>
        <div style={{ fontFamily: BODY, fontSize: "0.6875rem", color, fontWeight: 600 }}>{grade}</div>
      </div>
    </div>
  );
}

function relativeTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function nextDueDate(svc: RecurringService, lastVisit?: string): Date {
  const base = lastVisit ? new Date(lastVisit) : new Date(svc.startDate);
  const d = new Date(base);
  switch (svc.frequency as string) {
    case "Monthly":    d.setMonth(d.getMonth() + 1);       break;
    case "Quarterly":  d.setMonth(d.getMonth() + 3);       break;
    case "SemiAnnual": d.setMonth(d.getMonth() + 6);       break;
    case "Annual":     d.setFullYear(d.getFullYear() + 1); break;
    case "BiAnnual":   d.setFullYear(d.getFullYear() + 2); break;
    default:           d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function maintenanceBadge(due: Date): { label: string; color: string } {
  const ms = due.getTime() - Date.now();
  if (ms < 0)               return { label: "Overdue",   color: "var(--hg-bad)" };
  if (ms < 30 * 86_400_000) return { label: "Due Soon",  color: "var(--hg-warn)" };
  return                           { label: "Scheduled", color: "var(--hg-good)" };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  const { isMobile, isTablet } = useBreakpoint();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties: storeProperties } = usePropertyStore();
  const { principal } = useAuthStore();

  const { property, loading: propLoading } = usePropertyDetail(id);
  const { jobs, loading: jobsLoading, reload: reloadJobs, verifyJob } = usePropertyJobs(id);
  const { photosByJob, uploadPhoto, uploadRoomPhoto } = usePropertyPhotos(id);
  const { rooms, setRooms } = usePropertyRooms(id);
  const { recurringServices, visitLogMap, systemAges } = usePropertyMaintenance(id);
  const loading = propLoading || jobsLoading;
  const { scoreHistory } = usePropertyScore(id, property, jobs, loading);

  const [fsboRecord, setFsboRecord] = useState(() => id ? fsboService.getRecord(id) : null);
  useEffect(() => { if (id) setFsboRecord(fsboService.getRecord(id)); }, [id]);

  const initialTab = (searchParams.get("tab") as Tab | null) ?? "timeline";
  const [tab,    setTab]    = useState<Tab>(initialTab);
  const [modals, setModals] = useState<ModalState>(MODALS_CLOSED);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [estimatedHomeDollars, setEstimatedHomeDollars] = useState<number | null>(null);
  useEffect(() => { if (id) setEstimatedHomeDollars(getStoredEstimatedValue(id)); }, [id]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalValue     = jobService.getTotalValue(jobs);
  const verifiedCount  = jobService.getVerifiedCount(jobs);
  const decayEvents    = React.useMemo(() => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [], [jobs, systemAges, loading]);
  const atRiskWarnings = React.useMemo(() => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [], [jobs, systemAges, loading]);
  const totalDecay     = getTotalDecay(decayEvents);
  const homegenticScore = property ? computeScoreWithDecay(jobs, [property], totalDecay) : 0;
  const scoreGrade     = getScoreGrade(homegenticScore);
  const delta          = scoreDelta(scoreHistory);
  const heroPhotoUrl   = Object.values(photosByJob).flat().find(Boolean)?.url ?? null;
  const recentActivity = React.useMemo(
    () => [...jobs].sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 4),
    [jobs],
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline",  label: "Timeline" },
    { key: "jobs",      label: `Jobs (${jobs.length})` },
    { key: "bills",     label: "Bills" },
    { key: "rooms",     label: `Rooms (${rooms.length})` },
    { key: "documents", label: "Documents" },
    { key: "settings",  label: "Settings" },
  ];

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout hideSidebar>
        <div className="hg-v3" data-theme="dark" style={{ minHeight: "100vh", background: "var(--hg-bg)", display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" style={spinnerVars} />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout hideSidebar>
        <div className="hg-v3" data-theme="dark" style={{ minHeight: "100vh", background: "var(--hg-bg)" }}>
          <div style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1.5rem 0", textAlign: "center" }}>
            <AlertCircle size={48} color="var(--hg-muted)" style={{ margin: "0 auto 1rem" }} />
            <h2 style={{ fontFamily: BODY, fontWeight: 700, color: "var(--hg-ink)" }}>Property not found</h2>
            <Button onClick={() => navigate("/dashboard")} style={{ marginTop: "1rem" }}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (isMobile) {
    return (
      <Layout>
        <MobilePropertyPage />
      </Layout>
    );
  }

  return (
    <Layout hideSidebar>
      <div className="hg-v3" data-theme="dark" style={{ minHeight: "100vh", background: "var(--hg-bg)" }}>
      <div style={{ padding: isTablet ? "1.25rem 1.25rem" : "1.5rem 2rem" }}>

        {/* ── Page header ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--hg-muted)", font: "inherit" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--hg-blue-ink)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--hg-muted)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Dashboard
            </button>
            <span style={{ color: "var(--hg-line-2)" }}>/</span>
            <span style={{ color: "var(--hg-muted)" }}>PROPERTY</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.875rem", color: "var(--hg-ink)", margin: "0 0 10px" }}>
                Rooms and finishes at {property.address}
              </h1>
              <PropertyPicker
                activeProperty={{
                  id:       String(property.id),
                  address:  property.address,
                  city:     property.city,
                  state:    property.state,
                  zipCode:  property.zipCode ?? "",
                  verificationLevel: property.verificationLevel,
                }}
                properties={storeProperties.map(p => ({
                  id:       String(p.id),
                  address:  p.address,
                  city:     p.city,
                  state:    p.state,
                  zipCode:  p.zipCode ?? "",
                  verificationLevel: p.verificationLevel,
                }))}
                onSelect={(pid) => navigate(`/properties/${pid}`)}
              />
            </div>
            <button
              onClick={() => setModals(m => ({ ...m, addRoom: true }))}
              style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: "#FCFCFD", background: "var(--hg-blue)", border: "none", borderRadius: 100, padding: "10px 20px", cursor: "pointer" }}
            >
              + Add room
            </button>
          </div>
        </div>

        {/* ── Verification banners ───────────────────────────────────────────── */}
        {property.verificationLevel === "Unverified" && (
          <div style={{ border: "1px solid var(--hg-blue-edge)", padding: "1rem 1.25rem", marginBottom: "1.25rem", background: "var(--hg-blue-wash)", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", borderRadius: "0.75rem" }}>
            <Shield size={16} color="var(--hg-warn)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.875rem", color: "var(--hg-ink)", marginBottom: "0.25rem" }}>Ownership not verified</p>
              <p style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", marginBottom: 0 }}>
                Upload a utility bill, deed, or tax record to confirm ownership.
              </p>
            </div>
            <Button size="sm" onClick={() => setModals(m => ({ ...m, verify: true }))}>Verify Now</Button>
          </div>
        )}
        {property.verificationLevel === "PendingReview" && (
          <div style={{ border: "1px solid var(--hg-yel-edge)", padding: "1rem 1.25rem", marginBottom: "1.25rem", background: "var(--hg-yel-wash)", display: "flex", alignItems: "center", gap: "1rem", borderRadius: "0.75rem" }}>
            <Shield size={16} color="var(--hg-warn)" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.875rem", color: "var(--hg-ink)", marginBottom: "0.25rem" }}>Under review</p>
              <p style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", marginBottom: 0 }}>
                Documents are awaiting review (typically 1–2 business days).
              </p>
            </div>
          </div>
        )}

        {/* ── Hero + Health Score ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem", marginBottom: "1.25rem" }}>

          {/* Property image */}
          <div style={{ position: "relative", borderRadius: "0.75rem", overflow: "hidden", minHeight: "240px", background: heroPhotoUrl ? "transparent" : "linear-gradient(135deg, var(--hg-fill-2) 0%, var(--hg-blue) 100%)" }}>
            {heroPhotoUrl && (
              <img src={heroPhotoUrl} alt="Property" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.78) 100%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1.5rem 1.75rem", color: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
                <h2 style={{ fontFamily: BODY, fontWeight: 700, fontSize: "1.375rem", margin: 0, lineHeight: 1.2 }}>
                  {property.address}
                </h2>
                {property.verificationLevel !== "Unverified" && (
                  <span style={{ background: "var(--hg-good)", color: "#0B1220", borderRadius: "1rem", padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 600 }}>
                    ✓ Verified
                  </span>
                )}
              </div>
              <p style={{ margin: "0 0 0.75rem", opacity: 0.9, fontSize: "0.875rem", fontFamily: BODY }}>
                {property.city}, {property.state} {property.zipCode}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", fontSize: "0.8125rem", opacity: 0.85, marginBottom: "1.25rem", fontFamily: BODY }}>
                <span>🏠 {property.propertyType}</span>
                <span>📅 Built {String(property.yearBuilt)}</span>
                {Number(property.squareFeet) > 0 && (
                  <span>📐 {Number(property.squareFeet).toLocaleString()} Sq Ft</span>
                )}
              </div>
              <button
                onClick={() => document.getElementById("property-tabs")?.scrollIntoView({ behavior: "smooth" })}
                style={{ background: "transparent", border: "2px solid rgba(255,255,255,0.75)", color: "white", padding: "0.5rem 1.25rem", borderRadius: "0.5rem", fontFamily: BODY, fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}
              >
                View Property Details
              </button>
            </div>
          </div>

          {/* Health Score */}
          <Panel style={{ padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
            <h3 style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.9375rem", color: "var(--hg-ink)", margin: 0, alignSelf: "flex-start", width: "100%" }}>
              Property Health Score
            </h3>
            <HealthGauge score={homegenticScore} grade={scoreGrade} />
            {delta !== 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: BODY, fontSize: "0.8125rem", color: delta > 0 ? "var(--hg-good)" : "var(--hg-bad)", fontWeight: 600 }}>
                  {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} pts
                </div>
                <div style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)" }}>vs last month</div>
              </div>
            )}
            <button
              onClick={() => setModals(m => ({ ...m, report: true }))}
              style={{ width: "100%", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-blue-ink)", border: "1px solid var(--hg-line-2)", background: "var(--hg-fill)", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}
            >
              View Full Report
            </button>
          </Panel>
        </div>

        {/* ── Action buttons ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <button
            onClick={() => setModals(m => ({ ...m, logJob: true }))}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "#FCFCFD", background: "var(--hg-blue)", border: "none", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <Wrench size={15} /> Log Job
          </button>
          <button
            onClick={() => setModals(m => ({ ...m, quote: true }))}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-blue-ink)", background: "var(--hg-blue-wash)", border: "1px solid var(--hg-blue-edge)", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <MessageSquare size={15} /> Request Quote
          </button>
          {property.verificationLevel !== "Unverified" && (
            <>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowReportMenu(v => !v)}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-ink)", background: "var(--hg-fill)", border: "1px solid var(--hg-line-2)", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
                >
                  <Share2 size={15} /> Reports ▾
                </button>
                {showReportMenu && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowReportMenu(false)} />
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)", borderRadius: "0.5rem", boxShadow: "0 24px 60px var(--hg-shadow)", minWidth: "220px", overflow: "hidden" }}>
                      <button onClick={() => { setShowReportMenu(false); setModals(m => ({ ...m, report: true })); }} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", padding: "0.75rem 1rem", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--hg-line)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--hg-fill)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-ink)" }}><Share2 size={14} /> Share Report</span>
                        <span style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", marginTop: "0.1rem" }}>Share with buyers, agents, or tenants</span>
                      </button>
                      <button onClick={() => { setShowReportMenu(false); setModals(m => ({ ...m, insurance: true })); }} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", padding: "0.75rem 1rem", background: "none", border: "none", cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--hg-fill)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-ink)" }}><Shield size={14} /> Insurance Report</span>
                        <span style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", marginTop: "0.1rem" }}>For claims, renewals, or coverage review</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              {!fsboRecord?.isFsbo && (
                <button
                  onClick={() => setModals(m => ({ ...m, listing: true }))}
                  style={{ fontFamily: BODY, fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-blue-ink)", background: "var(--hg-fill)", border: "1px solid var(--hg-blue-edge)", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
                >
                  List Your Home
                </button>
              )}
            </>
          )}
        </div>

        {/* ── KPI cards ───────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: "0.875rem", marginBottom: "1.25rem" }}>
          {[
            {
              label: "Maintenance Due",
              icon:  <Wrench size={15} color="var(--hg-blue-ink)" />,
              value: String(atRiskWarnings.length),
              sub:   "Tasks",
              badge: atRiskWarnings.length > 0 ? { label: "● Overdue", color: "var(--hg-bad)" } : null,
            },
            {
              label: "Total Jobs",
              icon:  <CalendarDays size={15} color="var(--hg-blue-ink)" />,
              value: String(jobs.length),
              sub:   "Logged",
              badge: null,
            },
            {
              label: "Verified Records",
              icon:  <Shield size={15} color="var(--hg-blue-ink)" />,
              value: String(verifiedCount),
              sub:   `of ${jobs.length} jobs`,
              badge: null,
            },
            {
              label: "Value Added",
              icon:  <Activity size={15} color="var(--hg-blue-ink)" />,
              value: `$${(totalValue / 100).toLocaleString()}`,
              sub:   "Documented",
              badge: null,
            },
            {
              label: "Market Value",
              icon:  <span style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-blue-ink)", fontWeight: 700 }}>$</span>,
              value: estimatedHomeDollars ? `$${Math.round(estimatedHomeDollars / 1_000)}K` : "—",
              sub:   "Estimated",
              badge: null,
            },
          ].map(stat => (
            <Panel key={stat.label} style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <span style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", lineHeight: 1.3 }}>{stat.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--hg-blue-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {stat.icon}
                </div>
              </div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "1.625rem", color: "var(--hg-ink)", lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", marginTop: "0.25rem" }}>{stat.sub}</div>
              {stat.badge && (
                <div style={{ fontFamily: BODY, fontSize: "0.75rem", color: stat.badge.color, fontWeight: 600, marginTop: "0.375rem" }}>
                  {stat.badge.label}
                </div>
              )}
            </Panel>
          ))}
        </div>

        {/* ── Three panels ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr 1fr" : "1fr 1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>

          {/* Upcoming Maintenance */}
          <Panel style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
              <h3 style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.9375rem", color: "var(--hg-ink)", margin: 0 }}>Upcoming Maintenance</h3>
              <button onClick={() => navigate("/maintenance")} style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-blue-ink)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              {recurringServices.length === 0 ? (
                <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
                  <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", marginBottom: "0.5rem" }}>No scheduled services yet.</p>
                  <button
                    onClick={() => setModals(m => ({ ...m, addService: true }))}
                    style={{ fontFamily: BODY, fontSize: "0.8125rem", fontWeight: 600, color: "var(--hg-blue-ink)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    + Add recurring service
                  </button>
                </div>
              ) : (
                recurringServices.slice(0, 3).map(svc => {
                  const visits = visitLogMap[svc.id] ?? [];
                  const lastVisit = visits[visits.length - 1]?.visitDate;
                  const due = nextDueDate(svc, lastVisit);
                  const badge = maintenanceBadge(due);
                  return (
                    <div key={svc.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: badge.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)" }}>
                          Due {due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      <span style={{ fontFamily: BODY, fontSize: "0.75rem", fontWeight: 600, color: badge.color, flexShrink: 0 }}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--hg-line)" }}>
              <button
                onClick={() => navigate("/maintenance")}
                style={{ width: "100%", fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-blue-ink)", border: "1px solid var(--hg-line-2)", background: "var(--hg-fill)", borderRadius: "0.5rem", padding: "0.625rem", cursor: "pointer" }}
              >
                View Maintenance Plan
              </button>
            </div>
          </Panel>

          {/* Recent Activity */}
          <Panel style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
              <h3 style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.9375rem", color: "var(--hg-ink)", margin: 0 }}>Recent Activity</h3>
              <button
                onClick={() => { setTab("jobs"); document.getElementById("property-tabs")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-blue-ink)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
              >
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              {recentActivity.length === 0 ? (
                <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
                  <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", marginBottom: "0.5rem" }}>No activity yet. Log your first job!</p>
                  <button
                    onClick={() => setModals(m => ({ ...m, logJob: true }))}
                    style={{ fontFamily: BODY, fontSize: "0.8125rem", fontWeight: 600, color: "var(--hg-blue-ink)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    + Log a job
                  </button>
                </div>
              ) : (
                recentActivity.map(job => (
                  <div key={job.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: job.status === "verified" ? "var(--hg-good-wash)" : "var(--hg-blue-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Wrench size={13} color={job.status === "verified" ? "var(--hg-good)" : "var(--hg-blue-ink)"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)", fontWeight: 500 }}>{job.serviceType}</div>
                      <div style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)" }}>
                        {job.isDiy ? "DIY" : (job.contractorName ?? "Unknown contractor")}
                      </div>
                    </div>
                    <span style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", flexShrink: 0 }}>
                      {relativeTime(Number(job.createdAt))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* Connected Devices */}
          <Panel style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
              <h3 style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.9375rem", color: "var(--hg-ink)", margin: 0 }}>Connected Devices</h3>
              <button
                onClick={() => navigate("/sensors")}
                style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-blue-ink)", background: "none", border: "none", cursor: "pointer" }}
              >
                Manage
              </button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.25rem", gap: "0.75rem" }}>
              <Cpu size={32} color="var(--hg-muted)" />
              <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", textAlign: "center", margin: 0 }}>
                No devices connected yet.
              </p>
              <button
                onClick={() => navigate("/sensors")}
                style={{ fontFamily: BODY, fontSize: "0.8125rem", fontWeight: 600, color: "var(--hg-blue-ink)", border: "1px solid var(--hg-line-2)", background: "var(--hg-fill)", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
              >
                View All Devices
              </button>
            </div>
          </Panel>
        </div>

        {/* ── CTA banner ──────────────────────────────────────────────────────── */}
        <div style={{ background: "var(--hg-blue-wash)", border: "1px solid var(--hg-blue-edge)", borderRadius: "0.75rem", padding: "1.5rem 2rem", display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <span style={{ fontSize: "2.25rem", lineHeight: 1 }}>🪖</span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "1.0625rem", color: "var(--hg-ink)", marginBottom: "0.25rem" }}>
              Need help with your home?
            </div>
            <div style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)" }}>
              Get matched with trusted local pros or request a quote.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexShrink: 0 }}>
            <button
              onClick={() => navigate("/contractors")}
              style={{ fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "#FCFCFD", background: "var(--hg-blue)", border: "none", borderRadius: "0.5rem", padding: "0.625rem 1.25rem", cursor: "pointer" }}
            >
              Find Contractors
            </button>
            <button
              onClick={() => setModals(m => ({ ...m, quote: true }))}
              style={{ fontFamily: BODY, fontSize: "0.875rem", fontWeight: 600, color: "var(--hg-blue-ink)", background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)", borderRadius: "0.5rem", padding: "0.625rem 1.25rem", cursor: "pointer" }}
            >
              Request a Quote
            </button>
          </div>
        </div>

        {/* ── Property details tabs ────────────────────────────────────────────── */}
        <div id="property-tabs">
          <h2 style={{ fontFamily: BODY, fontWeight: 700, fontSize: "1.125rem", color: "var(--hg-ink)", marginBottom: "1rem" }}>
            Property Details
          </h2>
          <div style={{ display: "flex", borderBottom: "1px solid var(--hg-line)", marginBottom: "1.5rem" }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ padding: "0.625rem 1.25rem", fontFamily: BODY, fontSize: "0.875rem", fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? "var(--hg-blue-ink)" : "var(--hg-muted)", background: "none", border: "none", borderBottom: tab === t.key ? "2px solid var(--hg-blue)" : "2px solid transparent", marginBottom: "-1px", cursor: "pointer", transition: "color 0.15s" }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "timeline"  && <TimelineTab property={property} jobs={jobs} onVerify={verifyJob} currentPrincipal={principal} photosByJob={photosByJob} onPhotoUpload={(jobId, file) => uploadPhoto(jobId, file, id!)} onInviteContractor={job => setModals(m => ({ ...m, inviteJob: job }))} />}
          {tab === "jobs"      && <JobsTab jobs={jobs} />}
          {tab === "rooms"     && <RoomsTab propertyId={id!} rooms={rooms} onRoomsChange={setRooms} photosByJob={photosByJob} onRoomPhotoUpload={(roomId, file) => uploadRoomPhoto(roomId, file, id!)} />}
          {tab === "documents" && <DocumentsTab propertyId={id!} />}
          {tab === "bills"     && <BillsTab propertyId={id!} />}
          {tab === "settings"  && <SettingsTab property={property} currentPrincipal={principal ?? ""} onVerifyOwnership={() => setModals(m => ({ ...m, verify: true }))} />}
        </div>

      </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {modals.report && (
        <GenerateReportModal property={property} onClose={() => setModals(m => ({ ...m, report: false }))} />
      )}
      {modals.insurance && (
        <InsuranceShareModal property={property} onClose={() => setModals(m => ({ ...m, insurance: false }))} />
      )}
      <LogJobModal
        isOpen={modals.logJob}
        onClose={() => setModals(m => ({ ...m, logJob: false }))}
        onSuccess={reloadJobs}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
        prefill={modals.logJobPrefill}
      />
      <AddRoomModal
        isOpen={modals.addRoom}
        onClose={() => setModals(m => ({ ...m, addRoom: false }))}
        propertyId={id!}
        onSuccess={(room) => setRooms(r => [...r, room])}
      />
      <RequestQuoteModal
        isOpen={modals.quote}
        onClose={() => setModals(m => ({ ...m, quote: false, quotePrefill: undefined }))}
        onSuccess={quoteId => { setModals(m => ({ ...m, quote: false, quotePrefill: undefined })); navigate(`/quotes/${quoteId}`); }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
        prefill={modals.quotePrefill}
      />
      {modals.inviteJob && property && (
        <InviteContractorModal
          job={modals.inviteJob}
          propertyAddress={`${property.address}, ${property.city} ${property.state} ${property.zipCode}`}
          onClose={() => setModals(m => ({ ...m, inviteJob: null }))}
        />
      )}
      <PropertyVerifyModal
        open={modals.verify}
        onClose={() => setModals(m => ({ ...m, verify: false }))}
        propertyId={id ?? ""}
      />
      <SystemAgesModal
        open={modals.systemAges}
        onClose={() => setModals(m => ({ ...m, systemAges: false }))}
        propertyId={id ?? ""}
        yearBuilt={property ? Number(property.yearBuilt) : new Date().getFullYear() - 20}
      />
      <RecurringServiceCreateModal
        open={modals.addService}
        onClose={() => setModals(m => ({ ...m, addService: false }))}
        defaultPropertyId={id}
      />
      {modals.listing && property && (
        <InitListingModal
          open
          onClose={() => setModals(m => ({ ...m, listing: false }))}
          property={property}
          jobs={jobs}
          score={homegenticScore}
        />
      )}
    </Layout>
  );
}
