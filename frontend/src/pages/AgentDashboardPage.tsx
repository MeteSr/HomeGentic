/**
 * Agent Dashboard — /agent-dashboard
 *
 * For Realtors only. Shows all share links generated across all their
 * client properties with view counts, expiry, and revoke controls.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Eye, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { usePropertyStore } from "@/store/propertyStore";
import { useAuthStore } from "@/store/authStore";
import { propertyService } from "@/services/property";
import { reportService, ShareLink } from "@/services/report";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

interface LinkRow extends ShareLink {
  propertyAddress: string;
}

export default function AgentDashboardPage() {
  const navigate  = useNavigate();
  const { profile } = useAuthStore();
  const { properties, setProperties } = usePropertyStore();
  const [rows, setRows]     = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "Realtor") {
      navigate("/dashboard", { replace: true });
      return;
    }
    loadAll();
  }, [profile]);

  async function loadAll() {
    setLoading(true);
    try {
      const props = properties.length > 0 ? properties : await propertyService.getMyProperties();
      if (properties.length === 0) setProperties(props);

      const allLinks = await Promise.all(
        props.map(async (p) => {
          try {
            const links = await reportService.listShareLinks(String(p.id));
            return links.map((l): LinkRow => ({
              ...l,
              propertyAddress: `${p.address}, ${p.city}`,
            }));
          } catch {
            return [];
          }
        })
      );

      const flat = allLinks.flat().sort((a, b) => b.createdAt - a.createdAt);
      setRows(flat);
    } catch (err: any) {
      toast.error("Failed to load share links");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(token: string) {
    setRevoking(token);
    try {
      await reportService.revokeShareLink(token);
      setRows((prev) => prev.map((r) => r.token === token ? { ...r, isActive: false } : r));
      toast.success("Link revoked");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  }

  const activeCount  = rows.filter((r) => r.isActive).length;
  const totalViews   = rows.reduce((s, r) => s + r.viewCount, 0);

  return (
    <Layout>
      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Realtor Tools
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Agent Dashboard
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "2rem" }}>
          All HomeFax share links you've generated — track views and manage access.
        </p>

        {/* Summary stats */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
            {[
              { label: "Total Links",   value: String(rows.length) },
              { label: "Active Links",  value: String(activeCount) },
              { label: "Total Views",   value: String(totalViews) },
            ].map((s) => (
              <div key={s.label} style={{ padding: "1.25rem 1.5rem", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, background: "#fff" }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>{s.label}</div>
                <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}><div className="spinner-lg" /></div>
        ) : rows.length === 0 ? (
          <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No share links yet</p>
            <p style={{ fontSize: "0.875rem", color: S.inkLight, fontWeight: 300, maxWidth: "24rem", margin: "0 auto 1.5rem" }}>
              Generate a HomeFax report from a property's detail page to create a shareable link.
            </p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </div>
        ) : (
          <div style={{ border: `1px solid ${S.rule}` }}>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto",
              gap: "0.75rem", padding: "0.75rem 1rem",
              borderBottom: `1px solid ${S.rule}`, background: S.paper,
            }}>
              {["Property", "Created", "Expiry", "Views", "Status", ""].map((h) => (
                <div key={h} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
                  {h}
                </div>
              ))}
            </div>

            {rows.map((row, i) => {
              const createdLabel = new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const expiryLabel  = reportService.expiryLabel(row);
              const isExpired    = !!row.expiresAt && Date.now() > row.expiresAt;

              return (
                <div
                  key={row.token}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto",
                    gap: "0.75rem", padding: "0.875rem 1rem", alignItems: "center",
                    borderBottom: i < rows.length - 1 ? `1px solid ${S.rule}` : "none",
                    background: row.isActive ? "#fff" : "#FAFAF8",
                    opacity: !row.isActive || isExpired ? 0.65 : 1,
                  }}
                >
                  {/* Property */}
                  <div>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.125rem" }}>{row.propertyAddress}</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>{row.token}</p>
                  </div>

                  {/* Created */}
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{createdLabel}</div>

                  {/* Expiry */}
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: isExpired ? S.rust : S.inkLight }}>{expiryLabel}</div>

                  {/* Views */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                    <Eye size={11} /> {row.viewCount}
                  </div>

                  {/* Status */}
                  <div>
                    {!row.isActive   ? <Badge variant="default">Revoked</Badge>
                    : isExpired      ? <Badge variant="warning">Expired</Badge>
                    : row.visibility === "Public" ? <Badge variant="success">Public</Badge>
                    : <Badge variant="info">Buyer Only</Badge>}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <a
                      href={reportService.shareUrl(row.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", padding: "0.25rem", color: S.inkLight, border: `1px solid ${S.rule}`, background: "none" }}
                      title="Open report"
                    >
                      <ExternalLink size={12} />
                    </a>
                    {row.isActive && !isExpired && (
                      <button
                        onClick={() => revoke(row.token)}
                        disabled={revoking === row.token}
                        title="Revoke link"
                        style={{ display: "flex", alignItems: "center", padding: "0.25rem", color: S.rust, border: `1px solid ${S.rust}30`, background: "none", cursor: "pointer" }}
                      >
                        {revoking === row.token ? <div className="spinner-sm" /> : <X size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
