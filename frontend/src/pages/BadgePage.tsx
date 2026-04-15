/**
 * HomeGentic Badge — /badge/:token
 *
 * Public, unauthenticated. Renders a compact property score badge that can
 * be embedded in listing sites via <iframe>. Supports:
 *   ?embed=1   — strips outer chrome for iframe display
 *   ?theme=dark — dark background variant
 *
 * Embed snippet shown to homeowners so they can copy-paste.
 */

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Shield, AlertTriangle, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { reportService, ReportSnapshot, ShareLink } from "@/services/report";
import { getScoreGrade } from "@/services/scoreService";
import { COLORS, FONTS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

type LoadState = "loading" | "loaded" | "error";

function ScorePill({ score, grade }: { score: number; grade: string }) {
  const color = score >= 88 ? COLORS.sage : score >= 75 ? COLORS.plumMid : score >= 50 ? COLORS.plumMid : COLORS.sage;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "0.5rem",
      padding: "0.375rem 0.875rem",
      background: COLORS.plum,
      border: `1px solid ${color}40`,
    }}>
      <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: COLORS.white }}>
        {score}
      </span>
      <div>
        <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: color, lineHeight: 1 }}>
          {grade}
        </p>
        <p style={{ fontFamily: UI.mono, fontSize: "0.45rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
          HomeGentic Score
        </p>
      </div>
    </div>
  );
}

function VerifiedBadge({ level }: { level: string }) {
  const cfg = level === "Premium"
    ? { color: COLORS.sage, label: "Premium Verified" }
    : level === "Basic"
    ? { color: COLORS.plumMid, label: "Basic Verified" }
    : { color: COLORS.plumMid, label: "Self-Reported" };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "0.3rem",
      border: `1px solid ${cfg.color}50`, padding: "0.2rem 0.5rem",
    }}>
      <Shield size={9} color={cfg.color} />
      <span style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

function BadgeCard({ snapshot, score }: { snapshot: ReportSnapshot; score: number }) {
  const grade = getScoreGrade(score);
  return (
    <div style={{
      background: COLORS.plum,
      border: `1px solid rgba(255,255,255,0.08)`,
      padding: "1.25rem",
      maxWidth: "18rem",
      width: "100%",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.875rem", opacity: 0.55 }}>
        <Shield size={11} color={COLORS.white} />
        <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.white }}>
          HOMEGENTIC
        </span>
      </div>

      {/* Address */}
      <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.9rem", color: COLORS.white, marginBottom: "0.125rem", lineHeight: 1.2 }}>
        {snapshot.address}
      </p>
      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: COLORS.plumMid, marginBottom: "1rem", letterSpacing: "0.04em" }}>
        {snapshot.city}, {snapshot.state}
      </p>

      {/* Score + stats */}
      <div style={{ display: "flex", gap: "0.875rem", alignItems: "center", marginBottom: "0.875rem" }}>
        <ScorePill score={score} grade={grade} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.45rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.1rem" }}>
              Verified Jobs
            </p>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1, color: COLORS.white }}>
              {snapshot.verifiedJobCount}
            </p>
          </div>
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.45rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.1rem" }}>
              Total Records
            </p>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", lineHeight: 1, color: COLORS.white }}>
              {snapshot.jobs.length}
            </p>
          </div>
        </div>
      </div>

      {/* Verification level */}
      <VerifiedBadge level={snapshot.verificationLevel} />

      {/* Footer */}
      <div style={{ marginTop: "0.875rem", paddingTop: "0.625rem", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: UI.mono, fontSize: "0.45rem", letterSpacing: "0.06em", color: "rgba(255,255,255,0.3)" }}>
          homegentic.io
        </span>
        <span style={{ fontFamily: UI.mono, fontSize: "0.45rem", letterSpacing: "0.06em", color: "rgba(255,255,255,0.3)" }}>
          ICP Blockchain
        </span>
      </div>
    </div>
  );
}

export default function BadgePage() {
  const { token }        = useParams<{ token: string }>();
  const [searchParams]   = useSearchParams();
  const isEmbed          = searchParams.get("embed") === "1";

  const [state,    setState]    = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [link,     setLink]     = useState<ShareLink | null>(null);
  const [error,    setError]    = useState("");
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    if (!token) { setState("error"); setError("No token"); return; }
    reportService.getReport(token)
      .then(({ link, snapshot }) => { setLink(link); setSnapshot(snapshot); setState("loaded"); })
      .catch((err: Error) => { setError(err.message); setState("error"); });
  }, [token]);

  if (state === "loading") {
    return (
      <div style={{ minHeight: isEmbed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: isEmbed ? COLORS.plum : UI.paper }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  if (state === "error" || !snapshot) {
    return (
      <div style={{ minHeight: isEmbed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: UI.paper, padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: "24rem" }}>
          <AlertTriangle size={32} color={UI.rust} style={{ margin: "0 auto 0.75rem" }} />
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink, marginBottom: "0.375rem" }}>
            Badge unavailable
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight }}>
            {error || "This badge link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  // Compute score from snapshot data
  const score = (() => {
    let s = 0;
    s += Math.min(snapshot.verifiedJobCount * 4, 40);
    s += Math.min(Math.floor(snapshot.totalAmountCents / 100 / 2500), 20);
    if (snapshot.verificationLevel === "Premium") s += 10;
    else if (snapshot.verificationLevel === "Basic") s += 5;
    s += Math.min(new Set(snapshot.jobs.map((j) => j.serviceType)).size * 4, 20);
    return Math.min(Math.round(s), 100);
  })();

  const badgeUrl   = `${window.location.origin}/badge/${token}`;
  const reportUrl  = `${window.location.origin}/report/${token}`;
  const embedCode  = `<iframe src="${badgeUrl}?embed=1" width="288" height="212" frameborder="0" style="border:none;" title="HomeGentic Property Score"></iframe>`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Embed mode: just the badge card, no chrome
  if (isEmbed) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "212px", background: COLORS.plum }}>
        <a href={reportUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <BadgeCard snapshot={snapshot} score={score} />
        </a>
      </div>
    );
  }

  // Full badge page with embed instructions
  return (
    <div style={{ minHeight: "100vh", background: UI.paper, padding: "3rem 1.5rem", fontFamily: UI.mono }}>
      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2.5rem" }}>
          <Shield size={16} color={UI.sage} />
          <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: UI.ink }}>
            HOMEGENTIC
          </span>
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>· Property Badge</span>
        </div>

        {/* Badge preview */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.875rem" }}>
            Preview
          </p>
          <BadgeCard snapshot={snapshot} score={score} />
        </div>

        {/* View full report link */}
        <div style={{ marginBottom: "2rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "1.5rem" }}>
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: UI.ink, border: `1px solid ${UI.rule}`, padding: "0.625rem 1.25rem",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={12} /> View Full HomeGentic Report
          </a>
        </div>

        {/* Embed section */}
        <div style={{ borderTop: `1px solid ${UI.rule}`, paddingTop: "1.5rem" }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.875rem" }}>
            Embed on your listing
          </p>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.inkLight, marginBottom: "1rem", lineHeight: 1.65 }}>
            Copy the code below and paste it into your listing page or agent website.
            The badge updates automatically when you generate a new report.
          </p>

          <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.875rem", borderBottom: `1px solid ${UI.rule}` }}>
              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
                HTML embed code
              </span>
              <button
                onClick={() => handleCopy(embedCode)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem",
                  fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  border: `1px solid ${copied ? COLORS.sage : UI.rule}`,
                  color: copied ? COLORS.sage : UI.inkLight,
                  background: "none", cursor: "pointer",
                }}
              >
                {copied ? <CheckCircle size={10} /> : <Copy size={10} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{
              padding: "0.875rem",
              fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink,
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              margin: 0, lineHeight: 1.65,
            }}>
              {embedCode}
            </pre>
          </div>

          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: UI.inkLight, marginTop: "0.625rem", lineHeight: 1.6 }}>
            Badge link expires: {link ? reportService.expiryLabel(link) : "—"}
          </p>
        </div>

      </div>
    </div>
  );
}
