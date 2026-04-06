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
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Flooring", "Painting", "Landscaping", "Windows", "Foundation", "Other"];

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

// ── Search form ───────────────────────────────────────────────────────────────

function SearchForm({ defaultService = "", defaultZip = "" }: { defaultService?: string; defaultZip?: string }) {
  const [service, setService] = useState(defaultService || SERVICE_TYPES[0]);
  const [zip, setZip]         = useState(defaultZip);

  const href = zip.trim() ? buildPriceLookupUrl(service, zip.trim()) : "#";

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "34rem" }}>
        {/* Eyebrow */}
        <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
          Price Intelligence
        </div>

        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.75rem" }}>
          Home repair cost lookup
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
          See real price benchmarks from closed bids in your zip code before you hire.
        </p>

        <div style={{ background: COLORS.white, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "2rem", boxShadow: SHADOWS.card, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Service Type
            </span>
            <select
              aria-label="service type"
              value={service}
              onChange={(e) => setService(e.target.value)}
              style={{
                padding: "0.75rem 1rem", border: `1px solid ${S.rule}`,
                borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.9375rem",
                outline: "none", background: COLORS.white, color: S.ink,
              }}
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
              style={{
                padding: "0.75rem 1rem", border: `1px solid ${S.rule}`,
                borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.9375rem",
                outline: "none", background: COLORS.white, color: S.ink,
              }}
            />
          </label>

          <Link
            to={href}
            style={{
              padding: "0.875rem", background: zip.trim() ? S.ink : S.rule, color: COLORS.white,
              textDecoration: "none", borderRadius: RADIUS.pill,
              fontFamily: S.sans, fontSize: "0.9375rem", fontWeight: 600,
              textAlign: "center", pointerEvents: zip.trim() ? "auto" : "none",
              transition: "background 0.15s",
            }}
          >
            Look Up Prices
          </Link>
        </div>

        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, textAlign: "center", marginTop: "1.25rem" }}>
          FREE · NO ACCOUNT REQUIRED
        </p>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div role="status" aria-label="loading" className="spinner-lg" />
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────

function BenchmarkResult({ result, service, zip }: { result: PriceBenchmarkResult; service: string; zip: string }) {
  const fmt = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");
  const sufficient = hasSufficientSamples(result);

  return (
    <div style={{ flex: 1, maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem", width: "100%" }}>
      {/* Eyebrow */}
      <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
        Price Benchmark · {zip}
      </div>

      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem, 4vw, 2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "2rem" }}>
        {service} in {zip}
      </h1>

      {!sufficient ? (
        <div style={{ padding: "1.75rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
          <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, lineHeight: 1.7, fontWeight: 300 }}>
            Not enough data — fewer than 5 closed bids on file for this zip code and service type.
          </p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden", boxShadow: SHADOWS.card }}>
          {/* Price range */}
          <div style={{ padding: "2rem", background: S.sageLight, borderBottom: `1px solid ${S.sageMid}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
              Typical Range
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.625rem" }}>
              <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2.25rem", color: S.ink }}>{fmt(result.low)}</span>
              <span style={{ fontFamily: S.mono, fontSize: "1rem", color: S.inkLight }}>–</span>
              <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2.25rem", color: S.ink }}>{fmt(result.high)}</span>
            </div>
          </div>
          {/* Median & meta */}
          <div style={{ padding: "1.25rem 2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>MEDIAN</span>
              <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>{fmt(result.median)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>SAMPLE SIZE</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>{result.sampleSize} bids</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>LAST UPDATED</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>{result.lastUpdated}</span>
            </div>
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

  const [result,   setResult]   = useState<PriceBenchmarkResult | null | undefined>(undefined);
  const [loading,  setLoading]  = useState(false);
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

  const showForm   = !service || !zip;
  const showResult = service && zip && !loading && result !== undefined && result !== null;
  const showNoData = service && zip && !loading && notFound;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />

      {showForm && <SearchForm defaultService={service} defaultZip={zip} />}
      {service && zip && loading && <LoadingState />}

      {showNoData && (
        <div style={{ flex: 1, maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem", width: "100%" }}>
          <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
            No Data
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem, 4vw, 2rem)", color: S.ink, marginBottom: "1rem" }}>
            {service} in {zip}
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, lineHeight: 1.7, fontWeight: 300, marginBottom: "1.5rem" }}>
            No data available for this combination yet.
          </p>
          <Link to="/prices" style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, textDecoration: "none" }}>
            ← Search another
          </Link>
        </div>
      )}

      {showResult && <BenchmarkResult result={result} service={service} zip={zip} />}

      <PublicFooter />
    </div>
  );
}
