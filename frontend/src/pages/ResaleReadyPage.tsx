/**
 * Resale-Ready Milestone Screen (8.5.2)
 *
 * Full-page milestone view shown at the 12-month mark (and accessible anytime).
 * Shows record depth, HomeFax score, and what a buyer would see.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, ExternalLink, Trophy, TrendingUp, Shield } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { reportService } from "@/services/report";
import { computeScore, getScoreGrade, premiumEstimate, isCertified, generateCertToken, loadHistory } from "@/services/scoreService";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  gold: "#C9A84C",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
  sans:  "'IBM Plex Sans', sans-serif" as const,
};

function ScoreArc({ score }: { score: number }) {
  const cx = 70, cy = 75, r = 54;
  const C  = 2 * Math.PI * r;
  const arc    = C * 0.75;
  const filled = arc * (score / 100);
  const color  = score >= 88 ? S.gold : score >= 75 ? S.sage : score >= 50 ? "#D4820E" : S.rust;
  const grade  = score >= 88 ? "CERTIFIED" : score >= 75 ? "GREAT" : score >= 50 ? "GOOD" : "FAIR";
  return (
    <svg viewBox="0 0 140 130" style={{ width: "9rem", height: "auto" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${S.rule}88`} strokeWidth={9}
        strokeDasharray={`${arc} ${C}`} strokeLinecap="butt" transform={`rotate(-225, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${filled.toFixed(2)} ${C}`} strokeLinecap="butt" transform={`rotate(-225, ${cx}, ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="900" fontSize="30" fill={S.ink}>{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace"
        fontSize="8" fill={S.inkLight} letterSpacing="1">/100</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace"
        fontSize="8" fill={color} letterSpacing="2">{grade}</text>
    </svg>
  );
}

export default function ResaleReadyPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [shareLink,  setShareLink]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      propertyService.getMyProperties(),
      jobService.getMyJobs(),
    ]).then(([props, js]) => {
      setProperties(props);
      setJobs(js);
    }).finally(() => setLoading(false));
  }, []);

  const score       = computeScore(jobs, properties);
  const grade       = getScoreGrade(score);
  const certified   = isCertified(score, jobs);
  const verifiedJobs = jobs.filter((j) => j.status === "verified");
  const totalValue  = jobs.reduce((s, j) => s + j.amount, 0);
  const uniqueTypes = new Set(verifiedJobs.map((j) => j.serviceType)).size;
  const premium     = premiumEstimate(score);
  const history     = loadHistory();
  const oldest      = history[0];
  const scoreGain   = history.length >= 2
    ? score - history[0].score
    : 0;

  const property    = properties[0] ?? null;

  async function handleGenerateShareLink() {
    if (!property) return;
    try {
      const link = await reportService.createShareLink(
        String(property.id),
        jobs.map((j) => ({
          id: j.id, title: j.title, serviceType: j.serviceType,
          description: j.description ?? "", contractorName: j.contractorName,
          amount: j.amount, date: j.date, status: j.status,
          verified: j.status === "verified", isDiy: j.isDiy,
          permitNumber: j.permitNumber, warrantyMonths: j.warrantyMonths,
        })),
        "Full",
        undefined
      );
      const url = `${window.location.origin}/report/${link.token}`;
      setShareLink(url);
      await navigator.clipboard.writeText(url);
      toast.success("Buyer report link copied to clipboard!");
    } catch {
      toast.error("Could not generate share link");
    }
  }

  function handleCopyCert() {
    const token = generateCertToken({ address: property?.address ?? "", score, grade, certified, generatedAt: Date.now() });
    const url = `${window.location.origin}/cert/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Lender certificate link copied!");
  }

  if (loading) {
    return (
      <Layout>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "none", border: "none", cursor: "pointer", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "2rem" }}
        >
          <ArrowLeft size={13} /> Dashboard
        </button>

        {/* Hero */}
        <div style={{ background: S.ink, padding: "2.5rem", marginBottom: "2rem", display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Trophy size={14} color={S.gold} />
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.gold }}>
                Resale-Ready
              </p>
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1.1, color: S.paper, marginBottom: "0.75rem" }}>
              Your Home History<br />Is Working For You
            </h1>
            <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: "rgba(244,241,235,0.7)", fontWeight: 300, maxWidth: "28rem" }}>
              {verifiedJobs.length} verified records. ${(totalValue / 100).toLocaleString()} documented.
              {scoreGain > 0 && ` Score up +${scoreGain} pts since you joined.`}
            </p>
          </div>
          <ScoreArc score={score} />
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
          {[
            { label: "HomeFax Score",     value: String(score),                          sub: grade },
            { label: "Verified Records",  value: String(verifiedJobs.length),            sub: "blockchain-signed" },
            { label: "Value Documented",  value: `$${(totalValue / 100).toLocaleString()}`, sub: "across all jobs" },
            { label: "Systems Covered",   value: String(uniqueTypes),                    sub: "service categories" },
          ].map((stat, i, arr) => (
            <div key={stat.label} style={{
              padding: "1.25rem", textAlign: "center", background: "#fff",
              borderRight: i < arr.length - 1 ? `1px solid ${S.rule}` : "none",
            }}>
              <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.625rem", lineHeight: 1 }}>{stat.value}</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.sage, marginTop: "0.125rem" }}>{stat.sub}</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginTop: "0.25rem" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Buyer premium estimate */}
        {premium && (
          <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", marginBottom: "2rem", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>
                Estimated Buyer Premium
              </p>
              <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, color: S.sage }}>
                ${premium.low.toLocaleString()} – ${premium.high.toLocaleString()}
              </p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.375rem" }}>
                Based on HomeFax Score {score} ({grade}). Verified records typically add 1–10% in US markets.
              </p>
            </div>
            <TrendingUp size={36} color={`${S.sage}88`} />
          </div>
        )}

        {/* HomeFax Certified badge */}
        {certified && (
          <div style={{ border: `2px solid ${S.gold}`, padding: "1.25rem 1.5rem", marginBottom: "2rem", background: "#FFFDF5", display: "flex", alignItems: "center", gap: "1rem" }}>
            <Shield size={28} color={S.gold} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.gold, marginBottom: "0.125rem" }}>
                HomeFax Certified™
              </p>
              <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem" }}>
                Score ≥ 88 — qualifies for pre-inspection waiver consideration
              </p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.2rem" }}>
                Ask your real estate agent about listing with HomeFax Certified status.
              </p>
            </div>
          </div>
        )}

        {/* Share actions */}
        <div style={{ border: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: S.paper }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Share Your Record
            </p>
          </div>
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.2rem" }}>Buyer Report Link</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                  Share your full maintenance history with a prospective buyer or agent
                </p>
                {shareLink && (
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage, marginTop: "0.25rem", wordBreak: "break-all" }}>
                    {shareLink}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                icon={<Share2 size={13} />}
                onClick={handleGenerateShareLink}
                disabled={!property}
              >
                {shareLink ? "Copy Again" : "Generate & Copy Link"}
              </Button>
            </div>

            <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.2rem" }}>Lender Certificate</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                  Score-only link for mortgage lenders — no personal data exposed
                </p>
              </div>
              <Button variant="outline" icon={<ExternalLink size={13} />} onClick={handleCopyCert} disabled={!property}>
                Copy Certificate Link
              </Button>
            </div>

            <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.2rem" }}>Insurance Defense Report</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                  Print-ready PDF for insurer submission (Roofing, HVAC, Electrical, Plumbing)
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/insurance-defense")}>
                View Insurance Report →
              </Button>
            </div>
          </div>
        </div>

        {/* What a buyer sees preview */}
        {property && (
          <div style={{ border: `1px solid ${S.rule}` }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: S.paper, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                What a Buyer Sees
              </p>
              {shareLink && (
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.rust, textDecoration: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}
                >
                  Open report <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div style={{ padding: "1.25rem", background: "#fff" }}>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.2rem" }}>Property</p>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{property.address}</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{property.city}, {property.state}</p>
                </div>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.2rem" }}>Verification</p>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, color: property.verificationLevel === "Premium" ? S.sage : property.verificationLevel === "Basic" ? "#1e40af" : S.inkLight }}>
                    {property.verificationLevel}
                  </p>
                </div>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.2rem" }}>Year Built</p>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{String(property.yearBuilt)}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {Array.from(new Set(verifiedJobs.map((j) => j.serviceType))).slice(0, 8).map((type) => (
                  <span key={type} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.25rem 0.6rem", border: `1px solid ${S.sage}`, color: S.sage }}>
                    ✓ {type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
