import React, { useEffect, useState } from "react";
import { X, Link2, Copy, CheckCircle, Trash2, Shield, Eye, Clock, EyeOff } from "lucide-react";
import { Button } from "@/components/Button";
import { reportService, ShareLink, propertyToInput, jobToInput, DisclosureOptions } from "@/services/report";
import { agentProfileService } from "@/services/agentProfile";
import { jobService } from "@/services/job";
import { computeScore, getScoreGrade } from "@/services/scoreService";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

interface GenerateReportModalProps {
  property: Property;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: "7 days",  value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never",   value: null },
] as const;

export function GenerateReportModal({ property, onClose }: GenerateReportModalProps) {
  const [links,        setLinks]        = useState<ShareLink[]>([]);
  const [generating,   setGenerating]   = useState(false);
  const [expiryDays,   setExpiryDays]   = useState<number | null>(30);
  const [copiedToken,  setCopiedToken]  = useState<string>("");
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [freshLink,    setFreshLink]    = useState<ShareLink | null>(null);
  const [previewStats, setPreviewStats] = useState<{ score: number; grade: string; verifiedCount: number } | null>(null);
  const [disclosure,   setDisclosure]   = useState<DisclosureOptions>({
    hideAmounts: false, hideContractors: false,
    hidePermits: false, hideDescriptions: false,
  });

  const propertyId = String(property.id);

  useEffect(() => {
    reportService.listShareLinks(propertyId)
      .then(setLinks)
      .finally(() => setLoadingLinks(false));
  }, [propertyId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const jobs = await jobService.getByProperty(propertyId);
      const score        = computeScore(jobs, [property]);
      const grade        = getScoreGrade(score);
      const verifiedCount = jobs.filter((j) => j.verified || j.status === "verified").length;
      const link = await reportService.generateReport(
        propertyId,
        propertyToInput(property),
        jobs.map(jobToInput),
        expiryDays,
        "Public"
      );
      setLinks((prev) => [link, ...prev]);
      setFreshLink(link);
      setPreviewStats({ score, grade, verifiedCount });
      toast.success("HomeFax report created!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (token: string, linkDisclosure?: DisclosureOptions) => {
    let url = reportService.shareUrl(token, linkDisclosure ?? disclosure);
    const agentProfile = agentProfileService.load();
    if (agentProfile) url = agentProfileService.appendToUrl(url, agentProfile);
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied!");
    setTimeout(() => setCopiedToken(""), 2000);
  };

  const handleRevoke = async (token: string) => {
    try {
      await reportService.revokeShareLink(token);
      setLinks((prev) => prev.map((l) => l.token === token ? { ...l, isActive: false } : l));
      toast.success("Link revoked");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke link");
    }
  };

  const activeLinks   = links.filter((l) => l.isActive && (!l.expiresAt || l.expiresAt > Date.now()));
  const inactiveLinks = links.filter((l) => !l.isActive || (l.expiresAt != null && l.expiresAt <= Date.now()));

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", width: "100%", maxWidth: "30rem",
        maxHeight: "90vh", overflow: "auto",
        border: `1px solid ${S.rule}`,
      }}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "1.5rem 1.5rem 1.25rem",
          borderBottom: `1px solid ${S.rule}`,
          background: S.ink,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Shield size={16} color={S.rust} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#7A7268", marginBottom: "0.2rem" }}>
                HomeFax Report
              </p>
              <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", lineHeight: 1, color: S.paper }}>
                {property.address}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7268", padding: "0.25rem", flexShrink: 0, marginLeft: "0.75rem" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Generate section */}
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
              Generate new link
            </p>

            {/* Expiry picker */}
            <div style={{ display: "flex", gap: "1px", background: S.rule, marginBottom: "1rem" }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setExpiryDays(opt.value)}
                  style={{
                    flex: 1, padding: "0.45rem 0",
                    fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    border: "none", cursor: "pointer",
                    background: expiryDays === opt.value ? S.ink : "#fff",
                    color:      expiryDays === opt.value ? S.paper : S.inkLight,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Disclosure toggles */}
            <div style={{ border: `1px solid ${S.rule}`, marginBottom: "1rem" }}>
              <div style={{ padding: "0.5rem 0.875rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <EyeOff size={11} color={S.inkLight} />
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                  Hide from viewer
                </span>
              </div>
              {(
                [
                  { key: "hideAmounts"      as const, label: "Job amounts"       },
                  { key: "hideContractors"  as const, label: "Contractor names"  },
                  { key: "hidePermits"      as const, label: "Permit numbers"    },
                  { key: "hideDescriptions" as const, label: "Job descriptions"  },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.875rem", cursor: "pointer", borderBottom: `1px solid ${S.rule}` }}
                >
                  <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.ink }}>{label}</span>
                  <input
                    type="checkbox"
                    checked={disclosure[key]}
                    onChange={(e) => setDisclosure((d) => ({ ...d, [key]: e.target.checked }))}
                    style={{ accentColor: S.rust, width: "0.875rem", height: "0.875rem" }}
                  />
                </label>
              ))}
            </div>

            <Button
              loading={generating}
              onClick={handleGenerate}
              icon={<Link2 size={14} />}
              style={{ width: "100%" }}
            >
              Generate Report Link
            </Button>

            {property.verificationLevel === "Unverified" && (
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.rust, marginTop: "0.625rem", letterSpacing: "0.04em" }}>
                Note: this property is unverified — the report will be marked as self-reported.
              </p>
            )}
          </div>

          {/* Share preview — shown immediately after generation */}
          {freshLink && previewStats && (
            <div style={{ border: `1px solid ${S.sage}`, background: "#F0F6F3" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${S.sage}30`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage }}>
                  Link ready to share
                </span>
                <button
                  onClick={() => setFreshLink(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: S.sage, padding: 0 }}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: "1rem" }}>
                <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.9rem", color: S.ink, marginBottom: "0.625rem" }}>
                  {property.address}, {property.city}
                </p>
                <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.875rem" }}>
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.15rem" }}>HomeFax Score</p>
                    <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: S.ink }}>
                      {previewStats.score} <span style={{ fontFamily: S.mono, fontWeight: 400, fontSize: "0.7rem", color: S.inkLight }}>{previewStats.grade}</span>
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.15rem" }}>Verified Jobs</p>
                    <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: S.ink }}>{previewStats.verifiedCount}</p>
                  </div>
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.15rem" }}>Expiry</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>{reportService.expiryLabel(freshLink)}</p>
                  </div>
                </div>
                <button
                  onClick={() => { handleCopy(freshLink.token); setFreshLink(null); }}
                  style={{
                    width: "100%", padding: "0.6rem",
                    background: S.ink, color: "#F4F1EB",
                    fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem",
                  }}
                >
                  <Copy size={12} /> Copy Share Link
                </button>
              </div>
            </div>
          )}

          {/* Active links */}
          {loadingLinks ? (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div className="spinner" />
            </div>
          ) : activeLinks.length > 0 ? (
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
                Active links ({activeLinks.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
                {activeLinks.map((link) => (
                  <div key={link.token} style={{ background: "#fff", padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <Clock size={11} color={S.inkLight} />
                          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
                            {reportService.expiryLabel(link)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <Eye size={11} color={S.inkLight} />
                          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                            {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <button
                          onClick={() => handleCopy(link.token)}
                          title="Copy link"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "0.3rem",
                            padding: "0.35rem 0.75rem",
                            fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                            border: `1px solid ${copiedToken === link.token ? S.sage : S.rule}`,
                            color:  copiedToken === link.token ? S.sage : S.inkLight,
                            background: "none", cursor: "pointer",
                          }}
                        >
                          {copiedToken === link.token ? <CheckCircle size={11} /> : <Copy size={11} />}
                          {copiedToken === link.token ? "Copied" : "Copy"}
                        </button>
                        <button
                          onClick={() => handleRevoke(link.token)}
                          title="Revoke link"
                          style={{
                            display: "inline-flex", alignItems: "center",
                            padding: "0.35rem 0.5rem",
                            border: `1px solid ${S.rule}`, color: S.rust,
                            background: "none", cursor: "pointer",
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Revoked / expired */}
          {inactiveLinks.length > 0 && (
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
                Expired / revoked
              </p>
              {inactiveLinks.map((link) => (
                <div key={link.token} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderTop: `1px solid ${S.rule}` }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                    {new Date(link.createdAt).toLocaleDateString()}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                    {link.isActive ? "Expired" : "Revoked"} · {link.viewCount} views
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
