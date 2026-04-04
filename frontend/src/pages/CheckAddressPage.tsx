/**
 * §17.4.1 — Public address search for HomeFax reports
 * §17.4.2 — Buyer report request form (no report on file)
 * §17.4.4 — document.title set with address for SEO
 * §17.4.5 — Seller CTA when no report found
 *
 * Route: /check?address=... (public, no login required)
 */

import React, { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Shield, Search, ArrowRight, CheckCircle } from "lucide-react";
import { lookupReport, submitReportRequest, type BuyerLookupResult } from "@/services/buyerLookup";
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

// ── Top bar (shared) ──────────────────────────────────────────────────────────

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

// ── Address search form ───────────────────────────────────────────────────────

function SearchForm() {
  const [address, setAddress] = useState("");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (!address.trim()) return;
    navigate(`/check?address=${encodeURIComponent(address.trim())}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      <TopBar />
      <div style={{ maxWidth: "36rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
          Buyer Tools
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.6rem,4vw,2.2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.625rem" }}>
          Check any home's maintenance history
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, marginBottom: "2rem" }}>
          Enter a property address to see if the seller has a verified HomeFax report on file.
        </p>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Property Address
            </span>
            <input
              aria-label="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="123 Main St, Daytona Beach, FL"
              style={{ padding: "0.625rem 0.875rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.9rem", outline: "none" }}
            />
          </label>
        </div>
        <button
          onClick={handleSearch}
          disabled={!address.trim()}
          aria-label="check address"
          style={{ marginTop: "1rem", width: "100%", padding: "0.75rem", background: address.trim() ? S.ink : S.rule, color: COLORS.white, border: "none", cursor: address.trim() ? "pointer" : "not-allowed", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          Check Address
        </button>
      </div>
    </div>
  );
}

// ── Result: report found ──────────────────────────────────────────────────────

function FoundResult({ result }: { result: BuyerLookupResult & { found: true } }) {
  const reportUrl = `/report/${result.token}`;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      <TopBar />
      <div style={{ maxWidth: "40rem", margin: "3rem auto", padding: "0 1.5rem" }}>
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, marginBottom: "1.5rem" }}>
          <Shield size={16} color={S.sage} />
          <span style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, fontWeight: 700 }}>
            HomeFax Verified
          </span>
        </div>

        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.6rem", lineHeight: 1.1, color: S.ink, marginBottom: "0.5rem" }}>
          {result.address}
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "2rem" }}>
          {result.verificationLevel} · {result.propertyType} {result.yearBuilt ? `· Built ${result.yearBuilt}` : ""}
        </p>

        <Link
          to={reportUrl}
          aria-label="view report"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.5rem", background: S.ink, color: COLORS.white, textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          View Full Report <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ── Result: no report found ───────────────────────────────────────────────────

function NotFoundResult({ address }: { address: string }) {
  const [email, setEmail]         = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const registerHref = `/properties/new?address=${encodeURIComponent(address)}`;

  const handleRequest = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    await submitReportRequest(address, email.trim());
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      <TopBar />
      <div style={{ maxWidth: "40rem", margin: "3rem auto", padding: "0 1.5rem" }}>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.6rem", lineHeight: 1.1, color: S.ink, marginBottom: "0.5rem" }}>
          No report on file
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, marginBottom: "2rem" }}>
          This property doesn't have a HomeFax report yet. You can request one from the seller or be notified if one is created.
        </p>

        {/* §17.4.5 — Seller CTA */}
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
            Are you the homeowner?
          </p>
          <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1rem" }}>
            Start a free HomeFax report in 2 minutes. Buyers are already searching for this address.
          </p>
          <Link
            to={registerHref}
            aria-label="start your report"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", background: S.ink, color: COLORS.white, textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            Create a Free Report <ArrowRight size={13} />
          </Link>
        </div>

        {/* §17.4.2 — Buyer request form */}
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: COLORS.sageLight }}>
          {submitted ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <CheckCircle size={18} color={S.sage} />
              <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink }}>
                We'll notify you when a report is created for this address.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
                Get notified when a report is available
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <label style={{ flex: 1 }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.25rem" }}>
                    Your email
                  </span>
                  <input
                    type="email"
                    aria-label="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                  />
                </label>
                <button
                  onClick={handleRequest}
                  disabled={!email.trim() || submitting}
                  aria-label="notify me"
                  style={{ alignSelf: "flex-end", padding: "0.5rem 1rem", background: S.ink, color: COLORS.white, border: "none", cursor: email.trim() ? "pointer" : "not-allowed", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}
                >
                  Notify Me
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      <TopBar />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div role="status" aria-label="loading" className="spinner-lg" />
      </div>
    </div>
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default function CheckAddressPage() {
  const [searchParams] = useSearchParams();
  const rawAddress     = searchParams.get("address") ?? "";
  const [result, setResult]   = useState<BuyerLookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rawAddress) return;
    setLoading(true);
    setResult(null);
    lookupReport(rawAddress)
      .then((r) => {
        setResult(r);
        // §17.4.4 — set document title for SEO
        document.title = r.found
          ? `HomeFax Report — ${r.address}`
          : `HomeFax — No Report Found — ${rawAddress}`;
      })
      .catch(() => setResult({ found: false, address: rawAddress }))
      .finally(() => setLoading(false));
  }, [rawAddress]);

  if (!rawAddress)           return <SearchForm />;
  if (loading)               return <LoadingState />;
  if (!result)               return <LoadingState />;
  if (result.found)          return <FoundResult result={result as any} />;
  return <NotFoundResult address={result.address || rawAddress} />;
}
