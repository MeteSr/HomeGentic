/**
 * Insurance Defense Mode (8.4.1–8.4.2)
 *
 * Generates a print-ready report of all insurance-relevant maintenance records.
 * Designed for Florida homeowners submitting documentation to insurers.
 * Use browser Print → Save as PDF to export.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, ShieldCheck, CheckCircle, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService, Property } from "@/services/property";
import { jobService, Job, INSURANCE_SERVICE_TYPES } from "@/services/job";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
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

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
    Promise.all([
      propertyService.getMyProperties(),
      jobService.getMyJobs(),
    ]).then(([props, js]) => {
      setProperties(props);
      setJobs(js);
    }).finally(() => setLoading(false));
  }, []);

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
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "none", border: "none", cursor: "pointer", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight }}
          >
            <ArrowLeft size={13} /> Dashboard
          </button>
          <Button icon={<Printer size={14} />} onClick={() => { window.print(); setShowSuccessPrompt(true); }}>
            Print / Export PDF
          </Button>
        </div>
        <div style={{ padding: "0.75rem 1rem", background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <ShieldCheck size={14} color={S.sage} />
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.sage }}>
            This report is formatted for insurer submission. Use <strong>Print → Save as PDF</strong> to generate a file.
            Florida insurers commonly require Roofing, HVAC, Electrical, and Plumbing records.
          </p>
        </div>
      </div>

      {/* Printable report body */}
      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "0 1.5rem 4rem" }}>

        {/* Report header */}
        <div style={{ borderTop: `3px solid ${S.ink}`, borderBottom: `1px solid ${S.rule}`, padding: "1.5rem 0", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>
                HomeFax — Insurance Defense Report
              </p>
              <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
                Maintenance &amp; Inspection History
              </h1>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
                Generated {generatedAt} · Blockchain-verified records
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", border: `1px solid ${S.sage}`, background: COLORS.sageLight }}>
              <ShieldCheck size={18} color={S.sage} />
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage }}>Insurance Defense</p>
                <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem" }}>{verifiedCount} Verified Records</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}><div className="spinner-lg" /></div>
        ) : insuranceJobs.length === 0 ? (
          <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
            <ShieldCheck size={36} color={S.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No insurance-relevant records yet</p>
            <p style={{ fontSize: "0.875rem", color: S.inkLight, maxWidth: "28rem", margin: "0 auto 1.5rem" }}>
              Log jobs for Roofing, HVAC, Electrical, Plumbing, or Foundation to build your insurance defense record.
            </p>
            <Button onClick={() => navigate("/jobs/new")}>Log a Job</Button>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div style={{ display: "flex", gap: "0", marginBottom: "2rem", border: `1px solid ${S.rule}` }}>
              {[
                { label: "Insurance-Relevant Records", value: String(insuranceJobs.length) },
                { label: "Blockchain Verified",        value: String(verifiedCount) },
                { label: "Total Documented Value",     value: fmt(totalValue) },
                { label: "Properties Covered",         value: String(byProperty.length) },
              ].map((stat, i, arr) => (
                <div key={stat.label} style={{ flex: 1, padding: "1.25rem", borderRight: i < arr.length - 1 ? `1px solid ${S.rule}` : "none", textAlign: "center", background: COLORS.white }}>
                  <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, marginBottom: "0.25rem" }}>{stat.value}</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* What insurers look for */}
            <div style={{ marginBottom: "2rem", padding: "1.25rem", border: `1px solid ${S.rule}`, background: S.paper }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
                Systems Covered in This Report
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {Array.from(INSURANCE_SERVICE_TYPES).map((type) => {
                  const hasRecord = insuranceJobs.some((j) => j.serviceType === type);
                  return (
                    <div key={type} style={{
                      display: "flex", alignItems: "center", gap: "0.375rem",
                      padding: "0.3rem 0.75rem", border: `1px solid ${hasRecord ? S.sage : S.rule}`,
                      background: hasRecord ? COLORS.sageLight : COLORS.white,
                    }}>
                      {hasRecord
                        ? <CheckCircle size={11} color={S.sage} />
                        : <Clock size={11} color={S.inkLight} />}
                      <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: hasRecord ? S.sage : S.inkLight }}>
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
                <div style={{ background: S.ink, color: S.paper, padding: "0.875rem 1.25rem", marginBottom: "0" }}>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(244,241,235,0.5)", marginBottom: "0.2rem" }}>
                    Property
                  </p>
                  <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem" }}>
                    {property.address}
                  </p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: "rgba(244,241,235,0.6)" }}>
                    {property.city}, {property.state} {property.zipCode} · {property.verificationLevel} · Built {String(property.yearBuilt)}
                  </p>
                </div>

                {/* Job table */}
                <div style={{ border: `1px solid ${S.rule}`, borderTop: "none" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "0.5rem 1rem", background: S.paper, borderBottom: `1px solid ${S.rule}` }}>
                    {["System / Service", "Date", "Contractor", "Amount", "Status"].map((h) => (
                      <div key={h} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{h}</div>
                    ))}
                  </div>

                  {pJobs.map((job, i) => {
                    const isVerified = job.status === "verified";
                    return (
                      <div key={job.id} style={{
                        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                        padding: "0.875rem 1rem", alignItems: "center",
                        borderBottom: i < pJobs.length - 1 ? `1px solid ${S.rule}` : "none",
                        background: COLORS.white,
                        borderLeft: `3px solid ${isVerified ? S.sage : S.rule}`,
                      }}>
                        <div>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.1rem" }}>{job.serviceType}</p>
                          {job.title && job.title !== job.serviceType && (
                            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>{job.title}</p>
                          )}
                          {job.permitNumber && (
                            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>Permit: {job.permitNumber}</p>
                          )}
                          {SYSTEM_RELEVANCE[job.serviceType] && (
                            <p style={{ fontFamily: S.mono, fontSize: "0.5rem", color: S.inkLight, marginTop: "0.15rem" }}>
                              {SYSTEM_RELEVANCE[job.serviceType]}
                            </p>
                          )}
                        </div>
                        <div style={{ fontFamily: S.mono, fontSize: "0.65rem" }}>{fmtDate(job.date)}</div>
                        <div style={{ fontFamily: S.mono, fontSize: "0.65rem" }}>
                          {job.isDiy ? "DIY — Homeowner" : (job.contractorName ?? "—")}
                        </div>
                        <div style={{ fontFamily: S.mono, fontSize: "0.65rem" }}>{fmt(job.amount)}</div>
                        <div>
                          {isVerified ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <CheckCircle size={11} color={S.sage} />
                              <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.sage }}>ICP Verified</span>
                            </div>
                          ) : (
                            <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>Self-reported</span>
                          )}
                          {job.warrantyMonths && job.warrantyMonths > 0 && (
                            <p style={{ fontFamily: S.mono, fontSize: "0.5rem", color: COLORS.plumMid, marginTop: "0.15rem" }}>
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

            {/* Footer disclaimer */}
            <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "1.5rem", marginTop: "1rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.7, maxWidth: "44rem" }}>
                <strong>Verification note:</strong> Records marked "ICP Verified" have been digitally signed by both the homeowner and contractor on the Internet Computer blockchain.
                The immutable record includes a cryptographic timestamp and dual-party signature that cannot be altered retroactively.
                Self-reported records have not been independently verified but remain on-chain as homeowner-attested entries.
                HomeFax Inc. does not guarantee insurer acceptance of this documentation. Contact your insurer for submission requirements.
              </p>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.75rem" }}>
                Report ID: HFX-{Date.now().toString(36).toUpperCase()} · Generated {generatedAt} · homefax.app
              </p>
            </div>
          </>
        )}
      </div>

      {/* 8.4.5 — Insurance success story prompt */}
      {showSuccessPrompt && !successSubmitted && (
        <div className="no-print" style={{ maxWidth: "56rem", margin: "1.5rem auto", padding: "0 1.5rem" }}>
          <div style={{ border: `1px solid ${COLORS.sageMid}`, background: COLORS.sageLight, padding: "1.25rem 1.5rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
              Did this help with your insurer?
            </p>
            <p style={{ fontSize: "0.875rem", color: S.ink, marginBottom: "1rem", fontWeight: 300, lineHeight: 1.6 }}>
              Tell us what you saved — your story helps other homeowners know what's possible.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={savingsInput}
                onChange={(e) => setSavingsInput(e.target.value)}
                placeholder="e.g. insurer accepted all records, saved $1,200/yr"
                style={{ flex: 1, minWidth: "200px", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.7rem", border: `1px solid ${COLORS.sageMid}`, background: COLORS.white, outline: "none" }}
              />
              <button
                onClick={() => {
                  if (savingsInput.trim()) {
                    localStorage.setItem("homefax_insurance_success", JSON.stringify({ text: savingsInput, ts: Date.now() }));
                  }
                  setSuccessSubmitted(true);
                }}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: S.sage, color: COLORS.white, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Share Story
              </button>
              <button
                onClick={() => setShowSuccessPrompt(false)}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 0.875rem", background: "none", color: S.inkLight, border: `1px solid ${S.rule}`, cursor: "pointer" }}
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
            <CheckCircle size={14} color={S.sage} />
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.sage }}>Thank you — your story helps other HomeFax users know what's possible.</p>
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
