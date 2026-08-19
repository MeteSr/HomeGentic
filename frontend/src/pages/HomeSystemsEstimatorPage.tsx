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
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

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

// Urgency colors aligned with cobalt/yellow design system
const URGENCY_COLOR: Record<SystemEstimate["urgency"], string> = {
  Critical: C.coral,
  Soon:     "#FFB340",
  Watch:    C.muted,
  Good:     C.blue,
};

const URGENCY_BG: Record<SystemEstimate["urgency"], string> = {
  Critical: "rgba(255,92,57,0.07)",
  Soon:     "rgba(255,179,64,0.08)",
  Watch:    C.white,
  Good:     C.blueFg,
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
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "34rem" }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", background: C.blueFg, color: C.blue, padding: "5px 16px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", fontFamily: F.mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Free · No Account Required
          </div>

          <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: C.ink, marginBottom: "0.75rem" }}>
            Home System Age Estimator
          </h1>
          <p style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.muted, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
            Enter your home's year built to see estimated ages and urgency for all major systems — no account needed.
          </p>

          <div
            role="form"
            aria-label="Estimator inputs"
            style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: "24px", padding: "2rem", boxShadow: "0 4px 18px rgba(43,52,255,0.08)", display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                Year Built *
              </span>
              <input
                type="number"
                min={1800}
                max={CURRENT_YEAR}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={String(CURRENT_YEAR - 20)}
                style={{ padding: "0.75rem 1rem", border: `1.5px solid ${C.border}`, borderRadius: "10px", fontFamily: F.mono, fontSize: "0.9375rem", outline: "none", boxSizing: "border-box", background: C.white, color: C.ink }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                Property Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ padding: "0.75rem 1rem", border: `1.5px solid ${C.border}`, borderRadius: "10px", fontFamily: F.body, fontSize: "0.9375rem", outline: "none", background: C.white, color: C.ink, boxSizing: "border-box" }}
              >
                <option value="single-family">Single Family</option>
                <option value="condo">Condo / Townhouse</option>
                <option value="multi-family">Multi-Family</option>
                <option value="mobile">Mobile / Manufactured</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <span style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                State (optional — improves climate accuracy)
              </span>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="e.g. TX"
                maxLength={2}
                style={{ padding: "0.75rem 1rem", border: `1.5px solid ${C.border}`, borderRadius: "10px", fontFamily: F.mono, fontSize: "0.9375rem", outline: "none", boxSizing: "border-box", background: C.white, color: C.ink }}
              />
            </label>

            <Link
              to={href}
              style={{
                display: "block", textAlign: "center",
                padding: "0.875rem 1.5rem",
                background: year ? C.blue : C.border, color: C.white,
                fontFamily: F.body, fontSize: "0.9375rem", fontWeight: 600,
                textDecoration: "none", borderRadius: "100px",
                pointerEvents: year ? "auto" : "none",
                transition: "background 0.15s",
                boxShadow: year ? "0 4px 18px rgba(43,52,255,0.28)" : "none",
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

  const registerHref = `/dashboard`;

  const handleCopy = () => {
    if (shareInput.current) {
      shareInput.current.select();
      document.execCommand("copy");
    } else {
      navigator.clipboard?.writeText(shareUrl).catch(() => {}) // Clipboard API rejection is benign — the fallback execCommand already ran;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const criticalCount = estimates.filter((e) => e.urgency === "Critical").length;
  const soonCount     = estimates.filter((e) => e.urgency === "Soon").length;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", flexDirection: "column" }}>
      <PublicNav />

      <div style={{ flex: 1, maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem", width: "100%" }}>
        {/* Header */}
        <div style={{ display: "inline-flex", alignItems: "center", background: C.blueFg, color: C.blue, padding: "5px 16px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", fontFamily: F.mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Home System Estimator
        </div>
        <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(1.6rem, 4vw, 2.25rem)", lineHeight: 1.05, color: C.ink, marginBottom: "0.5rem" }}>
          Systems for a {yearBuilt} Home{state ? ` in ${state}` : ""}
        </h1>
        <p style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.muted, marginBottom: "2rem", lineHeight: 1.7, fontWeight: 300 }}>
          Estimated ages based on typical lifespans{state ? " adjusted for your climate" : ""}.
          {" "}
          {criticalCount > 0
            ? `${criticalCount} system${criticalCount > 1 ? "s" : ""} past expected lifespan.`
            : soonCount > 0
            ? `${soonCount} system${soonCount > 1 ? "s" : ""} approaching replacement.`
            : "All systems within expected lifespan."}
        </p>

        {/* System table */}
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: "24px", overflow: "hidden", marginBottom: "2rem", boxShadow: "0 4px 18px rgba(43,52,255,0.08)" }}>
          {estimates.map((est, i) => (
            <div
              key={est.systemName}
              style={{
                display:             "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems:          "center",
                gap:                 "1rem",
                padding:             "1rem 1.5rem",
                borderBottom:        i < estimates.length - 1 ? `1px solid ${C.border}` : "none",
                background:          URGENCY_BG[est.urgency],
              }}
            >
              {/* System name + age */}
              <div>
                <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.9375rem", color: C.ink, marginBottom: "0.25rem" }}>
                  {est.systemName}
                </div>
                <div style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: C.muted }}>
                  Installed {est.installYear} · {est.ageYears} yr{est.ageYears !== 1 ? "s" : ""} old
                  {est.yearsRemaining > 0
                    ? ` · ${est.yearsRemaining} yr${est.yearsRemaining !== 1 ? "s" : ""} remaining`
                    : " · past lifespan"}
                </div>
              </div>

              {/* Replacement cost */}
              <div
                aria-label={`replacement cost ${est.systemName}`}
                style={{ fontFamily: F.mono, fontSize: "0.7rem", letterSpacing: "0.04em", color: C.muted, textAlign: "right", whiteSpace: "nowrap" }}
              >
                ${est.replacementCostLow.toLocaleString()}–${est.replacementCostHigh.toLocaleString()}
              </div>

              {/* Urgency badge */}
              <div
                role="status"
                aria-label={`urgency ${est.systemName}`}
                style={{
                  fontFamily:    F.mono,
                  fontSize:      "0.6rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         URGENCY_COLOR[est.urgency],
                  border:        `1px solid ${URGENCY_COLOR[est.urgency]}40`,
                  borderRadius:  "100px",
                  padding:       "0.25rem 0.625rem",
                  whiteSpace:    "nowrap",
                  background:    C.white,
                  fontWeight:    700,
                }}
              >
                {est.urgency}
              </div>
            </div>
          ))}
        </div>

        {/* §17.7.2 — Shareable URL */}
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: "18px", padding: "1.5rem", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Share2 size={14} color={C.muted} />
            <span style={{ fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
              Share this estimate
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={shareInput}
              aria-label="share url"
              readOnly
              value={shareUrl}
              style={{ flex: 1, padding: "0.5rem 0.875rem", border: `1.5px solid ${C.border}`, borderRadius: "10px", fontFamily: F.mono, fontSize: "0.7rem", color: C.muted, background: C.blueFg, outline: "none" }}
            />
            <button
              onClick={handleCopy}
              aria-label={copied ? "copied" : "copy share url"}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 1rem",
                background: copied ? C.blue : C.ink, color: C.white,
                border: "none", borderRadius: "100px",
                cursor: "pointer", fontFamily: F.mono, fontSize: "0.65rem",
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
        <div style={{ background: C.ink, borderRadius: "24px", padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: "1.25rem", color: C.white, marginBottom: "0.375rem" }}>
              Track this property for free
            </div>
            <p style={{ fontFamily: F.body, fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.7, fontWeight: 300 }}>
              Log real maintenance jobs, earn a HomeGentic Score, and get a verified report when you sell. Your {yearBuilt} home details are pre-filled.
            </p>
          </div>
          <Link
            to={registerHref}
            aria-label="Track this property"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              background: C.yellow, color: C.ink,
              fontFamily: F.body, fontSize: "0.875rem", fontWeight: 700,
              textDecoration: "none", borderRadius: "100px",
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
