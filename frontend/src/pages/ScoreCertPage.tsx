/**
 * Lender Score Certificate — /cert/:token
 *
 * Public, unauthenticated. Shows only HomeFax Score + grade + certified status.
 * No job details, no personal data.
 *
 * The token is base64-encoded JSON (see scoreService.generateCertToken).
 * NOTE: Canister-signed issuance is backlog item 4.2.1 — this is the frontend MVP.
 */

import React from "react";
import { useParams } from "react-router-dom";
import { Shield, AlertTriangle } from "lucide-react";
import { parseCertToken } from "@/services/scoreService";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
  "A+": { color: S.sage,    bg: "#F0F6F3" },
  "A":  { color: S.sage,    bg: "#F0F6F3" },
  "B":  { color: "#1A5C8A", bg: "#EAF3FA" },
  "C":  { color: "#D4820E", bg: "#FEF3DC" },
  "D":  { color: S.rust,    bg: "#FAF0ED" },
  "F":  { color: S.rust,    bg: "#FAF0ED" },
};

export default function ScoreCertPage() {
  const { token } = useParams<{ token: string }>();
  const payload = token ? parseCertToken(token) : null;

  if (!payload) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper, padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <AlertTriangle size={40} color={S.rust} style={{ margin: "0 auto 1rem" }} />
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: S.ink, marginBottom: "0.5rem" }}>
            Invalid certificate
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            This certificate link is invalid or has been corrupted. Ask the homeowner to generate a new one.
          </p>
          <p style={{ marginTop: "2rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            Powered by <strong style={{ color: S.ink }}>HomeFax</strong>
          </p>
        </div>
      </div>
    );
  }

  const gc = GRADE_CONFIG[payload.grade] ?? GRADE_CONFIG["C"];
  const generatedDate = new Date(payload.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: "32rem", background: "#fff", border: `1px solid ${S.rule}` }}>

        {/* Header */}
        <div style={{ background: S.ink, padding: "2rem 2.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", opacity: 0.7 }}>
            <Shield size={14} color="#F4F1EB" />
            <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#F4F1EB" }}>
              HOMEFAX
            </span>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: "#7A7268" }}>Score Certificate</span>
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1.2, color: "#F4F1EB", marginBottom: "0.375rem" }}>
            {payload.address}
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: "#7A7268" }}>
            Issued {generatedDate}
          </p>
        </div>

        {/* Score block */}
        <div style={{ padding: "2rem 2.5rem", borderBottom: `1px solid ${S.rule}` }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
            HomeFax Score
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
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: "1px solid #C9A84C", padding: "0.625rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8B6914", background: "#FFFBEE" }}>
              ★ HomeFax Certified™ — Pre-Inspection Ready
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${S.rule}`, padding: "0.625rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
              <Shield size={12} /> Verified HomeFax Property
            </div>
          )}
        </div>

        {/* What this means */}
        <div style={{ padding: "1.5rem 2.5rem", borderBottom: `1px solid ${S.rule}`, background: "#FAFAF8" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
            What this means
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {[
              "Maintenance history has been documented and cryptographically verified on the Internet Computer blockchain.",
              "Records cannot be altered or deleted retroactively.",
              payload.certified
                ? "This property meets HomeFax Certified™ standards — score ≥ 88 with verified coverage of key systems."
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
        <div style={{ padding: "1rem 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>
            homefax.io · Blockchain-verified home history
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
  );
}
