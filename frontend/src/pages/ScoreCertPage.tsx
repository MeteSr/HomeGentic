/**
 * Lender Score Certificate — /cert/:token
 *
 * Public, unauthenticated. Shows only HomeGentic Score + grade + certified status.
 * No job details, no personal data.
 *
 * R2: the link only names the certificate (token = certId; legacy base64
 * tokens are read for their certId and nothing else). Everything shown —
 * address, verification level, structural flag, verified-job facts and the
 * score — comes from report.verifyCert. On v3 certificates the score was
 * computed on-chain (market.computePropertyScore); older certificates carry a
 * homeowner-reported score, shown as secondary and unverified.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { getScoreGrade } from "@/services/scoreService";
import { certService, certIdFromToken, type VerifiedCert } from "@/services/cert";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  rust:     V2_COLORS.blue,
  inkLight: V2_COLORS.muted,
  sage:     V2_COLORS.blue,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
};

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
  "A+": { color: UI.sage,         bg: V2_COLORS.lblue       },
  "A":  { color: UI.sage,         bg: V2_COLORS.lblue       },
  "B":  { color: V2_COLORS.ink,   bg: V2_COLORS.lblue       },
  "C":  { color: V2_COLORS.muted, bg: V2_COLORS.attentionBg },
  "D":  { color: UI.rust,         bg: "#FFE8E3"              },
  "F":  { color: UI.rust,         bg: "#FFE8E3"              },
};

export default function ScoreCertPage() {
  const { token } = useParams<{ token: string }>();
  const { isMobile } = useBreakpoint();
  const outerPad  = isMobile ? "1rem"   : "2rem";
  const innerPad  = isMobile ? "1.25rem 1rem" : "2rem 2.5rem";

  const certId = certIdFromToken(token);

  // undefined = loading, null = not found / lookup failed, else the on-chain record
  const [cert, setCert] = useState<VerifiedCert | null | undefined>(certId ? undefined : null);

  useEffect(() => {
    if (!certId) { setCert(null); return; }
    let live = true;
    setCert(undefined);
    certService.verifyCert(certId)
      .then((result) => { if (live) setCert(result); })
      .catch(() => { if (live) setCert(null); });
    return () => { live = false; };
  }, [certId]);

  const grade = cert && cert.score !== null ? getScoreGrade(cert.score) : null;
  const certTitle = grade ? `HomeGentic Score Certificate — Grade ${grade} | HomeGentic™` : "Score Certificate | HomeGentic™";
  const certDesc  = cert && cert.score !== null
    ? `HomeGentic Score ${cert.score}/100, Grade ${grade}.`
    : "HomeGentic Score Certificate — blockchain-verified home maintenance score.";
  const canonical = token ? `https://homegentic.app/cert/${token}` : "https://homegentic.app/cert";

  const head = (
    <PageHead>
      <title>{certTitle}</title>
      <meta name="description" content={certDesc} />
      <meta property="og:title" content={certTitle} />
      <meta property="og:description" content={certDesc} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://homegentic.app/og-default.png" />
      <link rel="canonical" href={canonical} />
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "name": certTitle,
        "description": certDesc,
        "url": canonical,
      })}</script>
    </PageHead>
  );

  const message = (title: string, text: string, icon = true) => (
    <>
      {head}
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: UI.paper, padding: outerPad }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          {icon && <AlertTriangle size={40} color={UI.rust} style={{ margin: "0 auto 1rem" }} />}
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: UI.ink, marginBottom: "0.5rem" }}>
            {title}
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
            {text}
          </p>
          <p style={{ marginTop: "2rem", fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
            Powered by <strong style={{ color: UI.ink }}>HomeGentic</strong>
          </p>
        </div>
      </div>
    </>
  );

  if (!certId) {
    return message(
      "Invalid certificate",
      "This certificate link is invalid or has been corrupted, or it was never stored on-chain. Ask the homeowner to generate a new one.",
    );
  }
  if (cert === undefined) {
    return message("Checking on-chain record…", `Looking up certificate ${certId}.`, false);
  }
  if (cert === null) {
    return message(
      "Certificate not found",
      `Certificate ${certId} was not found on-chain — it may be from a local session. Ask the homeowner to generate a new one.`,
    );
  }

  const onChainScore = cert.scoreSource === "onChain";
  const gc = GRADE_CONFIG[grade ?? "C"] ?? GRADE_CONFIG["C"];
  const generatedDate = new Date(cert.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const facts = cert.onChain;
  const place = facts ? [facts.city, facts.state].filter(Boolean).join(", ") : "";

  return (
    <>
      {head}
    <div style={{ minHeight: "100vh", background: UI.paper, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: outerPad }}>
      <div style={{ width: "100%", maxWidth: "32rem", background: V2_COLORS.paper, border: `1px solid ${UI.rule}` }}>

        {/* Header */}
        <div style={{ background: UI.ink, padding: innerPad }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <Shield size={14} color={V2_COLORS.paper} />
            <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: V2_COLORS.paper }}>
              HOMEGENTIC
            </span>
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: V2_COLORS.mutedOnDark }}>Score Certificate</span>
          </div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1.2, color: V2_COLORS.paper, marginBottom: "0.375rem" }}>
            {cert.address}
          </h1>
          {place && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: V2_COLORS.mutedOnDark, marginBottom: "0.25rem" }}>{place}</p>
          )}
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: V2_COLORS.mutedOnDark }}>
            Issued {generatedDate}
          </p>
        </div>

        {/* On-chain record status */}
        <div style={{ padding: isMobile ? "0.875rem 1rem" : "0.875rem 2.5rem", borderBottom: `1px solid ${UI.rule}`, background: V2_COLORS.lblue }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle size={13} color={V2_COLORS.blue} />
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: V2_COLORS.blue, fontWeight: 700 }}>
              On-chain verified · {certId}
            </span>
          </div>
        </div>

        {/* Score block */}
        <div style={{ padding: innerPad, borderBottom: `1px solid ${UI.rule}` }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
            {onChainScore ? "HomeGentic Score · computed on-chain" : "Homeowner-reported score · not verified on-chain"}
          </p>
          {cert.score === null ? (
            <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight, marginBottom: "1.5rem" }}>
              No on-chain score — no job history was recorded when this certificate was issued.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "1rem", opacity: onChainScore ? 1 : 0.6 }}>
                <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: onChainScore ? "4rem" : "2.5rem", lineHeight: 1, color: UI.ink }}>
                  {cert.score}
                </span>
                <div>
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "0.375rem 0.875rem",
                    fontFamily: UI.mono, fontWeight: 700, fontSize: "1rem", letterSpacing: "0.1em",
                    color: gc.color, background: gc.bg, border: `1px solid ${gc.color}30`,
                  }}>
                    {grade}
                  </div>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, marginTop: "0.25rem" }}>
                    out of 100
                  </p>
                </div>
              </div>
              {onChainScore && (
                <div style={{ height: "4px", background: UI.rule, marginBottom: "1.5rem" }}>
                  <div style={{ height: "4px", width: `${Math.max(0, Math.min(100, cert.score))}%`, background: gc.color, transition: "width 0.8s ease" }} />
                </div>
              )}
              {!onChainScore && (
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", lineHeight: 1.6, color: UI.inkLight, marginBottom: "1.25rem" }}>
                  This certificate predates on-chain scoring: the score was sent by the homeowner&apos;s browser. Rely on the on-chain facts below.
                </p>
              )}
            </>
          )}

          {/* Certified badge */}
          {cert.certified ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${V2_COLORS.muted}`, padding: "0.625rem 1.25rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: V2_COLORS.muted, background: V2_COLORS.attentionBg }}>
              ★ HomeGentic Certified™ — Pre-Inspection Ready
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${UI.rule}`, padding: "0.625rem 1.25rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>
              <Shield size={12} /> HomeGentic Score Certificate
            </div>
          )}
        </div>

        {/* On-chain facts */}
        {facts && (
          <div style={{ padding: innerPad, borderBottom: `1px solid ${UI.rule}`, background: V2_COLORS.paper }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.875rem" }}>
              On-chain record
            </p>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0 }}>
              {[
                ["Property verification", facts.verificationLevel || "—"],
                ["Verified jobs",         String(facts.verifiedJobCount)],
                ["Key systems verified",  facts.verifiedKeySystems.length ? facts.verifiedKeySystems.join(", ") : "None"],
                ["Structural requirements", facts.meetsStructural ? "Met" : "Not met"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                  <dt style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{label}</dt>
                  <dd style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: UI.ink, margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", lineHeight: 1.6, color: UI.inkLight, marginTop: "0.875rem" }}>
              Verified jobs count homeowner-only (DIY) jobs and jobs co-signed by a HomeGentic-verified contractor. Signatures from contractors whose profile is not yet verified are not counted.
            </p>
          </div>
        )}

        {/* What this means */}
        <div style={{ padding: innerPad, borderBottom: `1px solid ${UI.rule}`, background: V2_COLORS.paper }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.875rem" }}>
            What this means
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {[
              "Maintenance history has been documented and cryptographically verified on the Internet Computer blockchain.",
              "Records cannot be altered or deleted retroactively.",
              cert.certified
                ? "This property meets HomeGentic Certified™ standards — score ≥ 88 with verified coverage of key systems."
                : cert.score !== null
                  ? `Score of ${cert.score} reflects documented maintenance. Higher scores indicate more comprehensive verified history.`
                  : "Higher scores indicate more comprehensive verified history.",
            ].map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <Shield size={11} color={UI.sage} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", lineHeight: 1.6, color: UI.inkLight }}>
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "1rem" : "1rem 2.5rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? "0.25rem" : 0 }}>
          <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: UI.inkLight }}>
            homegentic.io · Blockchain-verified home history
          </span>
          {cert.score !== null && (
            <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: UI.inkLight }}>
              {cert.score}/100
            </span>
          )}
        </div>

      </div>

      <p style={{ marginTop: "1.5rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, textAlign: "center", maxWidth: "28rem" }}>
        Everything on this page is read from the HomeGentic report canister, not from the link. It contains no personal data.
      </p>
    </div>
    </>
  );
}
