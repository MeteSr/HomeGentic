import React, { useState } from "react";
import { X, Copy, Download, Shield, CheckCircle } from "lucide-react";
import { Button } from "@/components/Button";
import { reportService, type RiskProfile } from "@/services/report";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  rust:     V2_COLORS.blue,
  inkLight: V2_COLORS.muted,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
};

const EXPIRY_OPTIONS = [
  { label: "30 days",  value: 30 },
  { label: "90 days",  value: 90 },
  { label: "1 year",   value: 365 },
  { label: "Never",    value: null },
] as const;

const GRADE_COLORS: Record<string, string> = {
  A: "#2a7a4b",
  B: "#4a8f3f",
  C: "#d4a017",
  D: "#c97a1a",
  F: "#c94c2e",
};

interface InsuranceShareModalProps {
  property: Property;
  onClose:  () => void;
}

export function InsuranceShareModal({ property, onClose }: InsuranceShareModalProps) {
  const [profile,    setProfile]    = useState<RiskProfile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(90);

  const propertyId       = String(property.id);
  const verificationLevel = property.verificationLevel ?? "Unverified";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const p = await reportService.generateRiskProfile(propertyId, verificationLevel, expiryDays);
      setProfile(p);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate risk profile");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!profile) return;
    const url = reportService.riskProfileUrl(profile.token);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    if (!profile) return;
    const json = JSON.stringify({
      schema:           profile.schemaVersion,
      token:            profile.token,
      verificationUrl:  reportService.riskProfileUrl(profile.token),
      propertyId:       profile.propertyId,
      generatedAt:      new Date(profile.generatedAt).toISOString(),
      expiresAt:        profile.expiresAt ? new Date(profile.expiresAt).toISOString() : null,
      maintenanceScore: profile.maintenanceScore,
      grade:            reportService.maintenanceGrade(profile.maintenanceScore),
      verificationLevel: profile.verificationLevel,
      sensorCoverage:   profile.sensorCoverage,
      recentAlerts:     profile.recentAlerts,
      openIssues:       profile.openJobs,
      verifiedJobs:     profile.verifiedJobCount,
      permittedWork:    profile.permitCount,
    }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `homegentic-risk-${propertyId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grade       = profile ? reportService.maintenanceGrade(profile.maintenanceScore) : null;
  const gradeColor  = grade ? GRADE_COLORS[grade] ?? UI.ink : UI.ink;
  const shareUrl    = profile ? reportService.riskProfileUrl(profile.token) : "";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(14,14,12,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "1rem",
    }}>
      <div data-testid="insurance-modal" style={{
        background: UI.paper, border: `1px solid ${UI.rule}`,
        maxWidth: 540, width: "100%", padding: "2rem",
        boxShadow: "0 8px 32px rgba(14,14,12,0.18)",
        display: "flex", flexDirection: "column", gap: "1.5rem",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <Shield size={18} color={UI.rust} />
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.rust }}>
                Insurance Risk Report
              </span>
            </div>
            <h2 style={{ fontFamily: UI.serif, fontSize: "1.3rem", fontWeight: 700, color: UI.ink, margin: 0 }}>
              Share with Carrier
            </h2>
            <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.inkLight, margin: "0.25rem 0 0" }}>
              {property.address}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>

        {!profile ? (
          <>
            {/* Expiry selector */}
            <div>
              <label style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, display: "block", marginBottom: "0.5rem" }}>
                Link expiry
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setExpiryDays(opt.value)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      border: `1px solid ${expiryDays === opt.value ? UI.rust : UI.rule}`,
                      background: expiryDays === opt.value ? UI.rust : "transparent",
                      color: expiryDays === opt.value ? UI.paper : UI.ink,
                      fontFamily: UI.mono, fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: "0.8rem", fontFamily: UI.mono, color: UI.inkLight, background: "#f9f7f3", border: `1px solid ${UI.rule}`, padding: "0.85rem 1rem", lineHeight: 1.6 }}>
              Generates a machine-readable JSON report with your property's maintenance score, sensor coverage, open alerts, and verified work history. Share the link with your insurance carrier for underwriting.
            </div>

            <Button onClick={handleGenerate} disabled={generating} style={{ alignSelf: "flex-start" }}>
              {generating ? "Generating…" : "Generate Risk Profile"}
            </Button>
          </>
        ) : (
          <>
            {/* Score display */}
            <div style={{
              border: `1px solid ${UI.rule}`, padding: "1.25rem",
              display: "flex", alignItems: "center", gap: "1.25rem",
            }}>
              <div style={{ textAlign: "center", minWidth: 64 }}>
                <div style={{ fontFamily: UI.serif, fontSize: "2.5rem", fontWeight: 900, color: gradeColor, lineHeight: 1 }}>
                  {grade}
                </div>
                <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginTop: "0.2rem" }}>
                  Grade
                </div>
              </div>
              <div style={{ borderLeft: `1px solid ${UI.rule}`, paddingLeft: "1.25rem" }}>
                <div style={{ fontFamily: UI.serif, fontSize: "2rem", fontWeight: 700, color: UI.ink, lineHeight: 1 }}>
                  {profile.maintenanceScore}<span style={{ fontSize: "1rem", color: UI.inkLight }}>/100</span>
                </div>
                <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginTop: "0.2rem" }}>
                  Maintenance Score
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {[
                    { label: "Sensors",   value: profile.sensorCoverage.length },
                    { label: "Open jobs", value: profile.openJobs },
                    { label: "Verified",  value: profile.verifiedJobCount },
                    { label: "Permits",   value: profile.permitCount },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.9rem", fontWeight: 600, color: UI.ink }}>{value}</div>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Share URL */}
            <div>
              <label style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, display: "block", marginBottom: "0.4rem" }}>
                Verification link
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div style={{
                  flex: 1, fontFamily: UI.mono, fontSize: "0.72rem", color: UI.inkLight,
                  border: `1px solid ${UI.rule}`, padding: "0.5rem 0.75rem",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {shareUrl}
                </div>
                <button
                  onClick={handleCopy}
                  style={{ border: `1px solid ${UI.rule}`, background: "transparent", cursor: "pointer", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: UI.mono, fontSize: "0.72rem", color: UI.ink }}
                >
                  {copied ? <CheckCircle size={14} color="#2a7a4b" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Button onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Download size={14} /> Download JSON
              </Button>
              <button
                onClick={() => setProfile(null)}
                style={{ fontFamily: UI.mono, fontSize: "0.72rem", color: UI.inkLight, background: "none", border: `1px solid ${UI.rule}`, padding: "0.5rem 0.85rem", cursor: "pointer" }}
              >
                Generate new
              </button>
            </div>

            {profile.expiresAt && (
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, margin: 0 }}>
                Expires {new Date(profile.expiresAt).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
