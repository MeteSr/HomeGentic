import React, { useEffect, useState } from "react";
import { X, Link2, Copy, CheckCircle, Trash2, Shield, Eye, Clock, EyeOff } from "lucide-react";
import { Button } from "@/components/Button";
import { reportService, ShareLink, propertyToInput, jobToInput, roomToInput, DisclosureOptions } from "@/services/report";
import { roomService } from "@/services/room";
import { jobService } from "@/services/job";
import { recurringService } from "@/services/recurringService";
import { computeScore, getScoreGrade } from "@/services/scoreService";
import { paymentService, type PlanTier } from "@/services/payment";
import { notificationService } from "@/services/notifications";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  rust:     V2_COLORS.blue,
  inkLight: V2_COLORS.muted,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
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
  // Per-link disclosure overrides (keyed by token); defaults to the global disclosure
  const [linkDisclosures, setLinkDisclosures] = useState<Record<string, DisclosureOptions>>({});
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<PlanTier>("Free");
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const getLinkDisclosure = (token: string): DisclosureOptions =>
    linkDisclosures[token] ?? { hideAmounts: false, hideContractors: false, hidePermits: false, hideDescriptions: false };

  const setLinkField = (token: string, field: keyof DisclosureOptions, value: boolean) => {
    setLinkDisclosures((prev) => ({
      ...prev,
      [token]: { ...getLinkDisclosure(token), [field]: value },
    }));
  };

  const propertyId = String(property.id);

  useEffect(() => {
    paymentService.getMySubscription().then((s) => {
      setUserTier(s.tier);
    }).catch((e) => console.error("[GenerateReportModal] subscription load failed:", e))
      .finally(() => setSubscriptionLoading(false));
    reportService.listShareLinks(propertyId)
      .then(setLinks)
      .finally(() => setLoadingLinks(false));
  }, [propertyId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [jobs, recurringList, roomList] = await Promise.all([
        jobService.getByProperty(propertyId),
        recurringService.getByProperty(propertyId).catch(() => []),
        roomService.getRoomsByProperty(propertyId).catch(() => []),
      ]);
      const score        = computeScore(jobs, [property]);
      const grade        = getScoreGrade(score);
      const verifiedCount = jobs.filter((j) => j.verified || j.status === "verified").length;

      // Build recurring summaries with visit logs
      const recurringSummaries = await Promise.all(
        recurringList.map(async (svc) => {
          const visits = await recurringService.getVisitLogs(svc.id).catch(() => []);
          return recurringService.toSummary(svc, visits);
        })
      );

      const link = await reportService.generateReport(
        propertyId,
        propertyToInput(property),
        jobs.map(jobToInput),
        recurringSummaries,
        roomList.map(roomToInput),
        expiryDays,
        "Public"
      );
      setLinks((prev) => [link, ...prev]);
      setFreshLink(link);
      setPreviewStats({ score, grade, verifiedCount });
      toast.success("HomeGentic report created!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (token: string, linkDisclosure?: DisclosureOptions) => {
    const url = reportService.shareUrl(token, linkDisclosure ?? disclosure);
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
        background: V2_COLORS.paper, width: "100%", maxWidth: "30rem",
        maxHeight: "90vh", overflow: "auto",
        border: `1px solid ${UI.rule}`,
        borderRadius: V2_RADIUS.card,
        boxShadow: V2_SHADOWS.modal,
      }}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "1.5rem 1.5rem 1.25rem",
          borderBottom: `1px solid ${UI.rule}`,
          background: V2_COLORS.ink,
          borderRadius: `${V2_RADIUS.card}px ${V2_RADIUS.card}px 0 0`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Shield size={16} color={V2_COLORS.blue} />
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: V2_COLORS.muted, marginBottom: "0.2rem" }}>
                HomeGentic Report™
              </p>
              <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.1rem", lineHeight: 1, color: V2_COLORS.paper }}>
                {property.address}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, padding: "0.25rem", flexShrink: 0, marginLeft: "0.75rem" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Generate section */}
          <div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.875rem" }}>
              Generate new link
            </p>

            {/* Expiry picker */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: userTier === "Free" ? "0.5rem" : "1rem" }}>
              {EXPIRY_OPTIONS.map((opt) => {
                const locked = userTier === "Free" && (opt.value === null || (opt.value !== null && opt.value > 7));
                return (
                  <button
                    key={String(opt.value)}
                    onClick={() => !locked && setExpiryDays(opt.value)}
                    title={locked ? "Upgrade to Pro for longer expiry" : undefined}
                    style={{
                      flex: 1, padding: "0.45rem 0",
                      fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      border: `1px solid ${locked ? UI.rule : expiryDays === opt.value ? V2_COLORS.ink : UI.rule}`,
                      borderRadius: V2_RADIUS.sm,
                      cursor: locked ? "not-allowed" : "pointer",
                      background: locked ? UI.paper : expiryDays === opt.value ? V2_COLORS.ink : V2_COLORS.paper,
                      color: locked ? `${UI.inkLight}60` : expiryDays === opt.value ? V2_COLORS.paper : UI.inkLight,
                      opacity: locked ? 0.5 : 1,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {userTier === "Free" && (
              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "1rem" }}>
                Free plan links expire after 7 days. <a href="/pricing" style={{ color: V2_COLORS.ink, textDecoration: "underline" }}>Upgrade to Pro</a> for longer or permanent links.
              </p>
            )}

            {/* Disclosure toggles */}
            <div style={{ border: `1px solid ${UI.rule}`, borderRadius: V2_RADIUS.sm, marginBottom: "1rem", overflow: "hidden" }}>
              <div style={{ padding: "0.5rem 0.875rem", borderBottom: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <EyeOff size={11} color={UI.inkLight} />
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
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
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.875rem", cursor: "pointer", borderBottom: `1px solid ${UI.rule}` }}
                >
                  <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.ink }}>{label}</span>
                  <input
                    type="checkbox"
                    checked={disclosure[key]}
                    onChange={(e) => setDisclosure((d) => ({ ...d, [key]: e.target.checked }))}
                    style={{ accentColor: V2_COLORS.blue, width: "0.875rem", height: "0.875rem" }}
                  />
                </label>
              ))}
            </div>

            <Button
              loading={generating}
              disabled={subscriptionLoading}
              onClick={handleGenerate}
              icon={<Link2 size={14} />}
              style={{ width: "100%" }}
            >
              Generate Report Link
            </Button>

            {property.verificationLevel === "Unverified" && (
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.rust, marginTop: "0.625rem", letterSpacing: "0.04em" }}>
                Note: this property is unverified — the report will be marked as self-reported.
              </p>
            )}
          </div>

          {/* Share preview — shown immediately after generation */}
          {freshLink && previewStats && (
            <div style={{ border: `1px solid ${V2_COLORS.blue}`, background: V2_COLORS.lblue, borderRadius: V2_RADIUS.sm, overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${V2_COLORS.cobalTint}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.blue }}>
                  Link ready to share
                </span>
                <button
                  onClick={() => setFreshLink(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.blue, padding: 0 }}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: "1rem" }}>
                <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.9rem", color: UI.ink, marginBottom: "0.625rem" }}>
                  {property.address}, {property.city}
                </p>
                <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.875rem" }}>
                  <div>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.15rem" }}>HomeGentic Score</p>
                    <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: UI.ink }}>
                      {previewStats.score} <span style={{ fontFamily: UI.mono, fontWeight: 400, fontSize: "0.7rem", color: UI.inkLight }}>{previewStats.grade}</span>
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.15rem" }}>Verified Jobs</p>
                    <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: UI.ink }}>{previewStats.verifiedCount}</p>
                  </div>
                  <div>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.15rem" }}>Expiry</p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.ink }}>{reportService.expiryLabel(freshLink)}</p>
                  </div>
                </div>
                <button
                  onClick={() => { handleCopy(freshLink.token); setFreshLink(null); }}
                  style={{
                    width: "100%", padding: "0.6rem",
                    background: V2_COLORS.ink, color: V2_COLORS.paper,
                    fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
                    border: "none", cursor: "pointer", borderRadius: V2_RADIUS.sm,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem",
                  }}
                >
                  <Copy size={12} /> Copy Share Link
                </button>

                {/* Expiry status row (15.2.3) */}
                {userTier === "Free" ? (
                  <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#fff8e6", border: "1px solid #e8c84a", borderRadius: V2_RADIUS.sm, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: "#7a5c00" }}>
                      ⚠ This link expires in 7 days
                    </span>
                    <a href="/pricing" style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: V2_COLORS.ink, textDecoration: "underline", whiteSpace: "nowrap" }}>
                      Upgrade to Pro →
                    </a>
                  </div>
                ) : (
                  <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: V2_COLORS.lblue, border: `1px solid ${V2_COLORS.cobalTint}`, borderRadius: V2_RADIUS.sm, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: V2_COLORS.blue }}>
                      ✓ This link never expires
                    </span>
                  </div>
                )}
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
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
                Active links ({activeLinks.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {activeLinks.map((link) => {
                  const ld = getLinkDisclosure(link.token);
                  const hiddenCount = Object.values(ld).filter(Boolean).length;
                  const isExpanded = expandedToken === link.token;
                  return (
                    <div key={link.token} style={{ background: V2_COLORS.paper, border: `1px solid ${UI.rule}`, borderRadius: V2_RADIUS.sm, overflow: "hidden" }}>
                      <div style={{ padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <Clock size={11} color={UI.inkLight} />
                            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                              {reportService.expiryLabel(link)}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Eye size={11} color={UI.inkLight} />
                            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                              {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
                            </span>
                            {hiddenCount > 0 && (
                              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: V2_COLORS.blue, background: V2_COLORS.lblue, padding: "0.1rem 0.35rem", border: `1px solid ${V2_COLORS.cobalTint}`, borderRadius: V2_RADIUS.sm }}>
                                {hiddenCount} field{hiddenCount > 1 ? "s" : ""} hidden
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.375rem" }}>
                          <button
                            onClick={() => setExpandedToken(isExpanded ? null : link.token)}
                            title="Disclosure settings"
                            style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "0.35rem 0.5rem",
                              border: `1px solid ${isExpanded ? V2_COLORS.ink : UI.rule}`,
                              borderRadius: V2_RADIUS.sm,
                              color: isExpanded ? V2_COLORS.ink : UI.inkLight,
                              background: "none", cursor: "pointer",
                            }}
                          >
                            <EyeOff size={11} />
                          </button>
                          <button
                            onClick={() => handleCopy(link.token, ld)}
                            title="Copy link"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              padding: "0.35rem 0.75rem",
                              fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                              border: `1px solid ${copiedToken === link.token ? V2_COLORS.blue : UI.rule}`,
                              borderRadius: V2_RADIUS.sm,
                              color:  copiedToken === link.token ? V2_COLORS.blue : UI.inkLight,
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
                              border: `1px solid ${UI.rule}`, color: UI.rust,
                              borderRadius: V2_RADIUS.sm,
                              background: "none", cursor: "pointer",
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      {/* Per-link disclosure toggles */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${UI.rule}`, background: V2_COLORS.lblue, padding: "0.75rem 1rem" }}>
                          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
                            Hide from viewer for this link
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem" }}>
                            {(
                              [
                                { key: "hideAmounts"      as const, label: "Job amounts"      },
                                { key: "hideContractors"  as const, label: "Contractor names" },
                                { key: "hidePermits"      as const, label: "Permit numbers"   },
                                { key: "hideDescriptions" as const, label: "Job descriptions" },
                              ]
                            ).map(({ key, label }) => (
                              <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={ld[key]}
                                  onChange={(e) => setLinkField(link.token, key, e.target.checked)}
                                  style={{ accentColor: V2_COLORS.blue, width: "0.75rem", height: "0.75rem" }}
                                />
                                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>{label}</span>
                              </label>
                            ))}
                          </div>
                          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, marginTop: "0.5rem" }}>
                            Settings are encoded in the URL — copy again to share with new settings.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Revoked / expired */}
          {inactiveLinks.length > 0 && (
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
                Expired / revoked
              </p>
              {inactiveLinks.map((link) => (
                <div key={link.token} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderTop: `1px solid ${UI.rule}` }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                    {new Date(link.createdAt).toLocaleDateString()}
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
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
