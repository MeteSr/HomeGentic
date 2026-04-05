/**
 * §17.2 — Zero-Effort Onboarding: Instant Forecast
 * Route: /instant-forecast?address=...&yearBuilt=... (public, no login)
 *
 * Entry form when no params → forecast table when params present.
 * Each system row has an inline "Last replaced" input.
 * Changing an override updates the URL and re-runs estimates.
 * "Save your forecast" CTA → /properties/new?address=...&yearBuilt=...
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { COLORS, FONTS } from "@/theme";

const CURRENT_YEAR = new Date().getFullYear();

// Reverse map: systemName → URL key
const SYSTEM_NAME_TO_URL_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_URL_KEYS).map(([k, v]) => [v, k])
);

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  rust:     "#C94C2E",
  paper:    "#F4F1EB",
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

const URGENCY_COLOR: Record<string, string> = {
  Critical: "#C94C2E",
  Soon:     "#C97A2E",
  Watch:    "#7A8C3E",
  Good:     "#3E7A5C",
};

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div style={{ borderBottom: `1px solid ${S.rule}`, padding: "0.875rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Link to="/" style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.ink, textDecoration: "none", fontWeight: 700 }}>
        HomeGentic
      </Link>
      <Link to="/login" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none" }}>
        Sign in
      </Link>
    </div>
  );
}

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
    <div style={{ maxWidth: "32rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
        Free · No account required
      </div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem,4vw,2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "1rem" }}>
        Instant home maintenance forecast
      </h1>
      <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, marginBottom: "2rem" }}>
        Enter an address and year built to see which systems are aging, what replacements are coming, and your estimated 10-year maintenance budget.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <label htmlFor="address" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.ink }}>
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
            style={{ border: `1px solid ${S.rule}`, padding: "0.6rem 0.75rem", fontFamily: S.sans, fontSize: "0.9rem", color: S.ink, background: S.paper, outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <label htmlFor="yearBuilt" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.ink }}>
            Year Built {looking && <span style={{ color: S.inkLight }}>(looking up…)</span>}
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
            style={{ border: `1px solid ${S.rule}`, padding: "0.6rem 0.75rem", fontFamily: S.sans, fontSize: "0.9rem", color: S.ink, background: S.paper, outline: "none" }}
          />
        </div>

        <button
          type="submit"
          style={{ padding: "0.7rem 1.25rem", background: S.rust, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}
        >
          Get Forecast
        </button>
      </form>
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

  // Save CTA URL
  const saveParams = new URLSearchParams({ address: input.address, yearBuilt: String(input.yearBuilt) });
  if (input.state) saveParams.set("state", input.state);
  const saveHref = `/properties/new?${saveParams.toString()}`;

  return (
    <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.4rem" }}>
          Instant Forecast
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.25rem,3vw,1.75rem)", color: S.ink, lineHeight: 1.1, marginBottom: "0.25rem" }}>
          {input.address}
        </h1>
        <div style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.inkLight }}>
          Built {input.yearBuilt} · {CURRENT_YEAR - input.yearBuilt} years old
        </div>
      </div>

      {/* 10-year budget */}
      <div style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight }}>
          10-year budget
        </div>
        <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: tenYearBudget > 0 ? S.rust : S.ink }}>
          ${tenYearBudget.toLocaleString()}
        </div>
      </div>

      {/* Systems table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.sans, fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${S.rule}` }}>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>System</th>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Last Replaced</th>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Age</th>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Status</th>
            <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          {estimates.map((est) => (
            <tr key={est.systemName} style={{ borderBottom: `1px solid ${S.rule}` }}>
              <td style={{ padding: "0.6rem 0.75rem", color: S.ink, fontWeight: 500 }}>
                {est.systemName}
              </td>
              <td style={{ padding: "0.6rem 0.75rem" }}>
                <input
                  aria-label={`Last replaced — ${est.systemName}`}
                  type="number"
                  value={overrides[est.systemName] ?? est.installYear}
                  onChange={(e) => handleOverrideChange(est.systemName, e.target.value)}
                  min={input.yearBuilt}
                  max={CURRENT_YEAR}
                  style={{ width: "5rem", border: `1px solid ${S.rule}`, padding: "0.25rem 0.4rem", fontFamily: S.mono, fontSize: "0.75rem", color: S.ink, background: "#fff", outline: "none" }}
                />
              </td>
              <td style={{ padding: "0.6rem 0.75rem", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem" }}>
                {est.ageYears} yrs
              </td>
              <td style={{ padding: "0.6rem 0.75rem" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLOR[est.urgency] ?? S.inkLight, fontWeight: 700 }}>
                  {est.urgency}
                </span>
              </td>
              <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>
                ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Save CTA */}
      <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.inkLight, margin: 0 }}>
          Create a free account to track maintenance, log jobs, and build buyer confidence.
        </p>
        <Link
          to={saveHref}
          style={{ padding: "0.6rem 1.1rem", background: S.rust, color: "#fff", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", textDecoration: "none", flexShrink: 0, marginLeft: "1.5rem" }}
        >
          Save your forecast
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
    <div style={{ minHeight: "100vh", background: S.paper, color: S.ink }}>
      <TopBar />
      {input ? <ForecastView input={input} /> : <EntryForm />}
    </div>
  );
}
