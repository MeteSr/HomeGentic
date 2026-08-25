import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { contractorService, ContractorProfile } from "@/services/contractor";
import { jobService, Job } from "@/services/job";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

// ── Contractor card ────────────────────────────────────────────────────────────

function ContractorCard({
  name, specialty, city, jobs, lastJob, lastAmount, isVerified, isAwaiting, onRequestQuote, onViewJobs,
}: {
  name:          string;
  specialty:     string;
  city?:         string;
  jobs:          number;
  lastJob:       string;
  lastAmount:    string;
  isVerified:    boolean;
  isAwaiting:    boolean;
  onRequestQuote:() => void;
  onViewJobs:    () => void;
}) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors   = [
    { bg: "#E0E2FF", fg: C.blue },
    { bg: "#DCFCE7", fg: "#16A34A" },
    { bg: "#FEF3C7", fg: "#D97706" },
    { bg: "#FCE7F3", fg: "#DB2777" },
    { bg: "#E0F2FE", fg: "#0891B2" },
  ];
  const { bg, fg } = colors[name.charCodeAt(0) % colors.length];

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", padding: "18px 20px" }}>
      {/* Avatar + name row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: fg }}>{initials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink }}>{name}</span>
            {isVerified && (
              <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.blue, background: C.vbadge, borderRadius: 4, padding: "2px 6px" }}>VERIFIED</span>
            )}
            {isAwaiting && (
              <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: "#D97706", background: "#FFFBEB", borderRadius: 4, padding: "2px 6px" }}>AWAITING</span>
            )}
          </div>
          <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
            {specialty}{city ? ` · ${city}` : ""}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, padding: "12px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>JOBS</div>
          <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 900, color: C.ink }}>{jobs}</div>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>LAST JOB</div>
          <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 900, color: C.ink }}>{lastAmount}</div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{lastJob}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onRequestQuote} style={{ flex: 1, fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "8px", cursor: "pointer" }}>
          Request quote
        </button>
        <button onClick={onViewJobs} style={{ flex: 1, fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.blue, background: "none", border: "none", padding: "8px", cursor: "pointer" }}>
          View jobs
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ContractorBrowsePage() {
  const navigate = useNavigate();
  const [contractors, setContractors] = useState<ContractorProfile[]>([]);
  const [jobs,        setJobs]        = useState<Job[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      contractorService.search(),
      jobService.getAll().catch(() => [] as Job[]),
    ]).then(([ctrs, js]) => {
      setContractors(ctrs);
      setJobs(js);
    }).catch(e => console.error("[ContractorBrowsePage] load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const myContractors = useMemo(() => {
    const byName = new Map<string, { name: string; specialty: string; lastDate: string; lastAmount: number; count: number; isVerified: boolean }>();
    for (const j of jobs) {
      if (!j.contractorName) continue;
      const existing = byName.get(j.contractorName);
      if (!existing) {
        byName.set(j.contractorName, { name: j.contractorName, specialty: j.serviceType, lastDate: j.date, lastAmount: j.amount, count: 1, isVerified: j.verified });
      } else {
        const newer = j.date > existing.lastDate;
        byName.set(j.contractorName, { ...existing, lastDate: newer ? j.date : existing.lastDate, lastAmount: newer ? j.amount : existing.lastAmount, specialty: newer ? j.serviceType : existing.specialty, count: existing.count + 1, isVerified: existing.isVerified || j.verified });
      }
    }
    return [...byName.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [jobs]);

  // Find contractors with unsigned/pending work
  const awaitingSignature = useMemo(() =>
    jobs.filter(j => j.homeownerSigned && !j.contractorSigned && j.contractorName).map(j => j.contractorName!),
  [jobs]);
  const awaitingSet = useMemo(() => new Set(awaitingSignature), [awaitingSignature]);

  const totalJobs  = myContractors.length;

  return (
    <Layout>
      <div style={{ background: C.paper, minHeight: "100%", padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              CONTRACTORS
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "1.875rem", color: C.ink, margin: 0 }}>
              {totalJobs} pro{totalJobs !== 1 ? "s" : ""} with work on this record
            </h1>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "10px 18px", cursor: "pointer" }}>
            Back to dashboard
          </button>
        </div>

        {/* Awaiting countersign alert */}
        {awaitingSignature.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: `1px solid #FEF3C7`, borderRadius: 12, background: "#FFFBEB", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={16} color="#D97706" />
              <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 500, color: C.ink }}>
                {awaitingSignature[0]} has not countersigned the {new Date(jobs.find(j => j.contractorName === awaitingSignature[0])?.date ?? Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" })} work. Unverified after 14 days, it earns no points.
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.blue, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Resend request
              </button>
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Attach receipt instead
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : myContractors.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "3rem", textAlign: "center", background: "#fff" }}>
            <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No contractors yet</p>
            <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Contractors who have completed work on your property will appear here.
            </p>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer" }}>
              Post a job
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {myContractors.map((ctr) => (
              <ContractorCard
                key={ctr.name}
                name={ctr.name}
                specialty={ctr.specialty}
                city={undefined}
                jobs={ctr.count}
                lastJob={new Date(ctr.lastDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                lastAmount={`$${Math.round(ctr.lastAmount / 100).toLocaleString()}`}
                isVerified={ctr.isVerified}
                isAwaiting={awaitingSet.has(ctr.name)}
                onRequestQuote={() => navigate("/quotes/new")}
                onViewJobs={() => navigate("/jobs")}
              />
            ))}

            {/* Also show contractors from the registry that haven't worked on this property */}
            {contractors.filter(c => !myContractors.find(m => m.name === c.name)).slice(0, 3).map((ctr) => (
              <ContractorCard
                key={ctr.id}
                name={ctr.name}
                specialty={ctr.specialties[0] ?? "General"}
                city={ctr.serviceArea ?? undefined}
                jobs={ctr.jobsCompleted}
                lastJob="—"
                lastAmount="—"
                isVerified={ctr.isVerified}
                isAwaiting={false}
                onRequestQuote={() => navigate("/quotes/new")}
                onViewJobs={() => navigate(`/contractor/${ctr.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
