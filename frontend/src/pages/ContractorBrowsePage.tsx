/**
 * Contractor browse page — /contractors
 *
 * Searchable, filterable directory of all contractors.
 * Specialty filter chips + sort by trust score or jobs completed.
 * Each card links to /contractor/:id (public profile).
 */

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShieldCheck, ArrowRight, Users } from "lucide-react";
import { Layout } from "@/components/Layout";
import { contractorService, ContractorProfile } from "@/services/contractor";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

type SortBy = "trust" | "jobs";

const SPECIALTIES = ["All", "HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"];

function ContractorCard({ contractor, onClick }: { contractor: ContractorProfile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: COLORS.white, border: `1px solid ${UI.rule}`, cursor: "pointer", display: "flex", flexDirection: "column", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.blush; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.white; }}
    >
      {/* Header */}
      <div style={{ background: UI.ink, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.25rem" }}>
            {contractor.specialties.join(" · ") || "—"}
          </p>
          <h3 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1rem", lineHeight: 1.2, color: UI.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contractor.name}
          </h3>
          {contractor.serviceArea && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: COLORS.plumMid, marginTop: "0.2rem" }}>
              {contractor.serviceArea}
            </p>
          )}
        </div>
        <div style={{ width: "2.5rem", height: "2.5rem", border: `2px solid ${UI.rust}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: "0.75rem" }}>
          <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "0.9rem", lineHeight: 1, color: UI.paper }}>{contractor.trustScore}</span>
          <span style={{ fontFamily: UI.mono, fontSize: "0.4rem", color: COLORS.plumMid }}>/100</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0.875rem 1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {contractor.isVerified && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage }}>
            <ShieldCheck size={11} /> Verified
          </div>
        )}
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>Jobs</p>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1 }}>{contractor.jobsCompleted}</p>
          </div>
          {contractor.licenseNumber && (
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>License</p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>{contractor.licenseNumber}</p>
            </div>
          )}
        </div>
        {contractor.bio && (
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.03em", color: UI.inkLight, lineHeight: 1.5, marginTop: "0.25rem" }}>
            {contractor.bio.length > 80 ? contractor.bio.slice(0, 80) + "…" : contractor.bio}
          </p>
        )}
      </div>

      <div style={{ padding: "0.625rem 1.25rem", borderTop: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
        View profile <ArrowRight size={10} />
      </div>
    </div>
  );
}

export default function ContractorBrowsePage() {
  const navigate = useNavigate();
  const [contractors, setContractors] = useState<ContractorProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [query,       setQuery]       = useState("");
  const [specialty,   setSpecialty]   = useState("All");
  const [sortBy,      setSortBy]      = useState<SortBy>("trust");

  useEffect(() => {
    contractorService.search().then(setContractors).catch((e) => console.error("[ContractorBrowsePage] load failed:", e)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = contractors;
    if (specialty !== "All") list = list.filter((c) => c.specialties.includes(specialty));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.specialties.some((s) => s.toLowerCase().includes(q)) ||
        (c.serviceArea ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      sortBy === "trust"
        ? b.trustScore - a.trustScore
        : b.jobsCompleted - a.jobsCompleted
    );
  }, [contractors, specialty, query, sortBy]);

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
            Directory
          </div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
            Find a Contractor
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.375rem" }}>
            Verified professionals with blockchain-backed job records
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 16rem", maxWidth: "24rem" }}>
            <Search size={13} color={UI.inkLight} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, specialty, or area…"
              style={{ width: "100%", padding: "0.5rem 0.75rem 0.5rem 2.25rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.65rem", background: COLORS.white, boxSizing: "border-box" }}
            />
          </div>

          {/* Sort */}
          <div style={{ display: "flex", gap: "1rem" }}>
            {(["trust", "jobs"] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{ padding: "0.5rem 1rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer", background: sortBy === s ? UI.ink : COLORS.white, color: sortBy === s ? COLORS.white : UI.inkLight, borderRadius: RADIUS.sm, boxShadow: SHADOWS.card }}
              >
                {s === "trust" ? "Trust Score" : "Jobs Done"}
              </button>
            ))}
          </div>
        </div>

        {/* Specialty filter */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {SPECIALTIES.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpecialty(sp)}
              style={{ padding: "0.4rem 0.875rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer", background: specialty === sp ? UI.rust : COLORS.white, color: specialty === sp ? COLORS.white : UI.inkLight, borderRadius: RADIUS.sm, boxShadow: SHADOWS.card }}
            >
              {sp}
            </button>
          ))}
        </div>

        {/* Results count */}
        {!loading && (
          <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "1rem" }}>
            {filtered.length} contractor{filtered.length !== 1 ? "s" : ""}
            {specialty !== "All" ? ` · ${specialty}` : ""}
            {query.trim() ? ` matching "${query.trim()}"` : ""}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ border: `1px dashed ${UI.rule}`, padding: "4rem", textAlign: "center" }}>
            <Users size={40} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              No contractors found
            </p>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
              {query || specialty !== "All" ? "Try clearing your filters." : "No contractors are registered yet."}
            </p>
            {(query || specialty !== "All") && (
              <button
                onClick={() => { setQuery(""); setSpecialty("All"); }}
                style={{ marginTop: "1rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${UI.rule}`, background: "none", cursor: "pointer", color: UI.inkLight }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1rem" }}>
            {filtered.map((c) => (
              <ContractorCard key={c.id} contractor={c} onClick={() => navigate(`/contractor/${c.id}`)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
