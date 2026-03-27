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

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

type SortBy = "trust" | "jobs";

const SPECIALTIES = ["All", "HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"];

function ContractorCard({ contractor, onClick }: { contractor: ContractorProfile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", border: `1px solid ${S.rule}`, cursor: "pointer", display: "flex", flexDirection: "column" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff"; }}
    >
      {/* Header */}
      <div style={{ background: S.ink, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "#7A7268", marginBottom: "0.25rem" }}>
            {contractor.specialty}
          </p>
          <h3 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", lineHeight: 1.2, color: S.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contractor.name}
          </h3>
          {contractor.serviceArea && (
            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: "#7A7268", marginTop: "0.2rem" }}>
              {contractor.serviceArea}
            </p>
          )}
        </div>
        <div style={{ width: "2.5rem", height: "2.5rem", border: `2px solid ${S.rust}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: "0.75rem" }}>
          <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "0.9rem", lineHeight: 1, color: S.paper }}>{contractor.trustScore}</span>
          <span style={{ fontFamily: S.mono, fontSize: "0.4rem", color: "#7A7268" }}>/100</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0.875rem 1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {contractor.isVerified && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.sage }}>
            <ShieldCheck size={11} /> Verified
          </div>
        )}
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.1rem" }}>Jobs</p>
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1 }}>{contractor.jobsCompleted}</p>
          </div>
          {contractor.licenseNumber && (
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.1rem" }}>License</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.ink }}>{contractor.licenseNumber}</p>
            </div>
          )}
        </div>
        {contractor.bio && (
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.03em", color: S.inkLight, lineHeight: 1.5, marginTop: "0.25rem" }}>
            {contractor.bio.length > 80 ? contractor.bio.slice(0, 80) + "…" : contractor.bio}
          </p>
        )}
      </div>

      <div style={{ padding: "0.625rem 1.25rem", borderTop: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.25rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
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
    contractorService.search().then(setContractors).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = contractors;
    if (specialty !== "All") list = list.filter((c) => c.specialty === specialty);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.specialty.toLowerCase().includes(q) ||
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
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
            Directory
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
            Find a Contractor
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.375rem" }}>
            Verified professionals with blockchain-backed job records
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 16rem", maxWidth: "24rem" }}>
            <Search size={13} color={S.inkLight} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, specialty, or area…"
              style={{ width: "100%", padding: "0.5rem 0.75rem 0.5rem 2.25rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.65rem", background: "#fff", boxSizing: "border-box" }}
            />
          </div>

          {/* Sort */}
          <div style={{ display: "flex", gap: "1px", background: S.rule }}>
            {(["trust", "jobs"] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{ padding: "0.5rem 1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer", background: sortBy === s ? S.ink : "#fff", color: sortBy === s ? "#F4F1EB" : S.inkLight }}
              >
                {s === "trust" ? "Trust Score" : "Jobs Done"}
              </button>
            ))}
          </div>
        </div>

        {/* Specialty filter */}
        <div style={{ display: "flex", gap: "1px", background: S.rule, marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {SPECIALTIES.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpecialty(sp)}
              style={{ padding: "0.4rem 0.875rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer", background: specialty === sp ? S.rust : "#fff", color: specialty === sp ? "#F4F1EB" : S.inkLight }}
            >
              {sp}
            </button>
          ))}
        </div>

        {/* Results count */}
        {!loading && (
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "1rem" }}>
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
          <div style={{ border: `1px dashed ${S.rule}`, padding: "4rem", textAlign: "center" }}>
            <Users size={40} color={S.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              No contractors found
            </p>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
              {query || specialty !== "All" ? "Try clearing your filters." : "No contractors are registered yet."}
            </p>
            {(query || specialty !== "All") && (
              <button
                onClick={() => { setQuery(""); setSpecialty("All"); }}
                style={{ marginTop: "1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1px", background: S.rule }}>
            {filtered.map((c) => (
              <ContractorCard key={c.id} contractor={c} onClick={() => navigate(`/contractor/${c.id}`)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
