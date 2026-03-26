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

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const VERIFICATION_CONFIG: Record<string, { color: string; bg: string; label: string; description: string }> = {
  Premium:    { color: S.sage,     bg: "#F0F6F3", label: "HomeFax Premium Verified", description: "Comprehensive blockchain-verified maintenance history" },
  Basic:      { color: "#1e40af",  bg: "#dbeafe", label: "HomeFax Basic Verified",   description: "Key maintenance records blockchain-verified" },
  Unverified: { color: S.inkLight, bg: S.paper,   label: "Unverified",               description: "Maintenance history self-reported by homeowner" },
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
    <div style={{ textAlign: "center", padding: "1.25rem", border: `1px solid ${S.rule}`, flex: 1 }}>
      <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>{value}</p>
      {sub && <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.sage, fontWeight: 700, marginTop: "0.125rem" }}>{sub}</p>}
      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginTop: "0.25rem" }}>{label}</p>
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", paddingBottom: "0.75rem", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.25rem" }}>
      {icon}
      <h2 style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight }}>{title}</h2>
    </div>
  );
}

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
      setLink(link); setSnapshot(snapshot); setState("loaded");
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  if (state !== "loaded" || !snapshot) {
    const configs = {
      expired:  { icon: <AlertTriangle size={40} color={S.rust} />,   title: "Report link expired",   body: "The homeowner's share link has passed its expiry date. Ask them to generate a new one." },
      revoked:  { icon: <XCircle      size={40} color={S.rust} />,    title: "Report link revoked",   body: "The homeowner has revoked access to this report." },
      notfound: { icon: <FileText     size={40} color={S.inkLight} />, title: "Report not found",      body: "This link may be invalid or the report has been removed." },
      error:    { icon: <AlertTriangle size={40} color={S.rust} />,   title: "Unable to load report", body: error },
    };
    const cfg = configs[state as keyof typeof configs] ?? configs.error;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper, padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <div style={{ marginBottom: "1rem" }}>{cfg.icon}</div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: S.ink, marginBottom: "0.5rem" }}>{cfg.title}</h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>{cfg.body}</p>
          <p style={{ marginTop: "2rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            Powered by <strong style={{ color: S.ink }}>HomeFax</strong> — blockchain-verified home history
          </p>
        </div>
      </div>
    );
  }

  const cfg = VERIFICATION_CONFIG[snapshot.verificationLevel] ?? VERIFICATION_CONFIG.Unverified;
  const sortedJobs        = [...snapshot.jobs].sort((a, b) => b.date.localeCompare(a.date));
  const verifiedJobs      = sortedJobs.filter((j) => j.isVerified);
  const jobsWithPermit    = sortedJobs.filter((j) => j.permitNumber);
  const uniqueContractors = [...new Set(sortedJobs.filter((j) => !j.isDiy && j.contractorName).map((j) => j.contractorName as string))];

  return (
    <>
      {/* Print controls */}
      <div className="no-print" style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: S.ink, color: "#F4F1EB", border: "none", padding: "0.625rem 1rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          <Printer size={14} /> Save as PDF
        </button>
      </div>

      {/* Report document */}
      <div id="homefax-report" style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem 4rem", background: "#fff", minHeight: "100vh", fontFamily: S.mono }}>

        {/* Cover */}
        <div style={{ background: S.ink, padding: "2.5rem", color: "#F4F1EB", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2rem", opacity: 0.7 }}>
            <Shield size={16} />
            <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>HOMEFAX</span>
            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: "#7A7268" }}>Property History Report</span>
          </div>

          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1.1, color: "#F4F1EB", marginBottom: "0.375rem" }}>
            {snapshot.address}
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: "#7A7268", marginBottom: "1.75rem", letterSpacing: "0.06em" }}>
            {snapshot.city}, {snapshot.state} {snapshot.zipCode}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: "#7A7268", marginBottom: "1.75rem" }}>
            <span>{snapshot.propertyType}</span>
            <span>Built {snapshot.yearBuilt}</span>
            <span>{Number(snapshot.squareFeet).toLocaleString()} sq ft</span>
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${cfg.color}60`, padding: "0.5rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.bg }}>
            <Shield size={12} />{cfg.label}
          </div>

          <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", fontFamily: S.mono, fontSize: "0.6rem", color: "#7A7268" }}>
            <span>Report ID: {snapshot.snapshotId}</span>
            <span>Generated: {new Date(snapshot.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "1px", marginBottom: "2rem", background: S.rule, flexWrap: "wrap" }}>
          <StatBox label="Total Jobs"        value={snapshot.jobs.length} />
          <StatBox label="Verified On-Chain" value={snapshot.verifiedJobCount} sub={snapshot.jobs.length ? `${Math.round(snapshot.verifiedJobCount / snapshot.jobs.length * 100)}%` : undefined} />
          <StatBox label="Investment"        value={fmt(snapshot.totalAmountCents)} />
          <StatBox label="Permits on Record" value={snapshot.permitCount} />
        </div>

        {/* Verification callout */}
        {snapshot.verificationLevel !== "Unverified" && (
          <div style={{ border: `1px solid ${cfg.color}30`, background: cfg.bg, padding: "1.25rem", display: "flex", gap: "1rem", marginBottom: "2rem", alignItems: "flex-start" }}>
            <Shield size={20} color={cfg.color} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, marginBottom: "0.25rem" }}>{cfg.label}</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: cfg.color, opacity: 0.85 }}>{cfg.description}. Each verified record is signed on the Internet Computer blockchain and cannot be altered retroactively.</p>
            </div>
          </div>
        )}

        {/* Maintenance Timeline */}
        <div style={{ marginBottom: "2.5rem" }}>
          <SectionHeader title="Maintenance Timeline" icon={<Wrench size={14} color={S.rust} />} />

          {sortedJobs.length === 0 ? (
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, fontStyle: "italic" }}>No maintenance records on file.</p>
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "0.875rem", top: 0, bottom: 0, width: "1px", background: S.rule }} />
              {sortedJobs.map((job, i) => (
                <div key={i} style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", paddingLeft: "0.25rem" }}>
                  <div style={{ width: "1.5rem", height: "1.5rem", background: job.isVerified ? S.sage : S.rule, flexShrink: 0, marginTop: "0.25rem", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid #fff` }}>
                    {job.isVerified && <CheckCircle size={9} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, border: `1px solid ${S.rule}`, padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1rem" }}>{SERVICE_ICONS[job.serviceType] ?? "🔩"}</span>
                        <span style={{ fontWeight: 700, color: S.ink }}>{job.serviceType}</span>
                        {job.isVerified && (
                          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: S.sage, border: `1px solid ${S.sage}40`, padding: "0.1rem 0.4rem" }}>
                            Verified
                          </span>
                        )}
                        {job.isDiy && (
                          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "0.1rem 0.4rem" }}>
                            DIY
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: S.serif, fontWeight: 700, color: S.ink }}>{fmt(job.amountCents)}</span>
                    </div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight, marginBottom: "0.5rem" }}>{job.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
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
              <SectionHeader title="System Health" icon={<CheckCircle size={14} color={S.sage} />} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))", gap: "1px", background: S.rule }}>
                {systems.map((sys) => {
                  const latestJob = sortedJobs.find((j) => j.serviceType === sys.name);
                  const lastYear  = latestJob ? parseInt(latestJob.date.split("-")[0]) : snapshot.yearBuilt;
                  const age       = Math.max(0, year - lastYear);
                  const pctLife   = Math.min(100, Math.round(age / sys.lifespan * 100));
                  const health    = pctLife < 40 ? S.sage : pctLife < 70 ? "#D4820E" : S.rust;
                  const healthLabel = pctLife < 40 ? "Good" : pctLife < 70 ? "Fair" : "Aging";
                  return (
                    <div key={sys.name} style={{ background: "#fff", padding: "0.875rem", textAlign: "center" }}>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>{sys.icon}</div>
                      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", fontWeight: 700, color: S.ink }}>{sys.name}</p>
                      <div style={{ height: "3px", background: S.rule, margin: "0.375rem 0" }}>
                        <div style={{ height: "3px", width: `${100 - pctLife}%`, background: health }} />
                      </div>
                      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", fontWeight: 700, color: health }}>{healthLabel}</p>
                      <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
                        {latestJob ? `Updated ${latestJob.date.split("-")[0]}` : `Original ${snapshot.yearBuilt}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Contractor Roster */}
        {uniqueContractors.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <SectionHeader title="Contractor Roster" icon={<FileText size={14} color={S.inkLight} />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
              {uniqueContractors.map((name) => {
                const contractorJobs = sortedJobs.filter((j) => j.contractorName === name);
                return (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "#fff" }}>
                    <span style={{ fontFamily: S.mono, fontWeight: 600, fontSize: "0.65rem", color: S.ink }}>{name}</span>
                    <div style={{ display: "flex", gap: "1rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
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
            <SectionHeader title="Permits on Record" icon={<FileText size={14} color={S.inkLight} />} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
              {jobsWithPermit.map((job, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "#fff" }}>
                  <div>
                    <span style={{ fontFamily: S.mono, fontWeight: 600, fontSize: "0.65rem", color: S.ink }}>{job.serviceType}</span>
                    <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginLeft: "0.75rem" }}>{fmtDate(job.date)}</span>
                  </div>
                  <span style={{ fontFamily: S.mono, fontWeight: 600, fontSize: "0.65rem", color: S.ink, border: `1px solid ${S.rule}`, padding: "0.2rem 0.5rem" }}>
                    {job.permitNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: `1px solid ${S.rule}`, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
            <Shield size={14} color={S.rust} />
            <span style={{ fontFamily: S.mono, fontWeight: 900, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: S.ink }}>HOMEFAX</span>
          </div>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, maxWidth: "28rem", margin: "0 auto" }}>
            This report was generated from records anchored on the Internet Computer blockchain.
            Verified records include cryptographic signatures from both the homeowner and contractor.
            Report ID: {snapshot.snapshotId}
          </p>
          {link && (
            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.5rem" }}>
              {reportService.expiryLabel(link)} · {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
