import React, { useState } from "react";
import { X } from "lucide-react";
import { aiProxyService } from "@/services/aiProxy";
import { COLORS, FONTS } from "@/theme";
import toast from "react-hot-toast";

const DAYTONA_CITIES = new Set([
  "Daytona Beach",
  "Ormond Beach",
  "Ponce Inlet",
  "Port Orange",
  "South Daytona",
]);

const DISMISS_KEY = "hg_local_broker_dismissed";
const BROKER_RECIPIENT_ENV = (import.meta as any).env?.VITE_LOCAL_BROKER_EMAIL ?? "";

export function isLocalBrokerArea(cities: string[]): boolean {
  return cities.some((c) => DAYTONA_CITIES.has(c.trim()));
}

export function isLocalBrokerDismissed(): boolean {
  try { return !!localStorage.getItem(DISMISS_KEY); } catch { return false; }
}

interface Props {
  propertyAddress: string;
  onClose: () => void;
}

export default function LocalBrokerModal({ propertyAddress, onClose }: Props) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    setSubmitting(true);
    try {
      const html = `
        <p><strong>Local Broker Consultation Request</strong></p>
        <p><strong>Name:</strong> ${form.name}</p>
        <p><strong>Email:</strong> ${form.email}</p>
        <p><strong>Phone:</strong> ${form.phone || "—"}</p>
        <p><strong>Property:</strong> ${propertyAddress}</p>
      `;
      await aiProxyService.sendEmail(
        BROKER_RECIPIENT_ENV,
        "HomeGentic: Local Broker Consultation Request",
        html,
      );
      setSent(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    } catch {
      toast.error("Could not send request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const UI = {
    ink:      COLORS.plum,
    inkLight: COLORS.plumMid,
    rule:     COLORS.rule,
    sage:     COLORS.sageText,
    serif:    FONTS.serif,
    mono:     FONTS.sans,
    sans:     FONTS.sans,
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "0.625rem 0.75rem",
    fontFamily: UI.sans, fontSize: "0.9rem", color: UI.ink,
    border: `1px solid ${UI.rule}`, background: "#fff",
    outline: "none", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: UI.mono, fontSize: "0.6rem",
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: UI.inkLight, marginBottom: "0.3rem",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(14,14,12,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: "1rem",
    }}>
      <div style={{
        background: "#fff", maxWidth: 480, width: "100%",
        border: `1px solid ${UI.rule}`, position: "relative",
      }}>
        {/* Header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
            Local Broker — Daytona Area
          </p>
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "1.5rem" }}>
          {sent ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", color: UI.ink, marginBottom: "0.5rem" }}>
                Request sent!
              </p>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, marginBottom: "1.5rem" }}>
                Our local partner will be in touch for a free consultation.
              </p>
              <button onClick={onClose} style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.5rem 1.25rem", background: COLORS.plum, color: "#fff", border: "none", cursor: "pointer" }}>
                Close
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink, marginBottom: "0.5rem" }}>
                Selling in the Daytona Beach area?
              </h2>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, marginBottom: "1.5rem", lineHeight: 1.6 }}>
                We partner with a local broker who knows this market. Would you like to be contacted for a free consultation?
              </p>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    style={fieldStyle}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    style={fieldStyle}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Property</label>
                  <input value={propertyAddress} readOnly style={{ ...fieldStyle, background: "#F9F9F9", color: UI.inkLight }} />
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ flex: 1, padding: "0.625rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", background: COLORS.plum, color: "#fff", border: "none", cursor: "pointer", opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? "Sending…" : "Yes, contact me"}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    style={{ padding: "0.625rem 1rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", background: "none", color: UI.inkLight, border: `1px solid ${UI.rule}`, cursor: "pointer" }}
                  >
                    No thanks
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
