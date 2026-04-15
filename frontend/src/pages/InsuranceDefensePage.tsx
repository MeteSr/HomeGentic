/**
 * Insurance Defense Mode (8.4.1–8.4.2)
 *
 * Generates a print-ready report of all insurance-relevant maintenance records.
 * Designed for Florida homeowners submitting documentation to insurers.
 * Use browser Print → Save as PDF to export.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, ShieldCheck, CheckCircle, Clock, Zap, ChevronDown, ChevronUp, Sparkles, Wifi } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService, Property } from "@/services/property";
import { jobService, Job, INSURANCE_SERVICE_TYPES } from "@/services/job";
import { sensorService, type SensorDevice, type SensorEvent } from "@/services/sensor";
import { paymentService, type PlanTier } from "@/services/payment";
import { billService, type BillRecord } from "@/services/billService";
import { UpgradeGate } from "@/components/UpgradeGate";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import {
  estimateInsurerDiscount,
  type InsurerDiscountResult,
  type DiscountCategory,
} from "@/services/insurerDiscountService";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

const SYSTEM_RELEVANCE: Record<string, string> = {
  Roofing:    "Roof condition and replacement history",
  HVAC:       "Heating, ventilation & air conditioning service history",
  Electrical: "Electrical system upgrades and inspections",
  Plumbing:   "Plumbing repairs and water damage prevention",
  Foundation: "Structural integrity and foundation work",
};

export default function InsuranceDefensePage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showSuccessPrompt, setShowSuccessPrompt] = useState(false);
  const [successSubmitted,  setSuccessSubmitted]  = useState(false);
  const [savingsInput,      setSavingsInput]       = useState("");
  const [userTier, setUserTier] = useState<PlanTier>("Free");

  // ── Sensor discount estimator state ──────────────────────────────────────
  const [sensorDevices,    setSensorDevices]    = useState<SensorDevice[]>([]);
  const [discountResult,   setDiscountResult]   = useState<InsurerDiscountResult | null>(null);
  const [discountLoading,  setDiscountLoading]  = useState(false);
  const [discountError,    setDiscountError]    = useState<string | null>(null);
  const [discountExpanded, setDiscountExpanded] = useState(true);
  // Story 5 — bill anomalies for print report
  const [billAnomalies,    setBillAnomalies]    = useState<BillRecord[]>([]);

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
    Promise.all([
      propertyService.getMyProperties(),
      jobService.getAll(),
    ]).then(([props, js]) => {
      setProperties(props);
      setJobs(js);
      // Load sensor devices for all properties
      Promise.all(props.map((p) => sensorService.getDevicesForProperty(String(p.id))))
        .then((perProp) => setSensorDevices(perProp.flat()))
        .catch(() => {});
      // Story 5 — load water bill anomalies for print report
      Promise.all(props.map((p) => billService.getBillsForProperty(String(p.id)).catch(() => [] as BillRecord[])))
        .then((perProp) => {
          const anomalies = perProp.flat().filter((b) => b.anomalyFlag && b.billType === "Water");
          setBillAnomalies(anomalies);
        })
        .catch(() => {});
    }).finally(() => setLoading(false));
  }, []);

  async function handleEstimateDiscount() {
    if (properties.length === 0) return;
    setDiscountLoading(true);
    setDiscountError(null);
    try {
      // Gather critical event count across all properties
      const eventsPerProp = await Promise.all(
        properties.map((p) =>
          sensorService.getEventsForProperty(String(p.id), 200).catch(() => [] as SensorEvent[])
        )
      );
      const criticalEventCount = eventsPerProp.flat()
        .filter((e) => e.severity === "Critical" && Date.now() - e.timestamp < 90 * 24 * 60 * 60 * 1000)
        .length;

      const firstProp = properties[0];
      const result = await estimateInsurerDiscount({
        state:   firstProp.state ?? "FL",
        zipCode: firstProp.zipCode ?? "",
        properties: properties.map((p) => ({
          address:           p.address,
          yearBuilt:         Number(p.yearBuilt),
          verificationLevel: String(p.verificationLevel),
        })),
        devices: sensorDevices.map((d) => ({ source: d.source, name: d.name })),
        criticalEventCount,
        verifiedJobTypes: [...new Set(
          insuranceJobs.filter((j) => j.status === "verified").map((j) => j.serviceType)
        )],
        totalVerifiedJobs: insuranceJobs.filter((j) => j.status === "verified").length,
      });
      setDiscountResult(result);
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : "Failed to estimate discount");
    } finally {
      setDiscountLoading(false);
    }
  }

  const insuranceJobs = jobs.filter((j) => INSURANCE_SERVICE_TYPES.has(j.serviceType));
  const verifiedCount = insuranceJobs.filter((j) => j.status === "verified").length;
  const totalValue    = insuranceJobs.reduce((s, j) => s + j.amount, 0);
  const generatedAt   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Group by property
  const byProperty = properties.map((p) => ({
    property: p,
    jobs: insuranceJobs
      .filter((j) => j.propertyId === String(p.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  })).filter((g) => g.jobs.length > 0);

  if (userTier === "Free") {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
          <UpgradeGate
            feature="Insurance Defense Mode"
            description="Generate a print-ready insurance report from your verified maintenance records — roof, HVAC, electrical, and more."
            icon="🛡️"
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Screen-only controls */}
      <div className="no-print" style={{ maxWidth: "56rem", margin: "0 auto", padding: "1.5rem 1.5rem 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <button
            onClick={() => navigate("/dashboard")}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "none", border: "none", cursor: "pointer", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.inkLight }}
          >
            <ArrowLeft size={13} /> Dashboard
          </button>
          <Button icon={<Printer size={14} />} onClick={() => { window.print(); setShowSuccessPrompt(true); }}>
            Print / Export PDF
          </Button>
        </div>
        <div style={{ padding: "0.75rem 1rem", background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <ShieldCheck size={14} color={UI.sage} />
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.sage }}>
            This report is formatted for insurer submission. Use <strong>Print → Save as PDF</strong> to generate a file.
            Florida insurers commonly require Roofing, HVAC, Electrical, and Plumbing records.
          </p>
        </div>
      </div>

      {/* ── Smart Home Discount Estimator (screen-only) ─────────────────────── */}
      <div className="no-print" style={{ maxWidth: "56rem", margin: "0 auto", padding: "0 1.5rem 1.5rem" }}>
        <div style={{ border: `1px solid ${COLORS.sky}`, background: "#EEF6FB" }}>
          {/* Header row */}
          <button
            onClick={() => setDiscountExpanded((x) => !x)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.875rem 1.25rem", background: "none", border: "none", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <Zap size={15} color={COLORS.sky} />
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, fontWeight: 600 }}>
                Smart Home Discount Estimator
              </span>
              {discountResult && (
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", background: COLORS.sky, color: COLORS.plum, padding: "0.2rem 0.6rem" }}>
                  {discountResult.discountRangeMin}–{discountResult.discountRangeMax}% est. savings
                </span>
              )}
            </div>
            {discountExpanded ? <ChevronUp size={14} color={COLORS.plumMid} /> : <ChevronDown size={14} color={COLORS.plumMid} />}
          </button>

          {discountExpanded && (
            <div style={{ borderTop: `1px solid ${COLORS.sky}`, padding: "1.25rem" }}>
              {/* Device summary + CTA */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.375rem" }}>
                    Connected devices detected
                  </p>
                  {sensorDevices.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: COLORS.plumMid, fontFamily: FONTS.sans }}>
                      No smart devices registered.{" "}
                      <button onClick={() => navigate("/sensors")} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.sage, fontFamily: FONTS.mono, fontSize: "0.7rem", textDecoration: "underline" }}>
                        Add sensors →
                      </button>
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                      {sensorDevices.map((d) => (
                        <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", border: `1px solid ${COLORS.sky}`, background: "#D6EBF6", padding: "0.2rem 0.6rem", fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.plum }}>
                          <Wifi size={9} /> {d.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleEstimateDiscount}
                  disabled={discountLoading || properties.length === 0}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.4rem",
                    background: COLORS.plum, color: COLORS.white, border: "none",
                    fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
                    padding: "0.625rem 1.125rem", cursor: discountLoading ? "wait" : "pointer",
                    opacity: (discountLoading || properties.length === 0) ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Sparkles size={12} />
                  {discountLoading ? "Analysing…" : discountResult ? "Re-analyse" : "Estimate My Discount"}
                </button>
              </div>

              {discountError && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: COLORS.rust, marginBottom: "1rem" }}>
                  {discountError}
                </p>
              )}

              {discountResult && (
                <>
                  {/* Discount range banner */}
                  <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "1rem 1.25rem", background: COLORS.white, border: `1px solid ${COLORS.sky}`, marginBottom: "1rem", flexWrap: "wrap" }}>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, color: COLORS.plum }}>
                        {discountResult.discountRangeMin}–{discountResult.discountRangeMax}%
                      </p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>Estimated Annual Discount</p>
                    </div>
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      <p style={{ fontSize: "0.8rem", fontFamily: FONTS.sans, color: COLORS.plum, lineHeight: 1.5 }}>
                        Based on your {sensorDevices.length} connected device{sensorDevices.length !== 1 ? "s" : ""} and {insuranceJobs.filter((j) => j.status === "verified").length} blockchain-verified maintenance records.
                      </p>
                    </div>
                  </div>

                  {/* Qualifying categories */}
                  <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.5rem" }}>
                    Discount Categories
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1rem" }}>
                    {discountResult.qualifyingCategories.map((cat: DiscountCategory) => {
                      const color = cat.status === "qualifying" ? COLORS.sage
                                  : cat.status === "potential"  ? "#D97706"
                                  : COLORS.plumMid;
                      const bg    = cat.status === "qualifying" ? COLORS.sageLight
                                  : cat.status === "potential"  ? "#FEF3C7"
                                  : COLORS.white;
                      return (
                        <div key={cat.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 0.875rem", border: `1px solid ${cat.status === "qualifying" ? COLORS.sageMid : COLORS.rule}`, background: bg, flexWrap: "wrap", gap: "0.375rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                            {cat.status === "qualifying"
                              ? <CheckCircle size={12} color={COLORS.sage} />
                              : cat.status === "potential"
                              ? <Clock size={12} color="#D97706" />
                              : <Clock size={12} color={COLORS.plumMid} />}
                            <div>
                              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 500, color: COLORS.plum }}>{cat.name}</p>
                              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: COLORS.plumMid }}>{cat.basis}</p>
                            </div>
                          </div>
                          <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 600, color, whiteSpace: "nowrap" }}>
                            {cat.discountRange}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Insurer programs */}
                  <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.5rem" }}>
                    Programs You May Qualify For
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "0.625rem", marginBottom: "1rem" }}>
                    {discountResult.programs.map((prog) => (
                      <div key={prog.insurer + prog.programName} style={{ border: `1px solid ${COLORS.rule}`, padding: "0.875rem", background: COLORS.white }}>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.2rem" }}>{prog.insurer}</p>
                        <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 600, color: COLORS.plum, marginBottom: "0.2rem" }}>{prog.programName}</p>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.sage, marginBottom: "0.375rem" }}>{prog.estimatedDiscount}</p>
                        <p style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", color: COLORS.plumMid, lineHeight: 1.4 }}>{prog.notes}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.5rem" }}>
                    Recommended Next Steps
                  </p>
                  <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
                    {discountResult.recommendations.map((rec, i) => (
                      <li key={i} style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plum, lineHeight: 1.5, marginBottom: "0.375rem" }}>
                        {rec}
                      </li>
                    ))}
                  </ol>

                  <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: COLORS.plumMid, marginTop: "0.75rem" }}>
                    Estimates generated by AI. Verify discount eligibility directly with your insurer. Generated {new Date(discountResult.generatedAt).toLocaleString()}.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Printable report body */}
      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "0 1.5rem 4rem" }}>

        {/* Report header */}
        <div style={{ borderTop: `3px solid ${UI.ink}`, borderBottom: `1px solid ${UI.rule}`, padding: "1.5rem 0", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.25rem" }}>
                HomeGentic — Insurance Defense Report
              </p>
              <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
                Maintenance &amp; Inspection History
              </h1>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
                Generated {generatedAt} · Blockchain-verified records
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", border: `1px solid ${UI.sage}`, background: COLORS.sageLight }}>
              <ShieldCheck size={18} color={UI.sage} />
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.sage }}>Insurance Defense</p>
                <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem" }}>{verifiedCount} Verified Records</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}><div className="spinner-lg" /></div>
        ) : insuranceJobs.length === 0 ? (
          <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
            <ShieldCheck size={36} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No insurance-relevant records yet</p>
            <p style={{ fontSize: "0.875rem", color: UI.inkLight, maxWidth: "28rem", margin: "0 auto 1.5rem" }}>
              Log jobs for Roofing, HVAC, Electrical, Plumbing, or Foundation to build your insurance defense record.
            </p>
            <Button onClick={() => navigate("/jobs/new")}>Log a Job</Button>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div style={{ display: "flex", gap: "0", marginBottom: "2rem", border: `1px solid ${UI.rule}` }}>
              {[
                { label: "Insurance-Relevant Records", value: String(insuranceJobs.length) },
                { label: "Blockchain Verified",        value: String(verifiedCount) },
                { label: "Total Documented Value",     value: fmt(totalValue) },
                { label: "Properties Covered",         value: String(byProperty.length) },
              ].map((stat, i, arr) => (
                <div key={stat.label} style={{ flex: 1, padding: "1.25rem", borderRight: i < arr.length - 1 ? `1px solid ${UI.rule}` : "none", textAlign: "center", background: COLORS.white }}>
                  <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, marginBottom: "0.25rem" }}>{stat.value}</p>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* What insurers look for */}
            <div style={{ marginBottom: "2rem", padding: "1.25rem", border: `1px solid ${UI.rule}`, background: UI.paper }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
                Systems Covered in This Report
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {Array.from(INSURANCE_SERVICE_TYPES).map((type) => {
                  const hasRecord = insuranceJobs.some((j) => j.serviceType === type);
                  return (
                    <div key={type} style={{
                      display: "flex", alignItems: "center", gap: "0.375rem",
                      padding: "0.3rem 0.75rem", border: `1px solid ${hasRecord ? UI.sage : UI.rule}`,
                      background: hasRecord ? COLORS.sageLight : COLORS.white,
                    }}>
                      {hasRecord
                        ? <CheckCircle size={11} color={UI.sage} />
                        : <Clock size={11} color={UI.inkLight} />}
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: hasRecord ? UI.sage : UI.inkLight }}>
                        {type}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Job records by property */}
            {byProperty.map(({ property, jobs: pJobs }) => (
              <div key={String(property.id)} style={{ marginBottom: "2.5rem" }}>
                {/* Property header */}
                <div style={{ background: UI.ink, color: UI.paper, padding: "0.875rem 1.25rem", marginBottom: "0" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(244,241,235,0.5)", marginBottom: "0.2rem" }}>
                    Property
                  </p>
                  <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem" }}>
                    {property.address}
                  </p>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: "rgba(244,241,235,0.6)" }}>
                    {property.city}, {property.state} {property.zipCode} · {property.verificationLevel} · Built {String(property.yearBuilt)}
                  </p>
                </div>

                {/* Job table */}
                <div style={{ border: `1px solid ${UI.rule}`, borderTop: "none" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "0.5rem 1rem", background: UI.paper, borderBottom: `1px solid ${UI.rule}` }}>
                    {["System / Service", "Date", "Contractor", "Amount", "Status"].map((h) => (
                      <div key={h} style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>{h}</div>
                    ))}
                  </div>

                  {pJobs.map((job, i) => {
                    const isVerified = job.status === "verified";
                    return (
                      <div key={job.id} style={{
                        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                        padding: "0.875rem 1rem", alignItems: "center",
                        borderBottom: i < pJobs.length - 1 ? `1px solid ${UI.rule}` : "none",
                        background: COLORS.white,
                        borderLeft: `3px solid ${isVerified ? UI.sage : UI.rule}`,
                      }}>
                        <div>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.1rem" }}>{job.serviceType}</p>
                          {job.description && (
                            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>{job.description}</p>
                          )}
                          {job.permitNumber && (
                            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>Permit: {job.permitNumber}</p>
                          )}
                          {SYSTEM_RELEVANCE[job.serviceType] && (
                            <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: UI.inkLight, marginTop: "0.15rem" }}>
                              {SYSTEM_RELEVANCE[job.serviceType]}
                            </p>
                          )}
                        </div>
                        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem" }}>{fmtDate(job.date)}</div>
                        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem" }}>
                          {job.isDiy ? "DIY — Homeowner" : (job.contractorName ?? "—")}
                        </div>
                        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem" }}>{fmt(job.amount)}</div>
                        <div>
                          {isVerified ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <CheckCircle size={11} color={UI.sage} />
                              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.sage }}>ICP Verified</span>
                            </div>
                          ) : (
                            <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>Self-reported</span>
                          )}
                          {job.warrantyMonths && job.warrantyMonths > 0 && (
                            <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: COLORS.plumMid, marginTop: "0.15rem" }}>
                              {job.warrantyMonths}mo warranty
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Connected device inventory (printed for insurer) */}
            {sensorDevices.length > 0 && (
              <div style={{ marginBottom: "2rem", border: `1px solid ${UI.rule}` }}>
                <div style={{ background: UI.ink, color: UI.paper, padding: "0.75rem 1.25rem" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Connected Smart-Home Devices
                  </p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 0, background: UI.paper }}>
                  {sensorDevices.map((d, i) => (
                    <div key={d.id} style={{ padding: "0.75rem 1rem", borderRight: "1px solid #e5e5e5", borderBottom: "1px solid #e5e5e5" }}>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>{d.source}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.ink }}>{d.name}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: d.isActive ? UI.sage : UI.inkLight }}>
                        {d.isActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Story 5 — Recent Water Bill Anomalies */}
            {billAnomalies.length > 0 && (
              <div style={{ marginBottom: "2rem", border: `1px solid ${UI.rule}` }}>
                <div style={{ background: UI.ink, color: UI.paper, padding: "0.75rem 1.25rem" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Recent Water Usage Anomalies — Potential Leak Documentation
                  </p>
                </div>
                <div style={{ padding: "0.75rem 1.25rem", background: UI.paper }}>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: UI.inkLight, marginBottom: "0.75rem", lineHeight: 1.6 }}>
                    The following water bills were flagged as significantly above baseline usage. Unusual water consumption may indicate a slow leak. These records are provided to support any related plumbing claim or preventive documentation.
                  </p>
                  {billAnomalies.map((b) => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.625rem 0", borderTop: `1px solid ${UI.rule}` }}>
                      <div>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.ink }}>{b.provider} · {b.periodStart} → {b.periodEnd}</p>
                        <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: UI.inkLight, marginTop: "0.2rem" }}>{b.anomalyReason ?? "Bill above 3-month average"}</p>
                      </div>
                      <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.875rem", color: UI.ink }}>${(b.amountCents / 100).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer disclaimer */}
            <div style={{ borderTop: `1px solid ${UI.rule}`, paddingTop: "1.5rem", marginTop: "1rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: UI.inkLight, lineHeight: 1.7, maxWidth: "44rem" }}>
                <strong>Verification note:</strong> Records marked "ICP Verified" have been digitally signed by both the homeowner and contractor on the Internet Computer blockchain.
                The immutable record includes a cryptographic timestamp and dual-party signature that cannot be altered retroactively.
                Self-reported records have not been independently verified but remain on-chain as homeowner-attested entries.
                HomeGentic Inc. does not guarantee insurer acceptance of this documentation. Contact your insurer for submission requirements.
              </p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, marginTop: "0.75rem" }}>
                Report ID: HFX-{Date.now().toString(36).toUpperCase()} · Generated {generatedAt} · homegentic.app
              </p>
            </div>
          </>
        )}
      </div>

      {/* 8.4.5 — Insurance success story prompt */}
      {showSuccessPrompt && !successSubmitted && (
        <div className="no-print" style={{ maxWidth: "56rem", margin: "1.5rem auto", padding: "0 1.5rem" }}>
          <div style={{ border: `1px solid ${COLORS.sageMid}`, background: COLORS.sageLight, padding: "1.25rem 1.5rem" }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.5rem" }}>
              Did this help with your insurer?
            </p>
            <p style={{ fontSize: "0.875rem", color: UI.ink, marginBottom: "1rem", fontWeight: 300, lineHeight: 1.6 }}>
              Tell us what you saved — your story helps other homeowners know what's possible.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={savingsInput}
                onChange={(e) => setSavingsInput(e.target.value)}
                placeholder="e.g. insurer accepted all records, saved $1,200/yr"
                style={{ flex: 1, minWidth: "200px", padding: "0.5rem 0.75rem", fontFamily: UI.mono, fontSize: "0.7rem", border: `1px solid ${COLORS.sageMid}`, background: COLORS.white, outline: "none" }}
              />
              <button
                onClick={() => {
                  if (savingsInput.trim()) {
                    localStorage.setItem("homegentic_insurance_success", JSON.stringify({ text: savingsInput, ts: Date.now() }));
                  }
                  setSuccessSubmitted(true);
                }}
                style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: UI.sage, color: COLORS.white, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Share Story
              </button>
              <button
                onClick={() => setShowSuccessPrompt(false)}
                style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 0.875rem", background: "none", color: UI.inkLight, border: `1px solid ${UI.rule}`, cursor: "pointer" }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
      {showSuccessPrompt && successSubmitted && (
        <div className="no-print" style={{ maxWidth: "56rem", margin: "1.5rem auto", padding: "0 1.5rem" }}>
          <div style={{ border: `1px solid ${COLORS.sageMid}`, background: COLORS.sageLight, padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <CheckCircle size={14} color={UI.sage} />
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.sage }}>Thank you — your story helps other HomeGentic users know what's possible.</p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </Layout>
  );
}
