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
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const CURRENT_YEAR = new Date().getFullYear();

// Reverse map: systemName → URL key
const SYSTEM_NAME_TO_URL_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_URL_KEYS).map(([k, v]) => [v, k])
);

const S = {
  ink:       COLORS.plum,
  inkLight:  COLORS.plumMid,
  rule:      COLORS.rule,
  sage:      COLORS.sage,
  sageLight: COLORS.sageLight,
  sageMid:   COLORS.sageMid,
  butter:    COLORS.butter,
  rust:      "#C94C2E",
  serif:     FONTS.serif,
  mono:      FONTS.mono,
  sans:      FONTS.sans,
};

const URGENCY_COLOR: Record<string, string> = {
  Critical: "#C94C2E",
  Soon:     "#C97A2E",
  Watch:    "#7A8C3E",
  Good:     "#3E7A5C",
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
        <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
          Free · No Account Required
        </div>

        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.75rem" }}>
          Instant home maintenance forecast
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
          Enter an address and year built to see which systems are aging, what replacements are coming, and your estimated 10-year maintenance budget.
        </p>

        <form onSubmit={handleSubmit} style={{ background: COLORS.white, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "2rem", boxShadow: SHADOWS.card, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="address" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
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
              style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, padding: "0.75rem 1rem", fontFamily: S.sans, fontSize: "0.9375rem", color: S.ink, background: COLORS.white, outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="yearBuilt" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
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
              style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, padding: "0.75rem 1rem", fontFamily: S.sans, fontSize: "0.9375rem", color: S.ink, background: COLORS.white, outline: "none" }}
            />
          </div>

          <button
            type="submit"
            style={{ padding: "0.875rem", background: S.ink, color: COLORS.white, border: "none", borderRadius: RADIUS.pill, fontFamily: S.sans, fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" }}
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

  // Save CTA URL
  const saveParams = new URLSearchParams({ address: input.address, yearBuilt: String(input.yearBuilt) });
  if (input.state) saveParams.set("state", input.state);
  const saveHref = `/properties/new?${saveParams.toString()}`;

  return (
    <div style={{ flex: 1, maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
          Instant Forecast
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.25rem, 3vw, 1.75rem)", color: S.ink, lineHeight: 1.1, marginBottom: "0.375rem" }}>
          {input.address}
        </h1>
        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
          Built {input.yearBuilt} · {CURRENT_YEAR - input.yearBuilt} years old
        </div>
      </div>

      {/* 10-year budget */}
      <div style={{ background: S.sageLight, border: `1px solid ${S.sageMid}`, borderRadius: RADIUS.card, padding: "1.25rem 1.75rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
          10-year budget
        </div>
        <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", color: tenYearBudget > 0 ? S.rust : S.ink }}>
          ${tenYearBudget.toLocaleString()}
        </div>
      </div>

      {/* Systems table */}
      <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden", boxShadow: SHADOWS.card }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.sans, fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: S.sageLight, borderBottom: `1px solid ${S.sageMid}` }}>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>System</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Last Replaced</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Age</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Status</th>
              <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, fontWeight: 400 }}>Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((est, i) => (
              <tr key={est.systemName} style={{ borderBottom: i < estimates.length - 1 ? `1px solid ${S.rule}` : "none", background: i % 2 === 0 ? COLORS.white : COLORS.sageLight }}>
                <td style={{ padding: "0.75rem 1rem", color: S.ink, fontWeight: 500, fontFamily: S.sans }}>
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
                    style={{ width: "5.5rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, padding: "0.3rem 0.5rem", fontFamily: S.mono, fontSize: "0.75rem", color: S.ink, background: COLORS.white, outline: "none" }}
                  />
                </td>
                <td style={{ padding: "0.75rem 1rem", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem" }}>
                  {est.ageYears} yrs
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLOR[est.urgency] ?? S.inkLight, fontWeight: 700 }}>
                    {est.urgency}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>
                  ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save CTA */}
      <div style={{ marginTop: "2rem", background: S.ink, borderRadius: RADIUS.card, padding: "1.75rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: "rgba(253,252,250,0.75)", margin: 0, lineHeight: 1.6, fontWeight: 300, flex: 1 }}>
          Create a free account to track maintenance, log jobs, and build buyer confidence.
        </p>
        <Link
          to={saveHref}
          style={{
            padding: "0.75rem 1.5rem", background: COLORS.sage, color: COLORS.white,
            fontFamily: S.sans, fontSize: "0.875rem", fontWeight: 600,
            textDecoration: "none", borderRadius: RADIUS.pill, flexShrink: 0,
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
        <meta property="og:title" content="Instant Maintenance Forecast | HomeGentic" />
        <meta property="og:description" content="Free instant home maintenance forecast. No login required." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/instant-forecast" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/instant-forecast" />
      </Helmet>
    <div style={{ minHeight: "100vh", background: COLORS.white, color: S.ink, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      {input ? <ForecastView input={input} /> : <EntryForm />}
      <PublicFooter />
    </div>
    </>
  );
}
