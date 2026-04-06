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
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const S = {
  ink:       COLORS.plum,
  inkLight:  COLORS.plumMid,
  rule:      COLORS.rule,
  sage:      COLORS.sage,
  sageLight: COLORS.sageLight,
  sageMid:   COLORS.sageMid,
  butter:    COLORS.butter,
  serif:     FONTS.serif,
  mono:      FONTS.mono,
  sans:      FONTS.sans,
};

// Urgency colors aligned with theme
const URGENCY_COLOR: Record<SystemEstimate["urgency"], string> = {
  Critical: "#C94C2E",
  Soon:     "#C97A2E",
  Watch:    COLORS.plumMid,
  Good:     COLORS.sage,
};

const URGENCY_BG: Record<SystemEstimate["urgency"], string> = {
  Critical: "#FEF2F2",
  Soon:     "#FFF8EE",
  Watch:    COLORS.white,
  Good:     COLORS.sageLight,
};

// ── Input form (shown when URL params are absent / invalid) ──────────────────

function EstimatorForm() {
  const [year, setYear]   = useState("");
  const [type, setType]   = useState("single-family");
  const [state, setState] = useState("");
  const CURRENT_YEAR      = new Date().getFullYear();

  const href = year
    ? buildEstimatorUrl({ yearBuilt: parseInt(year, 10), propertyType: type, state: state || undefined })
    : "#";

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "34rem" }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
            Free · No Account Required
          </div>

          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.75rem" }}>
            Home System Age Estimator
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
            Enter your home's year built to see estimated ages and urgency for all major systems — no account needed.
          </p>

          <div
            role="form"
            aria-label="Estimator inputs"
            style={{ background: COLORS.white, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "2rem", boxShadow: SHADOWS.card, display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Year Built *
              </span>
              <input
                type="number"
                min={1800}
                max={CURRENT_YEAR}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={String(CURRENT_YEAR - 20)}
                style={{ padding: "0.75rem 1rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.mono, fontSize: "0.9375rem", outline: "none", boxSizing: "border-box", background: COLORS.white, color: S.ink }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Property Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ padding: "0.75rem 1rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.9375rem", outline: "none", background: COLORS.white, color: S.ink, boxSizing: "border-box" }}
              >
                <option value="single-family">Single Family</option>
                <option value="condo">Condo / Townhouse</option>
                <option value="multi-family">Multi-Family</option>
                <option value="mobile">Mobile / Manufactured</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                State (optional — improves climate accuracy)
              </span>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="e.g. TX"
                maxLength={2}
                style={{ padding: "0.75rem 1rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.mono, fontSize: "0.9375rem", outline: "none", boxSizing: "border-box", background: COLORS.white, color: S.ink }}
              />
            </label>

            <Link
              to={href}
              style={{
                display: "block", textAlign: "center",
                padding: "0.875rem 1.5rem",
                background: year ? S.ink : S.rule, color: COLORS.white,
                fontFamily: S.sans, fontSize: "0.9375rem", fontWeight: 600,
                textDecoration: "none", borderRadius: RADIUS.pill,
                pointerEvents: year ? "auto" : "none",
                transition: "background 0.15s",
              }}
            >
              Estimate My Systems →
            </Link>
          </div>
        </div>
      </div>
      <PublicFooter />
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
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />

      <div style={{ flex: 1, maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem", width: "100%" }}>
        {/* Header */}
        <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
          Home System Estimator
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.6rem, 4vw, 2.25rem)", lineHeight: 1.05, color: S.ink, marginBottom: "0.5rem" }}>
          Systems for a {yearBuilt} Home{state ? ` in ${state}` : ""}
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2rem", lineHeight: 1.7, fontWeight: 300 }}>
          Estimated ages based on typical lifespans{state ? " adjusted for your climate" : ""}.
          {" "}
          {criticalCount > 0
            ? `${criticalCount} system${criticalCount > 1 ? "s" : ""} past expected lifespan.`
            : soonCount > 0
            ? `${soonCount} system${soonCount > 1 ? "s" : ""} approaching replacement.`
            : "All systems within expected lifespan."}
        </p>

        {/* System table */}
        <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden", marginBottom: "2rem", boxShadow: SHADOWS.card }}>
          {estimates.map((est, i) => (
            <div
              key={est.systemName}
              style={{
                display:             "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems:          "center",
                gap:                 "1rem",
                padding:             "1rem 1.5rem",
                borderBottom:        i < estimates.length - 1 ? `1px solid ${S.rule}` : "none",
                background:          URGENCY_BG[est.urgency],
              }}
            >
              {/* System name + age */}
              <div>
                <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.9375rem", color: S.ink, marginBottom: "0.25rem" }}>
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
                style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.04em", color: S.inkLight, textAlign: "right", whiteSpace: "nowrap" }}
              >
                ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
              </div>

              {/* Urgency badge */}
              <div
                role="status"
                aria-label={`urgency ${est.systemName}`}
                style={{
                  fontFamily:    S.mono,
                  fontSize:      "0.6rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         URGENCY_COLOR[est.urgency],
                  border:        `1px solid ${URGENCY_COLOR[est.urgency]}40`,
                  borderRadius:  RADIUS.pill,
                  padding:       "0.25rem 0.625rem",
                  whiteSpace:    "nowrap",
                  background:    COLORS.white,
                  fontWeight:    700,
                }}
              >
                {est.urgency}
              </div>
            </div>
          ))}
        </div>

        {/* §17.7.2 — Shareable URL */}
        <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "1.5rem", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Share2 size={14} color={S.inkLight} />
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Share this estimate
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={shareInput}
              aria-label="share url"
              readOnly
              value={shareUrl}
              style={{ flex: 1, padding: "0.5rem 0.875rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight, background: S.sageLight, outline: "none" }}
            />
            <button
              onClick={handleCopy}
              aria-label={copied ? "copied" : "copy share url"}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 1rem",
                background: copied ? COLORS.sage : S.ink, color: COLORS.white,
                border: "none", borderRadius: RADIUS.pill,
                cursor: "pointer", fontFamily: S.mono, fontSize: "0.65rem",
                letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "background 0.15s",
              }}
            >
              <Copy size={12} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* §17.7.3 + §17.7.5 — Track this property CTA */}
        <div style={{ background: S.ink, borderRadius: RADIUS.card, padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: COLORS.white, marginBottom: "0.375rem" }}>
              Track this property for free
            </div>
            <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: "rgba(253,252,250,0.7)", margin: 0, lineHeight: 1.7, fontWeight: 300 }}>
              Log real maintenance jobs, earn a HomeGentic Score, and get a verified report when you sell. Your {yearBuilt} home details are pre-filled.
            </p>
          </div>
          <Link
            to={registerHref}
            aria-label="Track this property"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              background: COLORS.sage, color: COLORS.white,
              fontFamily: S.sans, fontSize: "0.875rem", fontWeight: 600,
              textDecoration: "none", borderRadius: RADIUS.pill,
              alignSelf: "flex-start",
            }}
          >
            Track this property <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <PublicFooter />
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
