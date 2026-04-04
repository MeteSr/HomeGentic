/**
 * §17.1.4 — Public price lookup page
 * Route: /prices?service=Roofing&zip=32114 (no login required)
 *
 * Shows benchmark range with confidence indicator.
 * §17.1.5 — "Not enough data" message when sampleSize < 5.
 */

import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getPriceBenchmark,
  hasSufficientSamples,
  buildPriceLookupUrl,
  type PriceBenchmarkResult,
} from "@/services/priceBenchmark";
import { COLORS, FONTS } from "@/theme";

const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Flooring", "Painting", "Landscaping", "Windows", "Foundation", "Other"];

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div style={{ borderBottom: `1px solid ${S.rule}`, padding: "0.875rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Link to="/" style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.ink, textDecoration: "none", fontWeight: 700 }}>
        HomeFax
      </Link>
      <Link to="/login" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none" }}>
        Sign in
      </Link>
    </div>
  );
}

// ── Search form ───────────────────────────────────────────────────────────────

function SearchForm({ defaultService = "", defaultZip = "" }: { defaultService?: string; defaultZip?: string }) {
  const [service, setService] = useState(defaultService || SERVICE_TYPES[0]);
  const [zip, setZip]         = useState(defaultZip);

  const href = zip.trim() ? buildPriceLookupUrl(service, zip.trim()) : "#";

  return (
    <div style={{ maxWidth: "32rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
        Price Intelligence
      </div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem,4vw,2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "1.5rem" }}>
        Home repair cost lookup
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Service Type
          </span>
          <select
            aria-label="service type"
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{ padding: "0.625rem 0.875rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.9rem", outline: "none", background: COLORS.white }}
          >
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Zip Code
          </span>
          <input
            aria-label="zip code"
            type="text"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="32114"
            maxLength={10}
            style={{ padding: "0.625rem 0.875rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.9rem", outline: "none" }}
          />
        </label>

        <Link
          to={href}
          style={{
            padding: "0.75rem", background: zip.trim() ? S.ink : S.rule, color: COLORS.white,
            textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.12em",
            textTransform: "uppercase", textAlign: "center",
            pointerEvents: zip.trim() ? "auto" : "none",
          }}
        >
          Look Up Prices
        </Link>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <div role="status" aria-label="loading" className="spinner-lg" />
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────

function BenchmarkResult({ result, service, zip }: { result: PriceBenchmarkResult; service: string; zip: string }) {
  const fmt = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");
  const sufficient = hasSufficientSamples(result);

  return (
    <div style={{ maxWidth: "36rem", margin: "3rem auto", padding: "0 1.5rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
        Price Benchmark · {zip}
      </div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1.1, color: S.ink, marginBottom: "1.5rem" }}>
        {service} in {zip}
      </h1>

      {!sufficient ? (
        <div style={{ padding: "1.5rem", border: `1px solid ${S.rule}` }}>
          <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>
            Not enough data — fewer than 5 closed bids on file for this zip code and service type.
          </p>
        </div>
      ) : (
        <div style={{ padding: "1.5rem", border: `1px solid ${S.rule}`, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", color: S.ink }}>{fmt(result.low)}</span>
            <span style={{ fontFamily: S.mono, fontSize: "0.8rem", color: S.inkLight }}>–</span>
            <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", color: S.ink }}>{fmt(result.high)}</span>
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
            Median: {fmt(result.median)}
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
            Based on {result.sampleSize} closed bids · Last updated {result.lastUpdated}
          </div>
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <Link
          to="/prices"
          style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none" }}
        >
          ← Search another
        </Link>
      </div>
    </div>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────────

export default function PriceLookupPage() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get("service") ?? "";
  const zip     = searchParams.get("zip") ?? "";

  const [result,  setResult]  = useState<PriceBenchmarkResult | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!service || !zip) return;
    setLoading(true);
    setNotFound(false);
    setResult(undefined);
    getPriceBenchmark(service, zip)
      .then((r) => {
        if (r === null) setNotFound(true);
        else setResult(r);
      })
      .finally(() => setLoading(false));
  }, [service, zip]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      <TopBar />

      {/* No params — show search form */}
      {(!service || !zip) && <SearchForm defaultService={service} defaultZip={zip} />}

      {/* Loading */}
      {service && zip && loading && <LoadingState />}

      {/* No data from relay */}
      {service && zip && !loading && notFound && (
        <div style={{ maxWidth: "36rem", margin: "3rem auto", padding: "0 1.5rem" }}>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: S.ink, marginBottom: "1rem" }}>
            {service} in {zip}
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>
            No data available for this combination.
          </p>
          <Link to="/prices" style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none", marginTop: "1.5rem", display: "inline-block" }}>
            ← Search another
          </Link>
        </div>
      )}

      {/* Result */}
      {service && zip && !loading && result !== undefined && result !== null && (
        <BenchmarkResult result={result} service={service} zip={zip} />
      )}
    </div>
  );
}
