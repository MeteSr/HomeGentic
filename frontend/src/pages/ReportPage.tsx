/**
 * Public HomeGentic Report — /report/:token
 *
 * Accessible without authentication. Renders a print-ready property history
 * report. Use browser Print → Save as PDF to generate a PDF copy.
 */

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Shield, CheckCircle, Wrench, FileText, Printer, AlertTriangle, XCircle } from "lucide-react";
import { reportService, ReportSnapshot, ShareLink, JobInput, disclosureFromParams } from "@/services/report";
import { agentProfileService } from "@/services/agentProfile";
import { premiumEstimate, getScoreGrade } from "@/services/scoreService";
import { DocumentedValueSection } from "@/components/DocumentedValueSection";
import { COLORS, FONTS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const VERIFICATION_CONFIG: Record<string, { color: string; bg: string; label: string; description: string }> = {
  Premium:    { color: UI.sage,      bg: COLORS.sageLight, label: "HomeGentic Premium Verified", description: "Comprehensive blockchain-verified maintenance history" },
  Basic:      { color: COLORS.plum, bg: COLORS.sky,       label: "HomeGentic Basic Verified",   description: "Key maintenance records blockchain-verified" },
  Unverified: { color: UI.inkLight,  bg: UI.paper,          label: "Unverified",               description: "Maintenance history self-reported by homeowner" },
};

const SERVICE_ICONS: Record<string, string> = {
  HVAC: "❄️", Roofing: "🏠", Plumbing: "🔧", Electrical: "⚡",
  Painting: "🖌️", Flooring: "🪵", Windows: "🪟", Landscaping: "🌿",
  Foundation: "🏗️", Insulation: "🧱", Drywall: "🔨", Solar: "☀️",
  Kitchen: "🍳", Bathroom: "🚿", Other: "🔩",
};

function fmt(cents: number): string { return `$${(cents / 100).toLocaleString()}`; }

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${d}, ${y}`;
}

function contractorLabel(job: JobInput): string {
  return job.isDiy ? "DIY — Homeowner" : (job.contractorName ?? "Contractor");
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "1.25rem", border: `1px solid ${UI.rule}`, flex: 1 }}>
      <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: UI.ink }}>{value}</p>
      {sub && <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.sage, fontWeight: 700, marginTop: "0.125rem" }}>{sub}</p>}
      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginTop: "0.25rem" }}>{label}</p>
    </div>
  );
}

function ScoreArc({ score }: { score: number }) {
  const cx = 60, cy = 65, r = 46;
  const C = 2 * Math.PI * r;
  const arc = C * 0.75;
  const filled = arc * (score / 100);
  const color = score >= 88 ? COLORS.plumMid : score >= 75 ? COLORS.sage : score >= 50 ? COLORS.plumMid : COLORS.sage;
  const grade = score >= 88 ? "CERTIFIED" : score >= 75 ? "GREAT" : score >= 50 ? "GOOD" : "FAIR";
  return (
    <svg viewBox="0 0 120 112" style={{ width: "6.5rem", height: "auto", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={8}
        strokeDasharray={`${arc} ${C}`} strokeLinecap="butt" transform={`rotate(-225, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${filled.toFixed(2)} ${C}`} strokeLinecap="butt" transform={`rotate(-225, ${cx}, ${cy})`} />
      <text x={cx} y={cy - 3} textAnchor="middle" fontFamily={FONTS.serif}
        fontWeight="900" fontSize="26" fill={COLORS.white}>{score}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontFamily={FONTS.mono}
        fontSize="8" fill="rgba(244,241,235,0.40)" letterSpacing="1">/100</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontFamily={FONTS.mono}
        fontSize="7" fill={color} letterSpacing="2">{grade}</text>
    </svg>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", paddingBottom: "0.75rem", borderBottom: `1px solid ${UI.rule}`, marginBottom: "1.25rem" }}>
      {icon}
      <h2 style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight }}>{title}</h2>
    </div>
  );
}

type LoadState = "loading" | "loaded" | "expired" | "revoked" | "notfound" | "error";

export default function ReportPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams]          = useSearchParams();
  const disclosure              = disclosureFromParams(searchParams);
  const [state, setState]       = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [link, setLink]         = useState<ShareLink | null>(null);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!token) { setState("notfound"); return; }
    reportService.getReport(token).then(({ link, snapshot }) => {
      setLink(link); setSnapshot(snapshot); setState("loaded");
      // §17.4.4 — SEO: set document title + meta description for Google indexing
      document.title = `HomeGentic Report — ${snapshot.address}`;
      const meta = document.querySelector<HTMLMetaElement>("meta[name='description']")
        ?? (() => { const m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); return m; })();
      meta.content = `Verified maintenance history for ${snapshot.address}. ${snapshot.verifiedJobCount} verified job${snapshot.verifiedJobCount !== 1 ? "s" : ""}.`;
    }).catch((err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("expired"))       setState("expired");
      else if (msg.includes("revoked"))  setState("revoked");
      else if (msg.includes("not found")) setState("notfound");
      else { setError(err.message); setState("error"); }
    });
  }, [token]);

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: UI.paper }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  if (state !== "loaded" || !snapshot) {
    const configs = {
      expired:  { icon: <AlertTriangle size={40} color={UI.rust} />,   title: "HomeGentic report expired",   body: "This HomeGentic report has expired. The homeowner can upgrade to Pro to share a permanent link." },
      revoked:  { icon: <XCircle      size={40} color={UI.rust} />,    title: "Report link revoked",   body: "The homeowner has revoked access to this report." },
      notfound: { icon: <FileText     size={40} color={UI.inkLight} />, title: "Report not found",      body: "This link may be invalid or the report has been removed." },
      error:    { icon: <AlertTriangle size={40} color={UI.rust} />,   title: "Unable to load report", body: error },
    };
    const cfg = configs[state as keyof typeof configs] ?? configs.error;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: UI.paper, padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <div style={{ marginBottom: "1rem" }}>{cfg.icon}</div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: UI.ink, marginBottom: "0.5rem" }}>{cfg.title}</h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>{cfg.body}</p>
          <p style={{ marginTop: "2rem", fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
            Powered by <strong style={{ color: UI.ink }}>HomeGentic</strong> — blockchain-verified home history
          </p>
        </div>
      </div>
    );
  }

  const cfg          = VERIFICATION_CONFIG[snapshot.verificationLevel] ?? VERIFICATION_CONFIG.Unverified;
  const agentProfile = agentProfileService.fromParams(searchParams);
  const sortedJobs   = [...snapshot.jobs].sort((a, b) => b.date.localeCompare(a.date));

  // Certification: score ≥ 88 + 3 verified + 2 key systems
  const reportScore   = (() => {
    let s = 0;
    s += Math.min(snapshot.verifiedJobCount * 4, 40);
    s += Math.min(Math.floor(snapshot.totalAmountCents / 100 / 2500), 20);
    if (snapshot.verificationLevel === "Premium") s += 10;
    else if (snapshot.verificationLevel === "Basic") s += 5;
    s += Math.min(new Set(snapshot.jobs.map((j) => j.serviceType)).size * 4, 20);
    return Math.min(Math.round(s), 100);
  })();
  const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];
  const certifiedSystems = KEY_SYSTEMS.filter((sys) =>
    snapshot.jobs.some((j) => j.isVerified && j.serviceType === sys)
  ).length;
  const certified = reportScore >= 88 && snapshot.verifiedJobCount >= 3 && certifiedSystems >= 2;
  const premium   = premiumEstimate(reportScore);
  const jobsWithPermit    = disclosure.hidePermits ? [] : sortedJobs.filter((j) => j.permitNumber);
  const uniqueContractors = disclosure.hideContractors
    ? []
    : [...new Set(sortedJobs.filter((j) => !j.isDiy && j.contractorName).map((j) => j.contractorName as string))];

  // Apply disclosure masking to job cards
  const visibleJobs = sortedJobs.map((j) => ({
    ...j,
    amountCents:    disclosure.hideAmounts      ? 0             : j.amountCents,
    contractorName: disclosure.hideContractors  ? "Verified Contractor" : j.contractorName,
    description:    disclosure.hideDescriptions ? ""            : j.description,
    permitNumber:   disclosure.hidePermits      ? undefined     : j.permitNumber,
  }));

  return (
    <>
      {/* Print controls */}
      <div className="no-print" style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: UI.ink, color: COLORS.white, border: "none", padding: "0.625rem 1rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          <Printer size={14} /> Save as PDF
        </button>
      </div>

      {/* Report document */}
      <div id="homegentic-report" style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem 4rem", background: COLORS.white, minHeight: "100vh", fontFamily: UI.mono }}>

        {/* Cover */}
        <div style={{ background: UI.ink, padding: "2.5rem", color: COLORS.white, marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2rem", opacity: 0.7 }}>
            <Shield size={16} />
            <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>HOMEGENTIC</span>
            <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: COLORS.plumMid }}>Property History Report</span>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1.5rem", marginBottom: "1.75rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1.1, color: COLORS.white, marginBottom: "0.375rem" }}>
                {snapshot.address}
              </h1>
              <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: COLORS.plumMid, marginBottom: "1.25rem", letterSpacing: "0.06em" }}>
                {snapshot.city}, {snapshot.state} {snapshot.zipCode}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", justifyContent: "start", gap: "0.25rem 2rem" }}>
                {([
                  { label: "Type",  value: snapshot.propertyType },
                  { label: "Built", value: String(snapshot.yearBuilt) },
                  { label: "Size",  value: `${Number(snapshot.squareFeet).toLocaleString()} sq ft` },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", marginBottom: "0.1rem" }}>{label}</p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: COLORS.sageMid }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <ScoreArc score={reportScore} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${cfg.color}60`, padding: "0.5rem 1.25rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.bg }}>
              <Shield size={12} />{cfg.label}
            </div>
            {certified && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${COLORS.plumMid}`, padding: "0.5rem 1.25rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.butter, background: "rgba(201,168,76,0.12)" }}>
                ★ HomeGentic Certified™
              </div>
            )}
          </div>

          <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.plumMid }}>
            <span>Report ID: {snapshot.snapshotId}</span>
            <span>Generated: {new Date(snapshot.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* Agent co-branding banner */}
        {agentProfile && (
          <div style={{ border: `1px solid ${UI.rule}`, padding: "0.875rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", background: COLORS.white }}>
            {agentProfile.logoUrl && (
              <img src={agentProfile.logoUrl} alt="agent logo" style={{ height: "2.5rem", objectFit: "contain", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.9rem", color: UI.ink, marginBottom: "0.125rem" }}>{agentProfile.name}</p>
              {agentProfile.brokerage && <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.inkLight }}>{agentProfile.brokerage}</p>}
              {agentProfile.phone     && <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>{agentProfile.phone}</p>}
            </div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, textAlign: "right" }}>
              <Shield size={11} style={{ display: "inline", marginRight: "0.25rem" }} />
              Verified by HomeGentic
            </div>
          </div>
        )}

        {/* 48-hour expiry warning (15.2.2) — urgent banner when link expires soon */}
        {link && link.expiresAt && (link.expiresAt - Date.now()) <= 48 * 3600_000 && (
          <div className="no-print" style={{ border: `1.5px solid ${UI.rust}`, background: "#fff5f3", padding: "0.875rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.ink }}>
              ⚠ This report link expires {new Date(link.expiresAt).toLocaleDateString()}. Upgrade to Pro for a permanent link.
            </p>
            <a href="/pricing" style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: `1px solid ${COLORS.plum}`, background: COLORS.plum, color: COLORS.white, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
              Upgrade to Pro →
            </a>
          </div>
        )}

        {/* Free plan banner (15.3.2 / 15.3.3) — shown only for Free-tier snapshots */}
        {snapshot.planTier === "Free" && (
          <div className="no-print" style={{ border: `1.5px solid ${COLORS.sageMid}`, background: COLORS.sageLight, padding: "0.875rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.sage }}>Generated with HomeGentic Free</span>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.2rem" }}>
                Upgrade to remove this banner and unlock permanent sharing.
              </p>
            </div>
            <a href="/pricing" style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: `1px solid ${COLORS.plum}`, background: COLORS.plum, color: COLORS.white, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
              Upgrade →
            </a>
          </div>
        )}

        {/* Pro+ trust badge (15.3.3) — shown for Pro and Premium reports */}
        {(snapshot.planTier === "Pro" || snapshot.planTier === "Premium" || snapshot.planTier === "ContractorPro") && (
          <div className="no-print" style={{ border: `1.5px solid ${COLORS.sageMid}`, background: COLORS.sageLight, padding: "0.75rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <CheckCircle size={14} color={COLORS.sage} />
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.sage, fontWeight: 700 }}>Verified by HomeGentic</span>
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>— This report is powered by a HomeGentic Pro subscription.</span>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <StatBox label="Total Jobs"        value={snapshot.jobs.length} />
          <StatBox label="Verified On-Chain" value={snapshot.verifiedJobCount} sub={snapshot.jobs.length ? `${Math.round(snapshot.verifiedJobCount / snapshot.jobs.length * 100)}%` : undefined} />
          {!disclosure.hideAmounts && <StatBox label="Investment" value={fmt(snapshot.totalAmountCents)} />}
          {!disclosure.hidePermits  && <StatBox label="Permits on Record" value={snapshot.permitCount} />}
        </div>

        {/* §17.3.5 — Documented maintenance value (buyer-facing) */}
        <div style={{ marginBottom: "1.5rem" }}>
          <DocumentedValueSection score={reportScore} />
        </div>

        {/* Selective disclosure notice */}
        {(disclosure.hideAmounts || disclosure.hideContractors || disclosure.hidePermits || disclosure.hideDescriptions) && (
          <div style={{ border: `1px solid ${UI.rule}`, background: UI.paper, padding: "0.75rem 1rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Shield size={12} color={UI.inkLight} />
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight }}>
              The homeowner has chosen to share a selective view of this report.
              {disclosure.hideAmounts && " Job costs are hidden."}
              {disclosure.hideContractors && " Contractor names are hidden."}
              {disclosure.hidePermits && " Permit details are hidden."}
            </p>
          </div>
        )}

        {/* Verification callout */}
        {snapshot.verificationLevel !== "Unverified" && (
          <div style={{ border: `1px solid ${cfg.color}30`, background: cfg.bg, padding: "1.25rem", display: "flex", gap: "1rem", marginBottom: "2rem", alignItems: "flex-start" }}>
            <Shield size={20} color={cfg.color} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, marginBottom: "0.25rem" }}>{cfg.label}</p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: cfg.color, opacity: 0.85 }}>{cfg.description}. Each verified record is signed on the Internet Computer blockchain and cannot be altered retroactively.</p>
            </div>
          </div>
        )}

        {/* Maintenance Timeline */}
        <div style={{ marginBottom: "2.5rem" }}>
          <SectionHeader title="Maintenance Timeline" icon={<Wrench size={14} color={UI.rust} />} />

          {visibleJobs.length === 0 ? (
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, fontStyle: "italic" }}>No maintenance records on file.</p>
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "0.875rem", top: 0, bottom: 0, width: "1px", background: UI.rule }} />
              {visibleJobs.map((job, i) => (
                <div key={i} style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", paddingLeft: "0.25rem" }}>
                  <div style={{ width: "1.5rem", height: "1.5rem", background: job.isVerified ? UI.sage : UI.rule, flexShrink: 0, marginTop: "0.25rem", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${COLORS.white}` }}>
                    {job.isVerified && <CheckCircle size={9} color={COLORS.white} />}
                  </div>
                  <div style={{ flex: 1, border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1rem" }}>{SERVICE_ICONS[job.serviceType] ?? "🔩"}</span>
                        <span style={{ fontWeight: 700, color: UI.ink }}>{job.serviceType}</span>
                        {job.isVerified && (
                          <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.1rem 0.4rem" }}>
                            Verified
                          </span>
                        )}
                        {job.isDiy && (
                          <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: COLORS.plum, border: `1px solid ${COLORS.sageMid}`, padding: "0.1rem 0.4rem" }}>
                            DIY
                          </span>
                        )}
                      </div>
                      {!disclosure.hideAmounts && <span style={{ fontFamily: UI.serif, fontWeight: 700, color: UI.ink }}>{fmt(job.amountCents)}</span>}
                    </div>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.inkLight, marginBottom: "0.5rem" }}>{job.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                      <span>{fmtDate(job.date)}</span>
                      <span>{contractorLabel(job)}</span>
                      {job.permitNumber && <span>Permit: {job.permitNumber}</span>}
                      {job.warrantyMonths && <span>Warranty: {job.warrantyMonths} mo</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health Summary */}
        {(() => {
          const year = new Date().getFullYear();
          const systems = [
            { name: "HVAC", lifespan: 18, icon: "❄️" }, { name: "Roofing", lifespan: 25, icon: "🏠" },
            { name: "Plumbing", lifespan: 50, icon: "🔧" }, { name: "Electrical", lifespan: 35, icon: "⚡" },
            { name: "Windows", lifespan: 22, icon: "🪟" },
          ];
          return (
            <div style={{ marginBottom: "2.5rem" }}>
              <SectionHeader title="System Health" icon={<CheckCircle size={14} color={UI.sage} />} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))", gap: "1rem" }}>
                {systems.map((sys) => {
                  const latestJob = sortedJobs.find((j) => j.serviceType === sys.name);
                  const lastYear  = latestJob ? parseInt(latestJob.date.split("-")[0]) : snapshot.yearBuilt;
                  const age       = Math.max(0, year - lastYear);
                  const pctLife   = Math.min(100, Math.round(age / sys.lifespan * 100));
                  const health    = pctLife < 40 ? UI.sage : pctLife < 70 ? COLORS.plumMid : UI.rust;
                  const healthLabel = pctLife < 40 ? "Good" : pctLife < 70 ? "Fair" : "Aging";
                  return (
                    <div key={sys.name} style={{ background: COLORS.white, padding: "0.875rem", textAlign: "center", border: `1px solid ${UI.rule}` }}>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>{sys.icon}</div>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", fontWeight: 700, color: UI.ink }}>{sys.name}</p>
                      <div style={{ height: "3px", background: UI.rule, margin: "0.375rem 0" }}>
                        <div style={{ height: "3px", width: `${100 - pctLife}%`, background: health }} />
                      </div>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", fontWeight: 700, color: health }}>{healthLabel}</p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
                        {latestJob ? `Updated ${latestJob.date.split("-")[0]}` : `Original ${snapshot.yearBuilt}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Ongoing Services */}
        {snapshot.recurringServices && snapshot.recurringServices.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Ongoing Services" icon={<CheckCircle size={14} color={UI.sage} />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {snapshot.recurringServices.map((svc, i) => (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", background: COLORS.white, gap: "0.75rem", border: `1px solid ${UI.rule}` }}>
                  <div>
                    <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.04em", color: UI.ink, marginBottom: "0.2rem" }}>
                      {svc.serviceType}
                    </p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                      {svc.providerName} · {svc.frequency}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {svc.lastVisitDate && (
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                        Last: {fmtDate(svc.lastVisitDate)}
                      </span>
                    )}
                    <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                      {svc.totalVisits} visit{svc.totalVisits !== 1 ? "s" : ""} logged
                    </span>
                    <span style={{
                      fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
                      textTransform: "uppercase", padding: "0.15rem 0.5rem",
                      color: svc.status === "Active" ? UI.sage : UI.inkLight,
                      background: svc.status === "Active" ? COLORS.sageLight : UI.paper,
                      border: `1px solid ${svc.status === "Active" ? UI.sage + "44" : UI.rule}`,
                    }}>
                      {svc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Room Inventory */}
        {snapshot.rooms && snapshot.rooms.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Room Inventory" icon={<FileText size={14} color={UI.inkLight} />} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))", gap: "1rem" }}>
              {snapshot.rooms.map((room, i) => (
                <div key={i} style={{ border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", background: COLORS.white }}>
                  <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.08em", color: UI.ink, marginBottom: "0.625rem" }}>
                    {room.name}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {room.floorType && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Floor</span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>{room.floorType}</span>
                      </div>
                    )}
                    {room.paintColor && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Paint</span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>
                          {room.paintColor}{room.paintCode ? ` · ${room.paintCode}` : ""}
                        </span>
                      </div>
                    )}
                    {room.paintBrand && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Brand</span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>{room.paintBrand}</span>
                      </div>
                    )}
                    {room.fixtureCount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Fixtures</span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>{room.fixtureCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Warranties */}
        {(() => {
          const today = Date.now();
          const warranties = sortedJobs
            .filter((j) => j.warrantyMonths && j.warrantyMonths > 0)
            .map((j) => {
              const startMs  = new Date(j.date).getTime();
              const expiryMs = startMs + (j.warrantyMonths! * 30.44 * 24 * 3600 * 1000);
              const daysLeft = Math.round((expiryMs - today) / (24 * 3600 * 1000));
              const yearsLeft = (daysLeft / 365).toFixed(1);
              return { job: j, expiryMs, daysLeft, yearsLeft };
            })
            .sort((a, b) => a.expiryMs - b.expiryMs);

          if (warranties.length === 0) return null;
          const active  = warranties.filter((w) => w.daysLeft > 0);
          const expired = warranties.filter((w) => w.daysLeft <= 0);

          return (
            <div style={{ marginBottom: "2.5rem" }}>
              <SectionHeader title="Warranties" icon={<Shield size={14} color={COLORS.plum} />} />
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {active.map(({ job, daysLeft, yearsLeft }, i) => {
                  const nearExpiry = daysLeft <= 90;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", background: nearExpiry ? COLORS.butter : COLORS.white, gap: "0.75rem", flexWrap: "wrap", border: `1px solid ${UI.rule}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <span style={{ fontSize: "1rem" }}>{SERVICE_ICONS[job.serviceType] ?? "🔩"}</span>
                        <div>
                          <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.ink, marginBottom: "0.125rem" }}>{job.serviceType}</p>
                          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{contractorLabel(job)} · Started {fmtDate(job.date)}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
                        {nearExpiry && (
                          <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, border: `1px solid ${COLORS.plumMid}44`, padding: "0.15rem 0.5rem" }}>
                            Expiring soon
                          </span>
                        )}
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.875rem", color: nearExpiry ? COLORS.plumMid : UI.sage }}>
                            {daysLeft < 365 ? `${daysLeft} days` : `${yearsLeft} yrs`} remaining
                          </p>
                          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
                            {job.warrantyMonths} mo warranty
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {expired.map(({ job }, i) => (
                  <div key={`exp-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1.25rem", background: UI.paper, gap: "0.75rem", opacity: 0.6, border: `1px solid ${UI.rule}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      <span style={{ fontSize: "1rem", filter: "grayscale(1)" }}>{SERVICE_ICONS[job.serviceType] ?? "🔩"}</span>
                      <div>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>{job.serviceType}</p>
                        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{fmtDate(job.date)}</p>
                      </div>
                    </div>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Expired</span>
                  </div>
                ))}
              </div>
              {active.length > 0 && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: UI.inkLight, marginTop: "0.5rem" }}>
                  {active.length} active warrant{active.length !== 1 ? "ies" : "y"} on record. Verify transferability with contractor before sale.
                </p>
              )}
            </div>
          );
        })()}

        {/* Contractor Roster */}
        {uniqueContractors.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Contractor Roster" icon={<FileText size={14} color={UI.inkLight} />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {uniqueContractors.map((name) => {
                const contractorJobs = sortedJobs.filter((j) => j.contractorName === name);
                return (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: COLORS.white, border: `1px solid ${UI.rule}` }}>
                    <span style={{ fontFamily: UI.mono, fontWeight: 600, fontSize: "0.65rem", color: UI.ink }}>{name}</span>
                    <div style={{ display: "flex", gap: "1rem", fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                      <span>{contractorJobs.map((j) => j.serviceType).join(", ")}</span>
                      <span>{contractorJobs.filter((j) => j.isVerified).length}/{contractorJobs.length} verified</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Permits on Record */}
        {jobsWithPermit.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Permits on Record" icon={<FileText size={14} color={UI.inkLight} />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {jobsWithPermit.map((job, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: COLORS.white, border: `1px solid ${UI.rule}` }}>
                  <div>
                    <span style={{ fontFamily: UI.mono, fontWeight: 600, fontSize: "0.65rem", color: UI.ink }}>{job.serviceType}</span>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginLeft: "0.75rem" }}>{fmtDate(job.date)}</span>
                  </div>
                  <span style={{ fontFamily: UI.mono, fontWeight: 600, fontSize: "0.65rem", color: UI.ink, border: `1px solid ${UI.rule}`, padding: "0.2rem 0.5rem" }}>
                    {job.permitNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request Full Report CTA */}
        <div className="no-print" style={{ border: `1px solid ${UI.rule}`, padding: "2rem 1.5rem", marginBottom: "2rem", textAlign: "center", background: UI.paper }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
            Interested in this property?
          </p>
          <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.35rem", color: UI.ink, marginBottom: "0.625rem" }}>
            Get the Complete HomeGentic Report
          </p>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, maxWidth: "24rem", margin: "0 auto 1.25rem", lineHeight: 1.6 }}>
            Ask the homeowner to share the full version — including contractor contacts, all photos,
            receipts, and permit verification.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${UI.ink}`, padding: "0.625rem 1.75rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink, fontWeight: 600 }}>
            <Shield size={11} /> homegentic.io
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: `1px solid ${UI.rule}`, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
            <Shield size={14} color={UI.rust} />
            <span style={{ fontFamily: UI.mono, fontWeight: 900, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: UI.ink }}>HOMEGENTIC</span>
          </div>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, maxWidth: "28rem", margin: "0 auto" }}>
            This report was generated from records anchored on the Internet Computer blockchain.
            Verified records include cryptographic signatures from both the homeowner and contractor.
            Report ID: {snapshot.snapshotId}
          </p>
          {link && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, marginTop: "0.5rem" }}>
              {reportService.expiryLabel(link)} · {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
