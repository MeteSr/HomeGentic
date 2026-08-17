import React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Share2, Shield, Wrench, MessageSquare, AlertCircle,
  CalendarDays, Activity, Cpu, ArrowRight,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { GenerateReportModal }       from "@/components/GenerateReportModal";
import { InsuranceShareModal }       from "@/components/InsuranceShareModal";
import { LogJobModal }               from "@/components/LogJobModal";
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
import { COLORS, FONTS } from "@/theme";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       COLORS.canvas,
  card:     "#FFFFFF",
  border:   "#E5E7EB",
  text:     COLORS.plum,
  muted:    COLORS.plumMid,
  green:    COLORS.sageText,
  greenBg:  COLORS.sageLight,
  greenBdr: COLORS.sageMid,
  blue:     "#2563EB",
  blueBg:   "#EFF6FF",
  orange:   "#D97706",
  orangeBg: "#FFFBEB",
  red:      COLORS.errorText,
  redBg:    "#FEF2F2",
  shadow:   "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = "timeline" | "jobs" | "rooms" | "documents" | "bills" | "settings";

interface ModalState {
  report:        boolean;
  insurance:     boolean;
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
  report: false, insurance: false, logJob: false, quote: false,
  verify: false, systemAges: false, addService: false, listing: false,
  inviteJob: null, logJobPrefill: undefined, quotePrefill: undefined,
};

// ─── Local components ──────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "0.75rem", boxShadow: C.shadow, ...style }}>
      {children}
    </div>
  );
}

function HealthGauge({ score, grade }: { score: number; grade: string }) {
  const r = 44, circ = 2 * Math.PI * r;
  const color = score >= 70 ? C.green : score >= 50 ? C.orange : C.red;
  return (
    <div style={{ position: "relative", width: 110, height: 110 }}>
      <svg width={110} height={110} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={55} cy={55} r={r} fill="none" stroke="#E5E7EB" strokeWidth={10} />
        <circle cx={55} cy={55} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${Math.min(score / 100, 1) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.5rem", color: C.text, lineHeight: 1 }}>{score}</div>
        <div style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color, fontWeight: 600 }}>{grade}</div>
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
  if (ms < 0)               return { label: "Overdue",   color: C.red };
  if (ms < 30 * 86_400_000) return { label: "Due Soon",  color: C.orange };
  return                           { label: "Scheduled", color: C.green };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
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
        <div style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <AlertCircle size={48} color={C.muted} style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontFamily: FONTS.sans, fontWeight: 700, color: C.text }}>Property not found</h2>
          <Button onClick={() => navigate("/dashboard")} style={{ marginTop: "1rem" }}>
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: "1.5rem 2rem", background: C.bg, minHeight: "100vh" }}>

        {/* ── Page header ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.625rem", color: C.text, margin: 0 }}>
              Property Overview
            </h1>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginTop: "0.25rem", marginBottom: 0 }}>
              Stay on top of your home's health, maintenance, and value.
            </p>
          </div>
          <button style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}>
            + Add Widget
          </button>
        </div>

        {/* ── Verification banners ───────────────────────────────────────────── */}
        {property.verificationLevel === "Unverified" && (
          <div style={{ border: `1px solid ${COLORS.sageMid}`, padding: "1rem 1.25rem", marginBottom: "1.25rem", background: COLORS.sageLight, display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", borderRadius: "0.75rem" }}>
            <Shield size={16} color={C.orange} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: C.text, marginBottom: "0.25rem" }}>Ownership not verified</p>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, marginBottom: 0 }}>
                Upload a utility bill, deed, or tax record to confirm ownership.
              </p>
            </div>
            <Button size="sm" onClick={() => setModals(m => ({ ...m, verify: true }))}>Verify Now</Button>
          </div>
        )}
        {property.verificationLevel === "PendingReview" && (
          <div style={{ border: `1px solid ${C.border}`, padding: "1rem 1.25rem", marginBottom: "1.25rem", background: "#FFFBEB", display: "flex", alignItems: "center", gap: "1rem", borderRadius: "0.75rem" }}>
            <Shield size={16} color={C.orange} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: C.text, marginBottom: "0.25rem" }}>Under review</p>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, marginBottom: 0 }}>
                Documents are awaiting review (typically 1–2 business days).
              </p>
            </div>
          </div>
        )}

        {/* ── Hero + Health Score ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem", marginBottom: "1.25rem" }}>

          {/* Property image */}
          <div style={{ position: "relative", borderRadius: "0.75rem", overflow: "hidden", minHeight: "240px", background: heroPhotoUrl ? "transparent" : "linear-gradient(135deg, #1a2f4e 0%, #2563EB 100%)" }}>
            {heroPhotoUrl && (
              <img src={heroPhotoUrl} alt="Property" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.72) 100%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1.5rem 1.75rem", color: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
                <h2 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.375rem", margin: 0, lineHeight: 1.2 }}>
                  {property.address}
                </h2>
                {property.verificationLevel !== "Unverified" && (
                  <span style={{ background: "#16A34A", color: "white", borderRadius: "1rem", padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 600 }}>
                    ✓ Verified
                  </span>
                )}
              </div>
              <p style={{ margin: "0 0 0.75rem", opacity: 0.9, fontSize: "0.875rem", fontFamily: FONTS.sans }}>
                {property.city}, {property.state} {property.zipCode}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", fontSize: "0.8125rem", opacity: 0.85, marginBottom: "1.25rem", fontFamily: FONTS.sans }}>
                <span>🏠 {property.propertyType}</span>
                <span>📅 Built {String(property.yearBuilt)}</span>
                {Number(property.squareFeet) > 0 && (
                  <span>📐 {Number(property.squareFeet).toLocaleString()} Sq Ft</span>
                )}
              </div>
              <button
                onClick={() => document.getElementById("property-tabs")?.scrollIntoView({ behavior: "smooth" })}
                style={{ background: "transparent", border: "2px solid rgba(255,255,255,0.75)", color: "white", padding: "0.5rem 1.25rem", borderRadius: "0.5rem", fontFamily: FONTS.sans, fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}
              >
                View Property Details
              </button>
            </div>
          </div>

          {/* Health Score */}
          <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
            <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0, alignSelf: "flex-start", width: "100%" }}>
              Property Health Score
            </h3>
            <HealthGauge score={homegenticScore} grade={scoreGrade} />
            {delta !== 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: delta > 0 ? C.green : C.red, fontWeight: 600 }}>
                  {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} pts
                </div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>vs last month</div>
              </div>
            )}
            <button
              onClick={() => setModals(m => ({ ...m, report: true }))}
              style={{ width: "100%", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}
            >
              View Full Report
            </button>
          </Card>
        </div>

        {/* ── Action buttons ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <button
            onClick={() => setModals(m => ({ ...m, logJob: true }))}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: "white", background: C.blue, border: "none", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <Wrench size={15} /> Log Job
          </button>
          <button
            onClick={() => setModals(m => ({ ...m, quote: true }))}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.blue, background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <MessageSquare size={15} /> Request Quote
          </button>
          {property.verificationLevel !== "Unverified" && (
            <>
              <button
                onClick={() => setModals(m => ({ ...m, report: true }))}
                style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, background: "white", border: `1px solid ${C.border}`, borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
              >
                <Share2 size={15} /> Share Report
              </button>
              <button
                onClick={() => setModals(m => ({ ...m, insurance: true }))}
                style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, background: "white", border: `1px solid ${C.border}`, borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
              >
                <Shield size={15} /> Insurance Report
              </button>
              {!fsboRecord?.isFsbo && (
                <button
                  onClick={() => setModals(m => ({ ...m, listing: true }))}
                  style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.green, background: "white", border: `1px solid ${COLORS.sageMid}`, borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
                >
                  List Your Home
                </button>
              )}
            </>
          )}
        </div>

        {/* ── KPI cards ───────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.875rem", marginBottom: "1.25rem" }}>
          {[
            {
              label: "Maintenance Due",
              icon:  <Wrench size={15} color={C.blue} />,
              value: String(atRiskWarnings.length),
              sub:   "Tasks",
              badge: atRiskWarnings.length > 0 ? { label: "● Overdue", color: C.red } : null,
            },
            {
              label: "Total Jobs",
              icon:  <CalendarDays size={15} color={C.blue} />,
              value: String(jobs.length),
              sub:   "Logged",
              badge: null,
            },
            {
              label: "Verified Records",
              icon:  <Shield size={15} color={C.blue} />,
              value: String(verifiedCount),
              sub:   `of ${jobs.length} jobs`,
              badge: null,
            },
            {
              label: "Value Added",
              icon:  <Activity size={15} color={C.blue} />,
              value: `$${(totalValue / 100).toLocaleString()}`,
              sub:   "Documented",
              badge: null,
            },
            {
              label: "Market Value",
              icon:  <span style={{ fontFamily: FONTS.sans, fontSize: "0.9rem", color: C.blue, fontWeight: 700 }}>$</span>,
              value: estimatedHomeDollars ? `$${Math.round(estimatedHomeDollars / 1_000)}K` : "—",
              sub:   "Estimated",
              badge: null,
            },
          ].map(stat => (
            <Card key={stat.label} style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, lineHeight: 1.3 }}>{stat.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {stat.icon}
                </div>
              </div>
              <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.625rem", color: C.text, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginTop: "0.25rem" }}>{stat.sub}</div>
              {stat.badge && (
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: stat.badge.color, fontWeight: 600, marginTop: "0.375rem" }}>
                  {stat.badge.label}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ── Three panels ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>

          {/* Upcoming Maintenance */}
          <Card style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>Upcoming Maintenance</h3>
              <button onClick={() => navigate("/maintenance")} style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              {recurringServices.length === 0 ? (
                <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginBottom: "0.5rem" }}>No scheduled services yet.</p>
                  <button
                    onClick={() => setModals(m => ({ ...m, addService: true }))}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}
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
                    <div key={svc.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: badge.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}
                        </div>
                        <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>
                          Due {due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600, color: badge.color, flexShrink: 0 }}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: "1rem 1.25rem", borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => navigate("/maintenance")}
                style={{ width: "100%", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.625rem", cursor: "pointer" }}
              >
                View Maintenance Plan
              </button>
            </div>
          </Card>

          {/* Recent Activity */}
          <Card style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>Recent Activity</h3>
              <button
                onClick={() => { setTab("jobs"); document.getElementById("property-tabs")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
              >
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              {recentActivity.length === 0 ? (
                <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginBottom: "0.5rem" }}>No activity yet. Log your first job!</p>
                  <button
                    onClick={() => setModals(m => ({ ...m, logJob: true }))}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}
                  >
                    + Log a job
                  </button>
                </div>
              ) : (
                recentActivity.map(job => (
                  <div key={job.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.75rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: job.status === "verified" ? C.greenBg : C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Wrench size={13} color={job.status === "verified" ? C.green : C.blue} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, fontWeight: 500 }}>{job.serviceType}</div>
                      <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>
                        {job.isDiy ? "DIY" : (job.contractorName ?? "Unknown contractor")}
                      </div>
                    </div>
                    <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, flexShrink: 0 }}>
                      {relativeTime(Number(job.createdAt))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Connected Devices */}
          <Card style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>Connected Devices</h3>
              <button
                onClick={() => navigate("/sensors")}
                style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: "none", cursor: "pointer" }}
              >
                Manage
              </button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.25rem", gap: "0.75rem" }}>
              <Cpu size={32} color={C.muted} />
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", margin: 0 }}>
                No devices connected yet.
              </p>
              <button
                onClick={() => navigate("/sensors")}
                style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
              >
                View All Devices
              </button>
            </div>
          </Card>
        </div>

        {/* ── CTA banner ──────────────────────────────────────────────────────── */}
        <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "0.75rem", padding: "1.5rem 2rem", display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <span style={{ fontSize: "2.25rem", lineHeight: 1 }}>🪖</span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.0625rem", color: C.text, marginBottom: "0.25rem" }}>
              Need help with your home?
            </div>
            <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>
              Get matched with trusted local pros or request a quote.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexShrink: 0 }}>
            <button
              onClick={() => navigate("/contractors")}
              style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: "white", background: C.blue, border: "none", borderRadius: "0.5rem", padding: "0.625rem 1.25rem", cursor: "pointer" }}
            >
              Find Contractors
            </button>
            <button
              onClick={() => setModals(m => ({ ...m, quote: true }))}
              style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.blue, background: "white", border: `1px solid ${C.border}`, borderRadius: "0.5rem", padding: "0.625rem 1.25rem", cursor: "pointer" }}
            >
              Request a Quote
            </button>
          </div>
        </div>

        {/* ── Property details tabs ────────────────────────────────────────────── */}
        <div id="property-tabs">
          <h2 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.125rem", color: C.text, marginBottom: "1rem" }}>
            Property Details
          </h2>
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: "1.5rem" }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ padding: "0.625rem 1.25rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? C.blue : C.muted, background: "none", border: "none", borderBottom: tab === t.key ? `2px solid ${C.blue}` : "2px solid transparent", marginBottom: "-1px", cursor: "pointer", transition: "color 0.15s" }}
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
