/**
 * §17.7 — Public System Age Estimator
 *
 * Route: /home-systems?yearBuilt=1998&type=single-family&state=TX
 * No login required. Shows estimated age and urgency for all 9 home systems
 * based on year built alone. Shareable URL + sign-up CTA.
 */

import React, { useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Share2, Copy, ArrowRight } from "lucide-react";
import {
  parseEstimatorParams,
  buildEstimatorUrl,
  estimateSystems,
  type SystemEstimate,
} from "@/services/systemAgeEstimator";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

const URGENCY_COLOR: Record<SystemEstimate["urgency"], string> = {
  Critical: "#dc2626",
  Soon:     "#d97706",
  Watch:    "#2563eb",
  Good:     "#16a34a",
};

const URGENCY_BG: Record<SystemEstimate["urgency"], string> = {
  Critical: "#fef2f2",
  Soon:     "#fffbeb",
  Watch:    "#eff6ff",
  Good:     "#f0fdf4",
};

// ── Input form (shown when URL params are absent / invalid) ──────────────────

function EstimatorForm() {
  const [year, setYear]       = useState("");
  const [type, setType]       = useState("single-family");
  const [state, setState]     = useState("");
  const CURRENT_YEAR          = new Date().getFullYear();

  const href = year
    ? buildEstimatorUrl({ yearBuilt: parseInt(year, 10), propertyType: type, state: state || undefined })
    : "#";

  return (
    <div
      role="form"
      aria-label="Estimator inputs"
      style={{
        maxWidth: "28rem",
        margin: "3rem auto",
        padding: "2rem",
        border: `1px solid ${S.rule}`,
        background: COLORS.white,
      }}
    >
      <h1
        style={{
          fontFamily: S.serif,
          fontWeight: 900,
          fontSize: "1.6rem",
          lineHeight: 1.1,
          marginBottom: "0.5rem",
          color: S.ink,
        }}
      >
        Home System Age Estimator
      </h1>
      <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.5rem" }}>
        Enter your home's year built to see estimated ages and urgency for all major systems — no account needed.
      </p>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.375rem" }}>
          Year Built *
        </span>
        <input
          type="number"
          min={1800}
          max={CURRENT_YEAR}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder={String(CURRENT_YEAR - 20)}
          style={{ width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.375rem" }}>
          Property Type
        </span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", outline: "none", background: COLORS.white, boxSizing: "border-box" }}
        >
          <option value="single-family">Single Family</option>
          <option value="condo">Condo / Townhouse</option>
          <option value="multi-family">Multi-Family</option>
          <option value="mobile">Mobile / Manufactured</option>
        </select>
      </label>

      <label style={{ display: "block", marginBottom: "1.5rem" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.375rem" }}>
          State (optional — improves climate accuracy)
        </span>
        <input
          type="text"
          value={state}
          onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="e.g. TX"
          maxLength={2}
          style={{ width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
        />
      </label>

      <Link
        to={href}
        style={{
          display: "block",
          textAlign: "center",
          padding: "0.75rem 1.5rem",
          background: year ? S.ink : S.rule,
          color: COLORS.white,
          fontFamily: S.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textDecoration: "none",
          pointerEvents: year ? "auto" : "none",
        }}
      >
        Estimate My Systems →
      </Link>
    </div>
  );
}

// ── Results page ─────────────────────────────────────────────────────────────

function EstimatorResults({ yearBuilt, propertyType, state }: { yearBuilt: number; propertyType: string; state?: string }) {
  const estimates  = estimateSystems(yearBuilt, state);
  const shareUrl   = `${typeof window !== "undefined" ? window.location.origin : ""}${buildEstimatorUrl({ yearBuilt, propertyType, state })}`;
  const shareInput = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const registerHref = (() => {
    const p = new URLSearchParams({ yearBuilt: String(yearBuilt), type: propertyType });
    return `/properties/new?${p.toString()}`;
  })();

  const handleCopy = () => {
    if (shareInput.current) {
      shareInput.current.select();
      document.execCommand("copy");
    } else {
      navigator.clipboard?.writeText(shareUrl).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const criticalCount = estimates.filter((e) => e.urgency === "Critical").length;
  const soonCount     = estimates.filter((e) => e.urgency === "Soon").length;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${S.rule}`, padding: "0.875rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          to="/"
          style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none" }}
        >
          HomeGentic
        </Link>
        <Link
          to="/login"
          style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.ink, textDecoration: "none" }}
        >
          Sign in
        </Link>
      </div>

      <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Header */}
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
          Home System Estimator
        </div>
        <h1
          style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.6rem,4vw,2.4rem)", lineHeight: 1.05, color: S.ink, marginBottom: "0.5rem" }}
        >
          Systems for a {yearBuilt} Home
          {state ? ` in ${state}` : ""}
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.75rem" }}>
          Estimated ages based on typical lifespans{state ? " adjusted for your climate" : ""}.
          {" "}
          {criticalCount > 0
            ? `${criticalCount} system${criticalCount > 1 ? "s" : ""} past expected lifespan.`
            : soonCount > 0
            ? `${soonCount} system${soonCount > 1 ? "s" : ""} approaching replacement.`
            : "All systems within expected lifespan."}
        </p>

        {/* System table */}
        <div style={{ border: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
          {estimates.map((est, i) => (
            <div
              key={est.systemName}
              style={{
                display:       "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems:    "center",
                gap:           "1rem",
                padding:       "0.875rem 1.25rem",
                borderBottom:  i < estimates.length - 1 ? `1px solid ${S.rule}` : "none",
                background:    URGENCY_BG[est.urgency],
              }}
            >
              {/* System name + age */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: S.ink, marginBottom: "0.2rem" }}>
                  {est.systemName}
                </div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight }}>
                  Installed {est.installYear} · {est.ageYears} yr{est.ageYears !== 1 ? "s" : ""} old
                  {est.yearsRemaining > 0
                    ? ` · ${est.yearsRemaining} yr${est.yearsRemaining !== 1 ? "s" : ""} remaining`
                    : " · past lifespan"}
                </div>
              </div>

              {/* Replacement cost */}
              <div
                aria-label={`replacement cost ${est.systemName}`}
                style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight, textAlign: "right", whiteSpace: "nowrap" }}
              >
                ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
              </div>

              {/* Urgency badge */}
              <div
                role="status"
                aria-label={`urgency ${est.systemName}`}
                style={{
                  fontFamily:      S.mono,
                  fontSize:        "0.55rem",
                  letterSpacing:   "0.12em",
                  textTransform:   "uppercase",
                  color:           URGENCY_COLOR[est.urgency],
                  border:          `1px solid ${URGENCY_COLOR[est.urgency]}`,
                  padding:         "0.2rem 0.5rem",
                  whiteSpace:      "nowrap",
                  background:      COLORS.white,
                }}
              >
                {est.urgency}
              </div>
            </div>
          ))}
        </div>

        {/* §17.7.2 — Shareable URL */}
        <div
          style={{ border: `1px solid ${S.rule}`, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Share2 size={14} color={S.inkLight} />
            <span
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}
            >
              Share this estimate
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={shareInput}
              aria-label="share url"
              readOnly
              value={shareUrl}
              style={{ flex: 1, padding: "0.4rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight, background: COLORS.white, outline: "none" }}
            />
            <button
              onClick={handleCopy}
              aria-label={copied ? "copied" : "copy share url"}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${S.rule}`, background: COLORS.white, cursor: "pointer", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: copied ? S.sage : S.ink }}
            >
              <Copy size={12} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* §17.7.3 + §17.7.5 — Track this property CTA */}
        <div
          style={{
            background: COLORS.sageLight,
            border:     `1px solid ${COLORS.sageMid}`,
            padding:    "1.5rem",
            display:    "flex",
            flexDirection: "column",
            gap:        "0.875rem",
          }}
        >
          <div>
            <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, marginBottom: "0.375rem" }}>
              Track this property for free
            </div>
            <p style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.inkLight, margin: 0 }}>
              Log real maintenance jobs, earn a HomeGentic Score, and get a verified report when you sell. Your {yearBuilt} home details are pre-filled.
            </p>
          </div>
          <Link
            to={registerHref}
            aria-label="Track this property"
            style={{
              display:         "inline-flex",
              alignItems:      "center",
              gap:             "0.5rem",
              padding:         "0.625rem 1.25rem",
              background:      S.ink,
              color:           COLORS.white,
              fontFamily:      S.mono,
              fontSize:        "0.7rem",
              letterSpacing:   "0.1em",
              textTransform:   "uppercase",
              textDecoration:  "none",
              alignSelf:       "flex-start",
            }}
          >
            Track this property
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Page entry point ─────────────────────────────────────────────────────────

export default function HomeSystemsEstimatorPage() {
  const [searchParams] = useSearchParams();
  const input = parseEstimatorParams(searchParams);

  if (!input) return <EstimatorForm />;

  return (
    <EstimatorResults
      yearBuilt={input.yearBuilt}
      propertyType={input.propertyType}
      state={input.state}
    />
  );
}
