/**
 * Public HomeFax Report — /report/:token
 *
 * Accessible without authentication. Renders a print-ready property history
 * report. Use browser Print → Save as PDF to generate a PDF copy.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Shield, CheckCircle, Wrench, FileText, Printer, AlertTriangle, XCircle } from "lucide-react";
import { reportService, ReportSnapshot, ShareLink, JobInput } from "@/services/report";

// ─── Constants ────────────────────────────────────────────────────────────────

const VERIFICATION_CONFIG: Record<string, { color: string; bg: string; label: string; description: string }> = {
  Premium:    { color: "#166534", bg: "#dcfce7", label: "HomeFax Premium Verified", description: "Comprehensive blockchain-verified maintenance history" },
  Basic:      { color: "#1e40af", bg: "#dbeafe", label: "HomeFax Basic Verified",   description: "Key maintenance records blockchain-verified" },
  Unverified: { color: "#6b7280", bg: "#f3f4f6", label: "Unverified",               description: "Maintenance history self-reported by homeowner" },
};

const SERVICE_ICONS: Record<string, string> = {
  HVAC: "❄️", Roofing: "🏠", Plumbing: "🔧", Electrical: "⚡",
  Painting: "🖌️", Flooring: "🪵", Windows: "🪟", Landscaping: "🌿",
  Foundation: "🏗️", Insulation: "🧱", Drywall: "🔨", Solar: "☀️",
  Kitchen: "🍳", Bathroom: "🚿", Other: "🔩",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${d}, ${y}`;
}

function contractorLabel(job: JobInput): string {
  return job.isDiy ? "DIY — Homeowner" : (job.contractorName ?? "Contractor");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerificationBadge({ level }: { level: string }) {
  const cfg = VERIFICATION_CONFIG[level] ?? VERIFICATION_CONFIG.Unverified;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1.5px solid ${cfg.color}30`,
        borderRadius: "9999px",
        padding: "0.375rem 1rem",
        fontSize: "0.813rem",
        fontWeight: 700,
      }}
    >
      <Shield size={14} />
      {cfg.label}
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "1.25rem",
        backgroundColor: "#f9fafb",
        borderRadius: "0.875rem",
        flex: 1,
      }}
    >
      <p style={{ fontSize: "1.75rem", fontWeight: 900, color: "#111827", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: "0.688rem", color: "#10b981", fontWeight: 700, marginTop: "0.125rem" }}>{sub}</p>}
      <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>{label}</p>
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        paddingBottom: "0.75rem",
        borderBottom: "2px solid #e5e7eb",
        marginBottom: "1.25rem",
      }}
    >
      {icon}
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>{title}</h2>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type LoadState = "loading" | "loaded" | "expired" | "revoked" | "notfound" | "error";

export default function ReportPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState]       = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [link, setLink]         = useState<ShareLink | null>(null);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!token) { setState("notfound"); return; }
    reportService.getReport(token).then(({ link, snapshot }) => {
      setLink(link);
      setSnapshot(snapshot);
      setState("loaded");
    }).catch((err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("expired"))  setState("expired");
      else if (msg.includes("revoked")) setState("revoked");
      else if (msg.includes("not found")) setState("notfound");
      else { setError(err.message); setState("error"); }
    });
  }, [token]);

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  if (state !== "loaded" || !snapshot) {
    const configs = {
      expired:  { icon: <AlertTriangle size={40} color="#f59e0b" />, title: "Report link expired",     body: "The homeowner's share link has passed its expiry date. Ask them to generate a new one." },
      revoked:  { icon: <XCircle      size={40} color="#ef4444" />, title: "Report link revoked",      body: "The homeowner has revoked access to this report." },
      notfound: { icon: <FileText     size={40} color="#d1d5db" />, title: "Report not found",         body: "This link may be invalid or the report has been removed." },
      error:    { icon: <AlertTriangle size={40} color="#ef4444" />, title: "Unable to load report",   body: error },
    };
    const cfg = configs[state as keyof typeof configs] ?? configs.error;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb", padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <div style={{ marginBottom: "1rem" }}>{cfg.icon}</div>
          <h1 style={{ fontWeight: 900, color: "#111827", marginBottom: "0.5rem" }}>{cfg.title}</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{cfg.body}</p>
          <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#9ca3af" }}>
            Powered by <strong>HomeFax</strong> — blockchain-verified home history
          </p>
        </div>
      </div>
    );
  }

  const cfg = VERIFICATION_CONFIG[snapshot.verificationLevel] ?? VERIFICATION_CONFIG.Unverified;
  const sortedJobs = [...snapshot.jobs].sort((a, b) => b.date.localeCompare(a.date));
  const verifiedJobs   = sortedJobs.filter((j) => j.isVerified);
  const jobsWithPermit = sortedJobs.filter((j) => j.permitNumber);
  const uniqueContractors = [...new Set(sortedJobs.filter((j) => !j.isDiy && j.contractorName).map((j) => j.contractorName as string))];

  return (
    <>
      {/* Print controls — hidden in print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          zIndex: 50,
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <button
          onClick={() => window.print()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: "#111827",
            color: "white",
            border: "none",
            borderRadius: "0.625rem",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Printer size={16} /> Save as PDF
        </button>
      </div>

      {/* Report document */}
      <div
        id="homefax-report"
        style={{
          maxWidth: "52rem",
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
          backgroundColor: "white",
          minHeight: "100vh",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* ── Cover ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
            borderRadius: "1.25rem",
            padding: "2.5rem",
            color: "white",
            marginBottom: "2rem",
          }}
        >
          {/* Logo line */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2rem", opacity: 0.9 }}>
            <Shield size={20} />
            <span style={{ fontWeight: 900, fontSize: "1rem", letterSpacing: "0.05em" }}>HOMEFAX</span>
            <span style={{ opacity: 0.5, fontSize: "0.875rem" }}>Property History Report</span>
          </div>

          {/* Address */}
          <h1 style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1.1, marginBottom: "0.375rem" }}>
            {snapshot.address}
          </h1>
          <p style={{ opacity: 0.75, fontSize: "1rem", marginBottom: "1.75rem" }}>
            {snapshot.city}, {snapshot.state} {snapshot.zipCode}
          </p>

          {/* Meta row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "0.813rem", opacity: 0.8, marginBottom: "1.75rem" }}>
            <span>{snapshot.propertyType}</span>
            <span>Built {snapshot.yearBuilt}</span>
            <span>{Number(snapshot.squareFeet).toLocaleString()} sq ft</span>
          </div>

          {/* Verification badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: `${cfg.color}25`,
              border: `1.5px solid ${cfg.color}60`,
              borderRadius: "9999px",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              color: cfg.bg,
            }}
          >
            <Shield size={15} />
            {cfg.label}
          </div>

          {/* Report ID + date */}
          <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.75rem", opacity: 0.55 }}>
            <span>Report ID: {snapshot.snapshotId}</span>
            <span>Generated: {new Date(snapshot.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <StatBox label="Total Jobs"        value={snapshot.jobs.length} />
          <StatBox label="Verified On-Chain" value={snapshot.verifiedJobCount} sub={snapshot.jobs.length ? `${Math.round(snapshot.verifiedJobCount / snapshot.jobs.length * 100)}%` : undefined} />
          <StatBox label="Investment"        value={fmt(snapshot.totalAmountCents)} />
          <StatBox label="Permits on Record" value={snapshot.permitCount} />
        </div>

        {/* ── Verification callout ───────────────────────────────────────────── */}
        {snapshot.verificationLevel !== "Unverified" && (
          <div
            style={{
              backgroundColor: cfg.bg,
              border: `1.5px solid ${cfg.color}30`,
              borderRadius: "0.875rem",
              padding: "1.25rem",
              display: "flex",
              gap: "1rem",
              marginBottom: "2rem",
              alignItems: "flex-start",
            }}
          >
            <Shield size={22} color={cfg.color} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontWeight: 700, color: cfg.color, marginBottom: "0.25rem" }}>{cfg.label}</p>
              <p style={{ fontSize: "0.875rem", color: cfg.color, opacity: 0.85 }}>{cfg.description}. Each verified record is signed on the Internet Computer blockchain and cannot be altered retroactively.</p>
            </div>
          </div>
        )}

        {/* ── Maintenance Timeline ───────────────────────────────────────────── */}
        <div style={{ marginBottom: "2.5rem" }}>
          <SectionHeader title="Maintenance Timeline" icon={<Wrench size={18} color="#3b82f6" />} />

          {sortedJobs.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: "0.875rem", fontStyle: "italic" }}>
              No maintenance records on file.
            </p>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Timeline spine */}
              <div style={{ position: "absolute", left: "0.875rem", top: 0, bottom: 0, width: "2px", backgroundColor: "#e5e7eb" }} />

              {sortedJobs.map((job, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: "1.5rem", marginBottom: "1.25rem", paddingLeft: "0.25rem" }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      backgroundColor: job.isVerified ? "#10b981" : "#d1d5db",
                      flexShrink: 0,
                      marginTop: "0.25rem",
                      zIndex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid white",
                      boxShadow: "0 0 0 2px " + (job.isVerified ? "#10b981" : "#d1d5db"),
                    }}
                  >
                    {job.isVerified && <CheckCircle size={10} color="white" />}
                  </div>

                  {/* Card */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: "#fafafa",
                      border: "1px solid #e5e7eb",
                      borderRadius: "0.875rem",
                      padding: "1rem 1.25rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1rem" }}>{SERVICE_ICONS[job.serviceType] ?? "🔩"}</span>
                        <span style={{ fontWeight: 700, color: "#111827" }}>{job.serviceType}</span>
                        {job.isVerified && (
                          <span style={{ fontSize: "0.688rem", fontWeight: 700, color: "#166534", backgroundColor: "#dcfce7", padding: "0.125rem 0.5rem", borderRadius: "9999px" }}>
                            VERIFIED
                          </span>
                        )}
                        {job.isDiy && (
                          <span style={{ fontSize: "0.688rem", fontWeight: 700, color: "#1d4ed8", backgroundColor: "#dbeafe", padding: "0.125rem 0.5rem", borderRadius: "9999px" }}>
                            DIY
                          </span>
                        )}
                      </div>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{fmt(job.amountCents)}</span>
                    </div>

                    <p style={{ fontSize: "0.875rem", color: "#374151", marginBottom: "0.5rem" }}>
                      {job.description}
                    </p>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.75rem", color: "#9ca3af" }}>
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

        {/* ── System Health Summary ──────────────────────────────────────────── */}
        {(() => {
          const year = new Date().getFullYear();
          const systems = [
            { name: "HVAC",       lifespan: 18, icon: "❄️" },
            { name: "Roofing",    lifespan: 25, icon: "🏠" },
            { name: "Plumbing",   lifespan: 50, icon: "🔧" },
            { name: "Electrical", lifespan: 35, icon: "⚡" },
            { name: "Windows",    lifespan: 22, icon: "🪟" },
          ];
          return (
            <div style={{ marginBottom: "2.5rem" }}>
              <SectionHeader title="System Health" icon={<CheckCircle size={18} color="#10b981" />} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))", gap: "0.75rem" }}>
                {systems.map((sys) => {
                  const latestJob = sortedJobs.find((j) => j.serviceType === sys.name);
                  const lastYear  = latestJob ? parseInt(latestJob.date.split("-")[0]) : snapshot.yearBuilt;
                  const age       = Math.max(0, year - lastYear);
                  const pctLife   = Math.min(100, Math.round(age / sys.lifespan * 100));
                  const health    = pctLife < 40 ? "#10b981" : pctLife < 70 ? "#f59e0b" : "#ef4444";
                  const healthLabel = pctLife < 40 ? "Good" : pctLife < 70 ? "Fair" : "Aging";
                  return (
                    <div
                      key={sys.name}
                      style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.875rem", padding: "0.875rem", textAlign: "center" }}
                    >
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>{sys.icon}</div>
                      <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#111827" }}>{sys.name}</p>
                      <div style={{ height: "4px", backgroundColor: "#e5e7eb", borderRadius: "9999px", margin: "0.375rem 0" }}>
                        <div style={{ height: "100%", width: `${100 - pctLife}%`, backgroundColor: health, borderRadius: "9999px" }} />
                      </div>
                      <p style={{ fontSize: "0.688rem", fontWeight: 700, color: health }}>{healthLabel}</p>
                      <p style={{ fontSize: "0.625rem", color: "#9ca3af" }}>
                        {latestJob ? `Updated ${latestJob.date.split("-")[0]}` : `Original ${snapshot.yearBuilt}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Contractor Roster ──────────────────────────────────────────────── */}
        {uniqueContractors.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Contractor Roster" icon={<FileText size={18} color="#8b5cf6" />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {uniqueContractors.map((name) => {
                const contractorJobs = sortedJobs.filter((j) => j.contractorName === name);
                return (
                  <div
                    key={name}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.75rem", fontSize: "0.875rem" }}
                  >
                    <span style={{ fontWeight: 600, color: "#111827" }}>{name}</span>
                    <div style={{ display: "flex", gap: "1rem", color: "#6b7280", fontSize: "0.75rem" }}>
                      <span>{contractorJobs.map((j) => j.serviceType).join(", ")}</span>
                      <span>{contractorJobs.filter((j) => j.isVerified).length}/{contractorJobs.length} verified</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Permits on Record ──────────────────────────────────────────────── */}
        {jobsWithPermit.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Permits on Record" icon={<FileText size={18} color="#f59e0b" />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {jobsWithPermit.map((job, i) => (
                <div
                  key={i}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "0.75rem", fontSize: "0.875rem" }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: "#111827" }}>{job.serviceType}</span>
                    <span style={{ color: "#6b7280", marginLeft: "0.75rem" }}>{fmtDate(job.date)}</span>
                  </div>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#92400e", backgroundColor: "#fef3c7", padding: "0.25rem 0.625rem", borderRadius: "0.375rem", fontSize: "0.75rem" }}>
                    {job.permitNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: "3rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
            <Shield size={16} color="#3b82f6" />
            <span style={{ fontWeight: 900, color: "#111827", letterSpacing: "0.05em" }}>HOMEFAX</span>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af", maxWidth: "28rem", margin: "0 auto" }}>
            This report was generated from records anchored on the Internet Computer blockchain.
            Verified records include cryptographic signatures from both the homeowner and contractor.
            Report ID: {snapshot.snapshotId}
          </p>
          {link && (
            <p style={{ fontSize: "0.688rem", color: "#d1d5db", marginTop: "0.5rem" }}>
              {reportService.expiryLabel(link)} · {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
