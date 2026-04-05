/**
 * Lender Score Certificate — /cert/:token
 *
 * Public, unauthenticated. Shows only HomeGentic Score + grade + certified status.
 * No job details, no personal data.
 *
 * The token is base64-encoded JSON (see scoreService.generateCertToken).
 * NOTE: Canister-signed issuance is backlog item 4.2.1 — this is the frontend MVP.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { parseCertToken } from "@/services/scoreService";
import { certService } from "@/services/cert";
import { COLORS, FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
  "A+": { color: S.sage,        bg: COLORS.sageLight },
  "A":  { color: S.sage,        bg: COLORS.sageLight },
  "B":  { color: COLORS.plum,   bg: COLORS.sky },
  "C":  { color: COLORS.plumMid, bg: COLORS.butter },
  "D":  { color: S.rust,        bg: COLORS.blush },
  "F":  { color: S.rust,        bg: COLORS.blush },
};

export default function ScoreCertPage() {
  const { token } = useParams<{ token: string }>();
  const { isMobile } = useBreakpoint();
  const outerPad  = isMobile ? "1rem"   : "2rem";
  const innerPad  = isMobile ? "1.25rem 1rem" : "2rem 2.5rem";

  const payload = token ? parseCertToken(token) : null;
  const certId  = (payload as any)?.certId as string | undefined;

  // On-chain verification status: null = pending, true = verified, false = not found
  const [onChain, setOnChain] = useState<boolean | null>(certId ? null : false);

  useEffect(() => {
    if (!certId) { setOnChain(false); return; }
    certService.verifyCert(certId).then((result) => setOnChain(result !== null));
  }, [certId]);

  if (!payload) {
    return (
      <>
        <Helmet>
          <title>Score Certificate | HomeGentic</title>
          <meta name="description" content="HomeGentic Score Certificate — blockchain-verified home maintenance score." />
          <meta property="og:title" content="Score Certificate | HomeGentic" />
          <meta property="og:description" content="HomeGentic Score Certificate." />
          <meta property="og:type" content="website" />
        </Helmet>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper, padding: outerPad }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <AlertTriangle size={40} color={S.rust} style={{ margin: "0 auto 1rem" }} />
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: S.ink, marginBottom: "0.5rem" }}>
            Invalid certificate
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            This certificate link is invalid or has been corrupted. Ask the homeowner to generate a new one.
          </p>
          <p style={{ marginTop: "2rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            Powered by <strong style={{ color: S.ink }}>HomeGentic</strong>
          </p>
        </div>
      </div>
      </>
    );
  }

  const gc = GRADE_CONFIG[payload.grade] ?? GRADE_CONFIG["C"];
  const generatedDate = new Date(payload.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const certTitle = `HomeGentic Score Certificate — Grade ${payload.grade}`;
  const certDesc = `HomeGentic Score ${payload.score}/100, Grade ${payload.grade}. Certified on ${generatedDate}.`;

  return (
    <>
      <Helmet>
        <title>{certTitle} | HomeGentic</title>
        <meta name="description" content={certDesc} />
        <meta property="og:title" content={certTitle} />
        <meta property="og:description" content={certDesc} />
        <meta property="og:type" content="website" />
      </Helmet>
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: outerPad }}>
      <div style={{ width: "100%", maxWidth: "32rem", background: COLORS.white, border: `1px solid ${S.rule}` }}>

        {/* Header */}
        <div style={{ background: S.ink, padding: innerPad }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", opacity: 0.7 }}>
            <Shield size={14} color={COLORS.white} />
            <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.white }}>
              HOMEGENTIC
            </span>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: COLORS.plumMid }}>Score Certificate</span>
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1.2, color: COLORS.white, marginBottom: "0.375rem" }}>
            {payload.address}
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: COLORS.plumMid }}>
            Issued {generatedDate}
          </p>
        </div>

        {/* Score block */}
        <div style={{ padding: innerPad, borderBottom: `1px solid ${S.rule}` }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
            HomeGentic Score
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "1rem" }}>
            <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "4rem", lineHeight: 1, color: S.ink }}>
              {payload.score}
            </span>
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center",
                padding: "0.375rem 0.875rem",
                fontFamily: S.mono, fontWeight: 700, fontSize: "1rem", letterSpacing: "0.1em",
                color: gc.color, background: gc.bg, border: `1px solid ${gc.color}30`,
              }}>
                {payload.grade}
              </div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.25rem" }}>
                out of 100
              </p>
            </div>
          </div>

          {/* Score bar */}
          <div style={{ height: "4px", background: S.rule, marginBottom: "1.5rem" }}>
            <div style={{ height: "4px", width: `${payload.score}%`, background: gc.color, transition: "width 0.8s ease" }} />
          </div>

          {/* Certified badge */}
          {payload.certified ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${COLORS.plumMid}`, padding: "0.625rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, background: COLORS.butter }}>
              ★ HomeGentic Certified™ — Pre-Inspection Ready
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${S.rule}`, padding: "0.625rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
              <Shield size={12} /> Verified HomeGentic Property
            </div>
          )}
        </div>

        {/* On-chain verification status */}
        <div style={{ padding: isMobile ? "0.875rem 1rem" : "0.875rem 2.5rem", borderBottom: `1px solid ${S.rule}`, background: onChain === true ? COLORS.sageLight : onChain === false ? COLORS.butter : COLORS.white }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {onChain === null && (
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight }}>
                Checking on-chain record…
              </span>
            )}
            {onChain === true && (
              <>
                <CheckCircle size={13} color={COLORS.sage} />
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: COLORS.sage, fontWeight: 700 }}>
                  On-chain verified · {certId}
                </span>
              </>
            )}
            {onChain === false && (
              <>
                <AlertTriangle size={13} color={COLORS.plumMid} />
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: COLORS.plumMid }}>
                  {certId ? `Cert ${certId} not found on-chain — may be from a local session` : "Client-generated certificate — not stored on-chain"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Score Breakdown (15.4.3) */}
        {(() => {
          const isPro = payload.planTier && payload.planTier !== "Free";
          const bd    = payload.breakdown;
          if (!bd) return null;

          const pillars = [
            { label: "Verified Jobs",  pts: bd.verifiedJobPts,  max: 40 },
            { label: "Total Value",    pts: bd.valuePts,         max: 20 },
            { label: "Verification",   pts: bd.verificationPts,  max: 20 },
            { label: "Job Diversity",  pts: bd.diversityPts,     max: 20 },
          ];

          return (
            <div style={{ padding: innerPad, borderBottom: `1px solid ${S.rule}`, background: COLORS.white }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
                Score Breakdown
              </p>
              {isPro ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {pillars.map(({ label, pts, max }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, minWidth: "7rem" }}>{label}</span>
                      <div style={{ flex: 1, height: "4px", background: S.rule }}>
                        <div style={{ height: "4px", width: `${Math.round((pts / max) * 100)}%`, background: S.sage }} />
                      </div>
                      <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", color: S.ink, minWidth: "2rem", textAlign: "right" }}>{pts}</span>
                      <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>/ {max}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none" }}>
                    {pillars.map(({ label, max }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.625rem" }}>
                        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, minWidth: "7rem" }}>{label}</span>
                        <div style={{ flex: 1, height: "4px", background: S.rule }}>
                          <div style={{ height: "4px", width: "60%", background: S.sage }} />
                        </div>
                        <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", color: S.ink, minWidth: "2rem", textAlign: "right" }}>—</span>
                        <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>/ {max}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.75)", textAlign: "center", padding: "0.5rem" }}>
                    <p style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.ink, marginBottom: "0.375rem" }}>
                      Upgrade to Pro to see breakdown
                    </p>
                    <a href="/pricing" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.35rem 0.75rem", border: `1px solid ${COLORS.plum}`, background: COLORS.plum, color: COLORS.white, textDecoration: "none" }}>
                      Upgrade to Pro →
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* What this means */}
        <div style={{ padding: innerPad, borderBottom: `1px solid ${S.rule}`, background: COLORS.white }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
            What this means
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {[
              "Maintenance history has been documented and cryptographically verified on the Internet Computer blockchain.",
              "Records cannot be altered or deleted retroactively.",
              payload.certified
                ? "This property meets HomeGentic Certified™ standards — score ≥ 88 with verified coverage of key systems."
                : `Score of ${payload.score} reflects documented maintenance. Higher scores indicate more comprehensive verified history.`,
            ].map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <Shield size={11} color={S.sage} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", lineHeight: 1.6, color: S.inkLight }}>
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "1rem" : "1rem 2.5rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? "0.25rem" : 0 }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>
            homegentic.io · Blockchain-verified home history
          </span>
          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>
            {payload.score}/100
          </span>
        </div>

      </div>

      <p style={{ marginTop: "1.5rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, textAlign: "center", maxWidth: "28rem" }}>
        This certificate was generated by the homeowner and contains no personal data.
        Score is computed from verified job records stored on the ICP blockchain.
      </p>
    </div>
    </>
  );
}
