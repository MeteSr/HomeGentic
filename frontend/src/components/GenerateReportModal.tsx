import React, { useEffect, useState } from "react";
import { X, Link2, Copy, CheckCircle, Trash2, Shield, Eye } from "lucide-react";
import { Button } from "@/components/Button";
import { reportService, ShareLink, propertyToInput, jobToInput } from "@/services/report";
import { jobService } from "@/services/job";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";

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
  const [links, setLinks]           = useState<ShareLink[]>([]);
  const [generating, setGenerating] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(30);
  const [copiedToken, setCopiedToken] = useState<string>("");
  const [loadingLinks, setLoadingLinks] = useState(true);

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
      const link = await reportService.generateReport(
        propertyId,
        propertyToInput(property),
        jobs.map(jobToInput),
        expiryDays,
        "Public"
      );
      setLinks((prev) => [link, ...prev]);
      toast.success("HomeFax report created!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (token: string) => {
    const url = reportService.shareUrl(token);
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
  const inactiveLinks = links.filter((l) => !l.isActive || (l.expiresAt && l.expiresAt <= Date.now()));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "1.25rem",
          width: "100%",
          maxWidth: "32rem",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 50px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.5rem 1.5rem 1.25rem",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Shield size={20} color="#3b82f6" />
            <div>
              <h2 style={{ fontWeight: 900, color: "#111827", fontSize: "1rem" }}>
                HomeFax Report
              </h2>
              <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>{property.address}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "0.25rem" }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Generate new report */}
          <div
            style={{
              backgroundColor: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "0.875rem",
              padding: "1.25rem",
            }}
          >
            <p style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: "0.875rem", fontSize: "0.875rem" }}>
              Generate a new shareable report
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setExpiryDays(opt.value)}
                  style={{
                    padding: "0.375rem 0.875rem",
                    borderRadius: "9999px",
                    border: `1.5px solid ${expiryDays === opt.value ? "#3b82f6" : "#e5e7eb"}`,
                    backgroundColor: expiryDays === opt.value ? "#eff6ff" : "white",
                    color: expiryDays === opt.value ? "#1d4ed8" : "#6b7280",
                    fontWeight: 600,
                    fontSize: "0.813rem",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              loading={generating}
              onClick={handleGenerate}
              icon={<Link2 size={16} />}
              style={{ width: "100%" }}
            >
              Generate Report Link
            </Button>
          </div>

          {/* Active links */}
          {loadingLinks ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
              <div className="spinner" />
            </div>
          ) : activeLinks.length > 0 ? (
            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.625rem" }}>
                Active links
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {activeLinks.map((link) => (
                  <div
                    key={link.token}
                    style={{
                      backgroundColor: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "0.75rem",
                      padding: "0.875rem 1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <p style={{ fontSize: "0.813rem", fontWeight: 600, color: "#111827" }}>
                        {reportService.expiryLabel(link)}
                      </p>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <button
                          onClick={() => handleCopy(link.token)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: copiedToken === link.token ? "#10b981" : "#6b7280", padding: "0.25rem" }}
                          title="Copy link"
                        >
                          {copiedToken === link.token ? <CheckCircle size={16} /> : <Copy size={16} />}
                        </button>
                        <button
                          onClick={() => handleRevoke(link.token)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "0.25rem" }}
                          title="Revoke link"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <Eye size={12} /> {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
                      </span>
                      <span>Created {new Date(link.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Revoked / expired */}
          {inactiveLinks.length > 0 && (
            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.625rem" }}>
                Expired / revoked
              </p>
              {inactiveLinks.map((link) => (
                <div
                  key={link.token}
                  style={{ fontSize: "0.813rem", color: "#d1d5db", padding: "0.375rem 0", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between" }}
                >
                  <span>{new Date(link.createdAt).toLocaleDateString()}</span>
                  <span>{link.isActive ? "Expired" : "Revoked"} · {link.viewCount} views</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
