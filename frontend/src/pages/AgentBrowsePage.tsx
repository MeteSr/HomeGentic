/**
 * Agent browse page — /agents (Epic 9.6.1)
 *
 * Searchable, filterable directory of agent profiles.
 * Filter: state, HomeGentic-only toggle, max avg DOM.
 * Each card links to /agent/:id.
 */

import React, { useEffect, useState, useMemo } from "react";
import { Search, ShieldCheck, Star } from "lucide-react";
import { Layout } from "@/components/Layout";
import { agentService, AgentOnChainProfile } from "@/services/agent";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
  sans:     FONTS.sans,
};

function AgentCard({ agent }: { agent: AgentOnChainProfile }) {
  return (
    <a
      href={`/agent/${agent.id}`}
      style={{
        display: "block", textDecoration: "none", color: "inherit",
        border: `1px solid ${UI.rule}`, background: UI.paper,
        borderRadius: RADIUS.card, boxShadow: SHADOWS.card,
      }}
    >
      {/* Header */}
      <div style={{ background: UI.ink, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.2rem" }}>
            {agent.statesLicensed.join(", ")}
          </p>
          <h3 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1rem", lineHeight: 1.2, color: UI.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.name}
          </h3>
          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: COLORS.plumMid, marginTop: "0.2rem" }}>
            {agent.brokerage}
          </p>
        </div>
        <div style={{ width: "2.5rem", height: "2.5rem", border: `2px solid ${UI.sage}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: "0.75rem" }}>
          <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "0.9rem", lineHeight: 1, color: UI.paper }}>{agent.avgDaysOnMarket}</span>
          <span style={{ fontFamily: UI.mono, fontSize: "0.4rem", color: COLORS.plumMid }}>avg dom</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0.875rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>Listings (12mo)</p>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1, color: UI.ink }}>{agent.listingsLast12Months}</p>
          </div>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.1rem" }}>Typical Commission</p>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1, color: UI.ink }}>{(agent.typicalCommissionBps / 100).toFixed(2)}%</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
          {agent.isVerified && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage }}>
              <ShieldCheck size={11} /> HomeGentic Verified
            </span>
          )}
          {agent.homeGenticTransactionCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#1a5c3a" }}>
              <Star size={10} /> HomeGentic Verified Transaction
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "0.5rem 1.25rem", borderTop: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
        View profile →
      </div>
    </a>
  );
}

export default function AgentBrowsePage() {
  const [agents,     setAgents]     = useState<AgentOnChainProfile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [query,      setQuery]      = useState("");
  const [state,      setState]      = useState("All");
  const [homeGenticOnly, setHomeGenticOnly] = useState(false);
  const [userTier,   setUserTier]   = useState<PlanTier>("Free");

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((e) => console.error("[AgentBrowsePage] subscription load failed:", e));
    agentService.getAllProfiles().then(setAgents).catch((e) => console.error("[AgentBrowsePage] agents load failed:", e)).finally(() => setLoading(false));
  }, []);

  // Build state list from loaded agents
  const states = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => a.statesLicensed.forEach((s) => set.add(s)));
    return ["All", ...Array.from(set).sort()];
  }, [agents]);

  const filtered = useMemo(() => {
    let list = agents;
    if (state !== "All") list = list.filter((a) => a.statesLicensed.includes(state));
    if (homeGenticOnly) list = list.filter((a) => a.homeGenticTransactionCount > 0);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.brokerage.toLowerCase().includes(q) ||
        a.statesLicensed.some((s) => s.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => a.avgDaysOnMarket - b.avgDaysOnMarket);
  }, [agents, state, homeGenticOnly, query]);

  if (userTier === "Free") {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
          <UpgradeGate
            feature="Agent Marketplace &amp; FSBO"
            description="Selling your home? Upgrade to Pro to make agents compete for your listing — or go FSBO with our full toolkit."
            icon="🏡"
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.5rem" }}>
            Directory
          </div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
            Find an Agent
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.375rem" }}>
            Realtors with HomeGentic-verified transaction records
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
              placeholder="Search by name, brokerage, or state…"
              style={{ width: "100%", padding: "0.5rem 0.75rem 0.5rem 2.25rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.65rem", background: UI.paper, boxSizing: "border-box" }}
            />
          </div>

          {/* HomeGentic-only toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={homeGenticOnly}
              onChange={(e) => setHomeGenticOnly(e.target.checked)}
              aria-label="HomeGentic Only"
            />
            HomeGentic Only
          </label>
        </div>

        {/* State filter chips */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {states.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              style={{
                padding: "0.4rem 0.875rem",
                fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                border: "none", cursor: "pointer",
                background: state === s ? UI.ink : UI.paper,
                color:      state === s ? UI.paper : UI.inkLight,
                borderRadius: RADIUS.sm, boxShadow: SHADOWS.card,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>Loading…</p>
        )}

        {!loading && filtered.length === 0 && (
          <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>No agents match your filters.</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {!loading && (
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginTop: "1rem" }}>
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""} found
          </p>
        )}
      </div>
    </Layout>
  );
}
