/**
 * Contractor discovery page — /contractors           (issue #423)
 *
 * Homeowners search the contractor registry by zip code and service category.
 * Cards show trust score, verified status, specialties, and jobs completed.
 * "Request quote" navigates to /quotes/new pre-filled with the contractor's
 * primary specialty and name.
 *
 * Data: all contractors are fetched via contractorService.search(), then filtered
 * client-side by zip (serviceZips match) and specialty. The canister's getByZip
 * and getBySpecialty queries are proxied through search() already.
 */

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate }                          from "react-router-dom";
import { Search, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Layout }                               from "@/components/Layout";
import { contractorService, ContractorProfile } from "@/services/contractor";
import { jobService, Job }                      from "@/services/job";
import { V2_COLORS, V2_FONTS }                  from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

// ── Constants ──────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "HVAC", "Roofing", "Plumbing", "Electrical", "Painting",
  "Flooring", "Windows", "Landscaping", "Gutters", "GeneralHandyman",
  "Pest", "Concrete", "Fencing", "Insulation", "Solar", "Pool",
] as const;

const AVATAR_COLORS = [
  { bg: "#E0E2FF", fg: C.blue },
  { bg: "#DCFCE7", fg: "#0F7A32" },
  { bg: "#FEF3C7", fg: "#8A5200" },
  { bg: "#FCE7F3", fg: "#A01D5C" },
  { bg: "#E0F2FE", fg: "#0A6478" },
];

// ── Trust score badge ──────────────────────────────────────────────────────────

function TrustBadge({ score }: { score: number }) {
  const { bg, color, label } =
    score >= 75 ? { bg: "#DCFCE7", color: "#0F7A32", label: "HIGH" }
    : score >= 50 ? { bg: C.vbadge,   color: C.blue,    label: "MID"  }
    :               { bg: "#FEF3C7",  color: "#8A5200", label: "LOW"  };

  return (
    <div style={{
      display:        "inline-flex",
      alignItems:     "center",
      gap:             4,
      background:      bg,
      borderRadius:    4,
      padding:        "2px 7px",
    }}>
      <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>
        {score}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 8, fontWeight: 700, color, letterSpacing: "0.1em" }}>
        /{label}
      </span>
    </div>
  );
}

// ── Contractor card ────────────────────────────────────────────────────────────

function ContractorCard({
  contractor,
  isAwaiting,
  onViewProfile,
  onRequestQuote,
}: {
  contractor:     ContractorProfile;
  isAwaiting:     boolean;
  onViewProfile:  () => void;
  onRequestQuote: () => void;
}) {
  const { bg, fg } = AVATAR_COLORS[contractor.name.charCodeAt(0) % AVATAR_COLORS.length];
  const initials   = contractor.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      border:     `1px solid ${C.border}`,
      borderRadius: 12,
      background:  "#fff",
      padding:    "18px 20px",
      display:    "flex",
      flexDirection: "column",
      gap:         0,
    }}>
      {/* Avatar + name row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: bg, display: "flex", alignItems: "center",
          justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: fg }}>{initials}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink }}>
              {contractor.name}
            </span>
            {contractor.isVerified && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: F.mono, fontSize: 9, fontWeight: 700,
                color: C.blue, background: C.vbadge, borderRadius: 4, padding: "2px 5px",
              }}>
                <ShieldCheck size={9} /> VERIFIED
              </span>
            )}
            {isAwaiting && (
              <span style={{
                fontFamily: F.mono, fontSize: 9, fontWeight: 700,
                color: "#D97706", background: "#FFFBEB", borderRadius: 4, padding: "2px 6px",
              }}>
                AWAITING
              </span>
            )}
          </div>

          {/* Trust score */}
          <TrustBadge score={contractor.trustScore} />
        </div>
      </div>

      {/* Specialties */}
      {contractor.specialties.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {contractor.specialties.slice(0, 4).map((s) => (
            <span key={s} style={{
              fontFamily: F.mono, fontSize: 9, color: C.muted,
              border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px",
            }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        padding: "10px 0", marginBottom: 14,
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>JOBS</div>
          <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 900, color: C.ink }}>{contractor.jobsCompleted}</div>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>SERVICE AREA</div>
          <div style={{ fontFamily: F.body, fontSize: 12, color: C.ink, lineHeight: 1.3 }}>
            {contractor.serviceArea ?? (contractor.serviceZips.length > 0 ? contractor.serviceZips.slice(0, 2).join(", ") : "—")}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onRequestQuote}
          style={{
            flex: 1, fontFamily: F.body, fontSize: 13, fontWeight: 600,
            color: "#fff", background: C.blue, border: "none",
            borderRadius: 100, padding: "8px", cursor: "pointer",
          }}
        >
          Request quote
        </button>
        <button
          onClick={onViewProfile}
          style={{
            flex: 1, fontFamily: F.body, fontSize: 13, fontWeight: 600,
            color: C.ink, background: "#fff", border: `1px solid ${C.border}`,
            borderRadius: 100, padding: "8px", cursor: "pointer",
          }}
        >
          View profile
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

  const [zipInput,       setZipInput]       = useState("");
  const [activeZip,      setActiveZip]      = useState("");
  const [activeSpecialty, setActiveSpecialty] = useState("");

  useEffect(() => {
    Promise.all([
      contractorService.search(),
      jobService.getAll().catch(() => [] as Job[]),
    ]).then(([ctrs, js]) => {
      setContractors(ctrs);
      setJobs(js);
    }).catch((e) => console.error("[ContractorBrowsePage] load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  // Contractors who have pending countersignatures on this homeowner's jobs
  const awaitingSet = useMemo(() => {
    const names = jobs
      .filter((j) => j.homeownerSigned && !j.contractorSigned && j.contractorName)
      .map((j) => j.contractorName!);
    return new Set(names);
  }, [jobs]);

  // Awaiting-signature alert: show the first pending contractor
  const firstAwaiting = useMemo(() => {
    for (const j of jobs) {
      if (j.homeownerSigned && !j.contractorSigned && j.contractorName) return j;
    }
    return null;
  }, [jobs]);

  // Client-side filtering by zip + specialty
  const filtered = useMemo(() => {
    let list = contractors;
    if (activeSpecialty) {
      list = list.filter((c) => c.specialties.includes(activeSpecialty));
    }
    if (activeZip) {
      const z = activeZip.trim();
      list = list.filter(
        (c) => c.serviceZips.includes(z) || c.serviceArea?.includes(z),
      );
    }
    return list;
  }, [contractors, activeZip, activeSpecialty]);

  function handleSearch() {
    setActiveZip(zipInput.trim());
  }

  function handleClear() {
    setZipInput("");
    setActiveZip("");
    setActiveSpecialty("");
  }

  const hasFilter     = activeZip || activeSpecialty;
  const resultLabel   = hasFilter
    ? `${filtered.length} contractor${filtered.length !== 1 ? "s" : ""} found`
    : `${contractors.length} contractor${contractors.length !== 1 ? "s" : ""} in the registry`;

  return (
    <Layout>
      <div style={{ background: C.page, minHeight: "100%" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: "28px 24px" }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted2, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              CONTRACTORS
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "1.75rem", color: C.ink, margin: 0 }}>
              Find a contractor
            </h1>
          </div>

          {/* Filter bar */}
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap",
            marginBottom: 20, alignItems: "flex-end",
          }}>
            {/* Zip code */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 180px" }}>
              <label htmlFor="contractor-zip" style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                ZIP CODE
              </label>
              <input
                id="contractor-zip"
                type="text"
                maxLength={10}
                placeholder="e.g. 78701"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                style={{
                  fontFamily: F.body, fontSize: 14, color: C.ink,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "9px 12px", background: "#fff", outline: "none",
                }}
              />
            </div>

            {/* Specialty */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 200px" }}>
              <label htmlFor="contractor-specialty" style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                SERVICE TYPE
              </label>
              <select
                id="contractor-specialty"
                value={activeSpecialty}
                onChange={(e) => setActiveSpecialty(e.target.value)}
                style={{
                  fontFamily: F.body, fontSize: 14, color: C.ink,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "9px 12px", background: "#fff", cursor: "pointer",
                  appearance: "none",
                }}
              >
                <option value="">All service types</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Search button */}
            <button
              onClick={handleSearch}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: F.body, fontSize: 14, fontWeight: 600,
                color: "#fff", background: C.blue, border: "none",
                borderRadius: 8, padding: "9px 20px", cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Search size={14} /> Search
            </button>

            {/* Clear */}
            {hasFilter && (
              <button
                onClick={handleClear}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontFamily: F.body, fontSize: 13, fontWeight: 500,
                  color: C.muted, background: "none", border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "9px 14px", cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Awaiting countersign alert */}
          {firstAwaiting && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", border: `1px solid #FEF3C7`,
              borderRadius: 12, background: "#FFFBEB", marginBottom: 20,
              flexWrap: "wrap", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={16} color="#D97706" />
                <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 500, color: C.ink }}>
                  {firstAwaiting.contractorName} has not countersigned the{" "}
                  {new Date(firstAwaiting.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} work.
                  Unverified after 14 days, it earns no points.
                </span>
              </div>
              <button
                onClick={() => navigate(`/contractor/${encodeURIComponent(firstAwaiting.contractorName ?? "")}`)}
                style={{
                  fontFamily: F.body, fontSize: 13, fontWeight: 600,
                  color: C.blue, background: "#fff", border: `1px solid ${C.border}`,
                  borderRadius: 100, padding: "8px 16px", cursor: "pointer",
                }}
              >
                View contractor
              </button>
            </div>
          )}

          {/* Result summary */}
          {!loading && (
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted2, marginBottom: 16, letterSpacing: "0.04em" }}>
              {resultLabel}
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
              <div className="spinner-lg" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "3rem", textAlign: "center", background: "#fff",
            }}>
              {hasFilter ? (
                <>
                  <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
                    No contractors match your search
                  </p>
                  <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
                    Try a different zip code or service type.
                  </p>
                  <button
                    onClick={handleClear}
                    style={{
                      fontFamily: F.body, fontSize: 14, fontWeight: 600,
                      color: C.blue, background: C.lblue, border: `1px solid ${C.border}`,
                      borderRadius: 100, padding: "10px 24px", cursor: "pointer",
                    }}
                  >
                    Show all contractors
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
                    No contractors yet
                  </p>
                  <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
                    Contractors who register on HomeGentic will appear here.
                  </p>
                  <button
                    onClick={() => navigate("/dashboard")}
                    style={{
                      fontFamily: F.body, fontSize: 14, fontWeight: 700,
                      color: "#fff", background: C.blue, border: "none",
                      borderRadius: 100, padding: "10px 24px", cursor: "pointer",
                    }}
                  >
                    Back to dashboard
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 }}>
              {filtered.map((ctr) => (
                <ContractorCard
                  key={ctr.id}
                  contractor={ctr}
                  isAwaiting={awaitingSet.has(ctr.name)}
                  onViewProfile={() => navigate(`/contractor/${ctr.id}`)}
                  onRequestQuote={() =>
                    navigate("/quotes/new", {
                      state: {
                        prefill: {
                          serviceType:    ctr.specialties[0] ?? "",
                          contractorName: ctr.name,
                          zipCode:        ctr.serviceZips[0] ?? "",
                        },
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
