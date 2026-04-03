/**
 * BuilderDashboard — 7.2.5
 *
 * Shows a builder's development portfolio:
 *   • Unit list with address, job count, and pending-transfer status
 *   • Bulk property import (CSV)
 *   • Bulk subcontractor job import (CSV)
 *   • Per-unit "Transfer to Buyer" action
 */

import React, { useEffect, useRef, useState } from "react";
import { builderService, type BuilderDevelopment } from "@/services/builderService";

// ─── Design tokens (matches app-wide blueprint aesthetic) ────────────────────

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  inkLight: "#7A7268",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BuilderDashboard() {
  const [developments, setDevelopments] = useState<BuilderDevelopment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [importMsg, setImportMsg]       = useState<string | null>(null);

  const propFileRef = useRef<HTMLInputElement>(null);
  const jobFileRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    builderService.getDevelopments().then((devs) => {
      setDevelopments(devs);
      setLoading(false);
    });
  }, []);

  async function handleImportProperties(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const rows   = builderService.parsePropertiesCsv(text);
      const result = await builderService.bulkImportProperties(rows);
      setImportMsg(
        `Properties imported: ${result.succeeded.length} succeeded, ${result.failed.length} failed.`
      );
      const updated = await builderService.getDevelopments();
      setDevelopments(updated);
    } catch (err: any) {
      setImportMsg(`Import error: ${err.message}`);
    }
    e.target.value = "";
  }

  async function handleImportJobs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const rows   = builderService.parseJobsCsv(text);
      const result = await builderService.importSubcontractorJobs(rows);
      setImportMsg(
        `Jobs imported: ${result.succeeded.length} succeeded, ${result.failed.length} failed.`
      );
      const updated = await builderService.getDevelopments();
      setDevelopments(updated);
    } catch (err: any) {
      setImportMsg(`Import error: ${err.message}`);
    }
    e.target.value = "";
  }

  async function handleTransfer(propertyId: string) {
    const buyerPrincipal = window.prompt("Enter the buyer's Internet Identity principal:");
    if (!buyerPrincipal) return;
    await builderService.initiateFirstBuyerTransfer(propertyId, buyerPrincipal);
    const updated = await builderService.getDevelopments();
    setDevelopments(updated);
    setImportMsg(`Transfer initiated for property ${propertyId}.`);
  }

  return (
    <div style={{ fontFamily: S.sans, color: S.ink, padding: "2rem", maxWidth: 900 }}>
      <h1 style={{ fontFamily: S.serif, fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Builder Dashboard
      </h1>
      <p style={{ color: S.inkLight, fontFamily: S.mono, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2rem" }}>
        Development portfolio &amp; unit management
      </p>

      {/* ── Import actions ── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <input
          ref={propFileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleImportProperties}
        />
        <button
          onClick={() => propFileRef.current?.click()}
          style={btnStyle}
        >
          Import Properties
        </button>

        <input
          ref={jobFileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleImportJobs}
        />
        <button
          onClick={() => jobFileRef.current?.click()}
          style={{ ...btnStyle, background: "transparent", color: S.ink, border: `1px solid ${S.rule}` }}
        >
          Import Jobs
        </button>
      </div>

      {importMsg && (
        <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight, marginBottom: "1.25rem" }}>
          {importMsg}
        </p>
      )}

      {/* ── Development table ── */}
      {loading ? (
        <p style={{ color: S.inkLight }}>Loading developments…</p>
      ) : developments.length === 0 ? (
        <p style={{ color: S.inkLight }}>No properties imported yet. Use "Import Properties" to get started.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${S.rule}` }}>
              {["Address", "Type", "Year Built", "Sq Ft", "Jobs", "Status", "Action"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {developments.map((dev) => (
              <tr key={dev.propertyId} style={{ borderBottom: `1px solid ${S.rule}` }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{dev.address}</div>
                  <div style={{ color: S.inkLight, fontSize: "0.75rem" }}>
                    {dev.city}, {dev.state} {dev.zipCode}
                  </div>
                </td>
                <td style={tdStyle}>{dev.propertyType}</td>
                <td style={tdStyle}>{dev.yearBuilt}</td>
                <td style={tdStyle}>{dev.squareFeet.toLocaleString()}</td>
                <td style={tdStyle}>{dev.jobCount} {dev.jobCount === 1 ? "job" : "jobs"}</td>
                <td style={tdStyle}>
                  {dev.pendingTransfer ? (
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: S.rust, border: `1px solid ${S.rust}`, padding: "2px 6px" }}>
                      Transfer Pending — {dev.pendingTransfer.buyerPrincipal.slice(0, 12)}…
                    </span>
                  ) : (
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: S.inkLight }}>
                      Available
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleTransfer(dev.propertyId)}
                    style={{ ...btnStyle, fontSize: "0.7rem", padding: "4px 10px" }}
                  >
                    Transfer to Buyer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  background:    "#0E0E0C",
  color:         "#F4F1EB",
  border:        "none",
  padding:       "8px 16px",
  fontFamily:    "'IBM Plex Mono', monospace",
  fontSize:      "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  cursor:        "pointer",
};

const thStyle: React.CSSProperties = {
  fontFamily:    "'IBM Plex Mono', monospace",
  fontSize:      "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color:         "#7A7268",
  textAlign:     "left",
  padding:       "6px 8px",
};

const tdStyle: React.CSSProperties = {
  padding:    "10px 8px",
  fontSize:   "0.85rem",
  verticalAlign: "top",
};
