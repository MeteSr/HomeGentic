/**
 * §17.4.1 — Public address search for HomeGentic reports
 * §17.4.2 — Buyer report request form (no report on file)
 * §17.4.4 — document.title set with address for SEO
 * §17.4.5 — Seller CTA when no report found
 *
 * Route: /check?address=... (public, no login required)
 */

import React, { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Shield, ArrowRight, CheckCircle } from "lucide-react";
import { lookupReport, submitReportRequest, type BuyerLookupResult } from "@/services/buyerLookup";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { isValidEmail } from "@/utils/validators";

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

// ── Address search form ───────────────────────────────────────────────────────

function SearchForm() {
  const [address, setAddress] = useState("");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (!address.trim()) return;
    navigate(`/check?address=${encodeURIComponent(address.trim())}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "36rem" }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
            Buyer Tools
          </div>

          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.75rem" }}>
            Check any home's maintenance history
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
            Enter a property address to see if the seller has a verified HomeGentic report on file.
          </p>

          <div style={{ background: COLORS.white, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "2rem", boxShadow: SHADOWS.card }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                Property Address
              </span>
              <input
                aria-label="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="123 Main St, Daytona Beach, FL"
                style={{
                  padding: "0.75rem 1rem", border: `1px solid ${S.rule}`,
                  borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.9375rem",
                  outline: "none", background: COLORS.white, color: S.ink,
                }}
              />
            </label>
            <button
              onClick={handleSearch}
              disabled={!address.trim()}
              aria-label="check address"
              style={{
                width: "100%", padding: "0.875rem",
                background: address.trim() ? S.ink : S.rule,
                color: COLORS.white, border: "none",
                borderRadius: RADIUS.pill,
                cursor: address.trim() ? "pointer" : "not-allowed",
                fontFamily: S.sans, fontSize: "0.9375rem", fontWeight: 600,
                transition: "background 0.15s",
              }}
            >
              Check Address
            </button>
          </div>

          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, textAlign: "center", marginTop: "1.25rem" }}>
            FREE · NO ACCOUNT REQUIRED
          </p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}

// ── Result: report found ──────────────────────────────────────────────────────

function FoundResult({ result }: { result: BuyerLookupResult & { found: true } }) {
  const reportUrl = `/report/${result.token}`;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, maxWidth: "44rem", margin: "0 auto", padding: "3rem 1.5rem", width: "100%" }}>
        {/* Verified badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem", background: S.sageLight,
          border: `1px solid ${S.sageMid}`, borderRadius: RADIUS.pill,
          marginBottom: "1.75rem",
        }}>
          <Shield size={15} color={S.sage} />
          <span style={{ fontFamily: S.mono, fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, fontWeight: 700 }}>
            HomeGentic Verified
          </span>
        </div>

        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem, 4vw, 2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.5rem" }}>
          {result.address}
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "2.5rem" }}>
          {result.verificationLevel} · {result.propertyType}{result.yearBuilt ? ` · Built ${result.yearBuilt}` : ""}
        </p>

        <Link
          to={reportUrl}
          aria-label="view report"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.875rem 2rem", background: S.ink, color: COLORS.white,
            textDecoration: "none", borderRadius: RADIUS.pill,
            fontFamily: S.sans, fontSize: "0.9375rem", fontWeight: 600,
          }}
        >
          View Full Report <ArrowRight size={15} />
        </Link>
      </div>
      <PublicFooter />
    </div>
  );
}

// ── Result: no report found ───────────────────────────────────────────────────

function NotFoundResult({ address }: { address: string }) {
  const [email, setEmail]           = useState("");
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const registerHref = `/properties/new?address=${encodeURIComponent(address)}`;

  const handleRequest = async () => {
    if (!email.trim() || !isValidEmail(email)) return;
    setSubmitting(true);
    await submitReportRequest(address, email.trim());
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, maxWidth: "44rem", margin: "0 auto", padding: "3rem 1.5rem", width: "100%" }}>
        {/* Eyebrow */}
        <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: RADIUS.pill, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)`, fontFamily: S.sans }}>
          No Report Found
        </div>

        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(1.5rem, 4vw, 2rem)", lineHeight: 1.1, color: S.ink, marginBottom: "0.75rem" }}>
          No report on file
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9375rem", color: S.inkLight, marginBottom: "2.5rem", lineHeight: 1.7, fontWeight: 300 }}>
          This property doesn't have a HomeGentic report yet. You can request one from the seller or be notified when one is created.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* §17.4.5 — Seller CTA */}
          <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "1.75rem", boxShadow: SHADOWS.card }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>
              Are you the homeowner?
            </p>
            <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.25rem", lineHeight: 1.7, fontWeight: 300 }}>
              Start a free HomeGentic report in 2 minutes. Buyers are already searching for this address.
            </p>
            <Link
              to={registerHref}
              aria-label="start your report"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                padding: "0.75rem 1.5rem", background: S.ink, color: COLORS.white,
                textDecoration: "none", borderRadius: RADIUS.pill,
                fontFamily: S.sans, fontSize: "0.875rem", fontWeight: 600,
              }}
            >
              Create a Free Report <ArrowRight size={14} />
            </Link>
          </div>

          {/* §17.4.2 — Buyer request form */}
          <div style={{ background: S.sageLight, border: `1px solid ${S.sageMid}`, borderRadius: RADIUS.card, padding: "1.75rem" }}>
            {submitted ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <CheckCircle size={20} color={S.sage} />
                <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.ink, fontWeight: 500 }}>
                  We'll notify you when a report is created for this address.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
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
                      style={{
                        width: "100%", padding: "0.625rem 0.875rem",
                        border: `1px solid ${email && !isValidEmail(email) ? COLORS.rust : S.rule}`,
                        borderRadius: RADIUS.input,
                        fontFamily: S.sans, fontSize: "0.875rem", outline: "none",
                        background: COLORS.white, boxSizing: "border-box",
                      }}
                    />
                    {email && !isValidEmail(email) && (
                      <span style={{ color: COLORS.rust, fontSize: "0.65rem", marginTop: "0.2rem", display: "block", fontFamily: S.mono }}>Enter a valid email address</span>
                    )}
                  </label>
                  <button
                    onClick={handleRequest}
                    disabled={!email.trim() || !isValidEmail(email) || submitting}
                    aria-label="notify me"
                    style={{
                      alignSelf: "flex-end", padding: "0.625rem 1.25rem",
                      background: S.ink, color: COLORS.white, border: "none",
                      borderRadius: RADIUS.pill,
                      cursor: email.trim() ? "pointer" : "not-allowed",
                      fontFamily: S.sans, fontSize: "0.875rem", fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Notify Me
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, display: "flex", flexDirection: "column" }}>
      <PublicNav />
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
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
      .then((r) => { setResult(r); })
      .catch(() => setResult({ found: false, address: rawAddress }))
      .finally(() => setLoading(false));
  }, [rawAddress]);

  const helmetTitle = result?.found
    ? `HomeGentic Report — ${result.address}`
    : rawAddress
      ? `Check Address — ${rawAddress} | HomeGentic`
      : "Check Address | HomeGentic";
  const helmetDesc = "Verify a property's HomeGentic maintenance report. Search by address to see if a verified home history is available.";

  const helmet = (
    <Helmet>
      <title>{helmetTitle}</title>
      <meta name="description" content={helmetDesc} />
      <meta property="og:title" content={helmetTitle} />
      <meta property="og:description" content={helmetDesc} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://homegentic.app/og-default.png" />
      <link rel="canonical" href="https://homegentic.app/check" />
    </Helmet>
  );

  if (!rawAddress)  return <>{helmet}<SearchForm /></>;
  if (loading)      return <>{helmet}<LoadingState /></>;
  if (!result)      return <>{helmet}<LoadingState /></>;
  if (result.found) return <>{helmet}<FoundResult result={result as any} /></>;
  return <>{helmet}<NotFoundResult address={result.address || rawAddress} /></>;
}
