/**
 * §17.2 — Zero-Effort Onboarding: Instant Forecast
 * Route: /instant-forecast?address=...&yearBuilt=... (public, no login)
 *
 * Entry form when no params → forecast table when params present.
 * Each system row has an inline "Last replaced" input.
 * Changing an override updates the URL and re-runs estimates.
 * "Save your forecast" CTA → /dashboard (modal auto-opens for new users)
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  computeTenYearBudget,
  parseForecastParams,
  lookupYearBuilt,
  type ForecastInput,
} from "@/services/instantForecast";
import {
  estimateSystems,
  type SystemEstimate,
  SYSTEM_URL_KEYS,
} from "@/services/systemAgeEstimator";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const CURRENT_YEAR = new Date().getFullYear();

// Reverse map: systemName → URL key
const SYSTEM_NAME_TO_URL_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_URL_KEYS).map(([k, v]) => [v, k])
);

const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

const URGENCY_COLOR: Record<string, string> = {
  Critical: C.coral,
  Soon:     "#FFB340",
  Watch:    C.muted,
  Good:     C.blue,
};

// ── Entry form (no params) ────────────────────────────────────────────────────

function EntryForm() {
  const navigate  = useNavigate();
  const [address, setAddress]   = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [looking, setLooking]   = useState(false);

  async function handleAddressBlur() {
    if (!address.trim() || yearBuilt) return;
    setLooking(true);
    const yr = await lookupYearBuilt(address.trim());
    if (yr) setYearBuilt(String(yr));
    setLooking(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim() || !yearBuilt) return;
    const p = new URLSearchParams({ address: address.trim(), yearBuilt });
    navigate(`/instant-forecast?${p.toString()}`);
  }

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "34rem" }}>
        {/* Eyebrow */}
        <div style={{ display: "inline-flex", alignItems: "center", background: C.blueFg, color: C.blue, padding: "5px 16px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", fontFamily: F.mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Free · No Account Required
        </div>

        <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: C.ink, marginBottom: "0.75rem" }}>
          Instant home maintenance forecast
        </h1>
        <p style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.muted, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
          Enter an address and year built to see which systems are aging, what replacements are coming, and your estimated 10-year maintenance budget.
        </p>

        <form onSubmit={handleSubmit} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: "24px", padding: "2rem", boxShadow: "0 4px 18px rgba(43,52,255,0.08)", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="address" style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
              Address
            </label>
            <input
              id="address"
              aria-label="Address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={handleAddressBlur}
              placeholder="123 Main St, Daytona Beach, FL"
              style={{ border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "0.75rem 1rem", fontFamily: F.body, fontSize: "0.9375rem", color: C.ink, background: C.white, outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="yearBuilt" style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
              Year Built {looking && <span style={{ color: C.muted }}>(looking up…)</span>}
            </label>
            <input
              id="yearBuilt"
              aria-label="Year Built"
              type="number"
              value={yearBuilt}
              onChange={(e) => setYearBuilt(e.target.value)}
              placeholder="e.g. 1985"
              min="1800"
              max={String(CURRENT_YEAR)}
              style={{ border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "0.75rem 1rem", fontFamily: F.body, fontSize: "0.9375rem", color: C.ink, background: C.white, outline: "none" }}
            />
          </div>

          <button
            type="submit"
            style={{ padding: "0.875rem", background: C.blue, color: C.white, border: "none", borderRadius: "100px", fontFamily: F.body, fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 18px rgba(43,52,255,0.28)" }}
          >
            Get Forecast →
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Forecast view (with params) ───────────────────────────────────────────────

function ForecastView({ input }: { input: ForecastInput }) {
  const navigate = useNavigate();
  const [overrides, setOverrides] = useState<Partial<Record<string, number>>>(
    input.systemOverrides ?? {}
  );

  const estimates: SystemEstimate[] = estimateSystems(input.yearBuilt, input.state, overrides);
  const tenYearBudget = computeTenYearBudget(estimates);

  function handleOverrideChange(systemName: string, rawValue: string) {
    const year = parseInt(rawValue, 10);
    const next = { ...overrides };
    if (!rawValue || isNaN(year)) {
      delete next[systemName];
    } else {
      next[systemName] = year;
    }
    setOverrides(next);

    // Update URL to reflect new overrides
    const p = new URLSearchParams({ address: input.address, yearBuilt: String(input.yearBuilt) });
    if (input.state) p.set("state", input.state);
    for (const [name, yr] of Object.entries(next)) {
      const urlKey = SYSTEM_NAME_TO_URL_KEY[name];
      if (urlKey) p.set(urlKey, String(yr));
    }
    navigate(`/instant-forecast?${p.toString()}`, { replace: true });
  }

  const saveHref = `/dashboard`;

  return (
    <div style={{ flex: 1, maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", background: C.blueFg, color: C.blue, padding: "5px 16px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", fontFamily: F.mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Instant Forecast
        </div>
        <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(1.25rem, 3vw, 1.75rem)", color: C.ink, lineHeight: 1.1, marginBottom: "0.375rem" }}>
          {input.address}
        </h1>
        <div style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: C.muted }}>
          Built {input.yearBuilt} · {CURRENT_YEAR - input.yearBuilt} years old
        </div>
      </div>

      {/* 10-year budget */}
      <div style={{ background: C.blueFg, border: `1.5px solid ${C.border}`, borderRadius: "18px", padding: "1.25rem 1.75rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: F.mono, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
          10-year budget
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.75rem", color: tenYearBudget > 0 ? C.coral : C.ink }}>
          ${tenYearBudget.toLocaleString()}
        </div>
      </div>

      {/* Systems table */}
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: "24px", overflow: "hidden", boxShadow: "0 4px 18px rgba(43,52,255,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.body, fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: C.blueFg, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: F.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 400 }}>System</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: F.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 400 }}>Last Replaced</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: F.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 400 }}>Age</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: F.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 400 }}>Status</th>
              <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontFamily: F.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 400 }}>Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((est, i) => (
              <tr key={est.systemName} style={{ borderBottom: i < estimates.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 0 ? C.white : C.blueFg }}>
                <td style={{ padding: "0.75rem 1rem", color: C.ink, fontWeight: 500, fontFamily: F.body }}>
                  {est.systemName}
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <input
                    aria-label={`Last replaced — ${est.systemName}`}
                    type="number"
                    value={overrides[est.systemName] ?? est.installYear}
                    onChange={(e) => handleOverrideChange(est.systemName, e.target.value)}
                    min={input.yearBuilt}
                    max={CURRENT_YEAR}
                    style={{ width: "5.5rem", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "0.3rem 0.5rem", fontFamily: F.mono, fontSize: "0.75rem", color: C.ink, background: C.white, outline: "none" }}
                  />
                </td>
                <td style={{ padding: "0.75rem 1rem", color: C.muted, fontFamily: F.mono, fontSize: "0.75rem" }}>
                  {est.ageYears} yrs
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <span style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLOR[est.urgency] ?? C.muted, fontWeight: 700 }}>
                    {est.urgency}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: F.mono, fontSize: "0.75rem", color: C.muted }}>
                  ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save CTA */}
      <div style={{ marginTop: "2rem", background: C.ink, borderRadius: "24px", padding: "1.75rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
        <p style={{ fontFamily: F.body, fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6, fontWeight: 300, flex: 1 }}>
          Create a free account to track maintenance, log jobs, and build buyer confidence.
        </p>
        <Link
          to={saveHref}
          style={{
            padding: "0.75rem 1.5rem", background: C.yellow, color: C.ink,
            fontFamily: F.body, fontSize: "0.875rem", fontWeight: 700,
            textDecoration: "none", borderRadius: "100px", flexShrink: 0,
          }}
        >
          Save your forecast →
        </Link>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InstantForecastPage() {
  const [searchParams] = useSearchParams();
  const input = parseForecastParams(searchParams);

  return (
    <>
      <Helmet>
        <title>Instant Maintenance Forecast | HomeGentic</title>
        <meta name="description" content="Get a free instant forecast of your home's upcoming maintenance costs. Enter your address and year built — no login required." />
        <meta property="og:title" content="Instant Maintenance Forecast | HomeGentic™" />
        <meta property="og:description" content="Free instant home maintenance forecast. No login required." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/instant-forecast" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/instant-forecast" />
      </Helmet>
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      {input ? <ForecastView input={input} /> : <EntryForm />}
      <PublicFooter />
    </div>
    </>
  );
}
