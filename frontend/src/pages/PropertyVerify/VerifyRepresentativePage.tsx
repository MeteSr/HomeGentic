import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { DocumentUploadZone } from "./components/DocumentUploadZone";
import toast from "react-hot-toast";

type Relationship = "llc_officer" | "trustee" | "poa" | "executor";

const RELATIONSHIPS: Array<{ value: Relationship; label: string; desc: string }> = [
  { value: "llc_officer", label: "Officer or member of an LLC",  desc: "Managing member, president, or authorized officer" },
  { value: "trustee",     label: "Trustee of a trust",          desc: "Named trustee on a revocable or irrevocable trust" },
  { value: "poa",         label: "Power of attorney",           desc: "Holding a durable or general POA for the owner" },
  { value: "executor",    label: "Executor or heir",            desc: "Administering an estate or inheriting the property" },
];

export default function VerifyRepresentativePage() {
  const navigate                   = useNavigate();
  const { id }                     = useParams<{ id: string }>();
  const { claim }                  = useVerifyContext();
  const [relationship, setRelation] = useState<Relationship | "">("");
  const [authFile,  setAuthFile]   = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAuthFile = (f: File) => setAuthFile(f);

  const handleSubmit = async () => {
    if (!relationship || !authFile) {
      toast.error("Select your relationship and upload an authorization document.");
      return;
    }
    setSubmitting(true);
    // Stub: in production, POST to backend
    try {
      await new Promise((r) => setTimeout(r, 800));
      toast.success("Sent for manual review. We'll notify you within 1–2 days.");
      navigate(`/properties/${id}/verify/status`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>
          {/* Main column */}
          <div>
            {/* Warning banner */}
            {(claim.nameOnId || claim.nameOnDocument) && (
              <div style={{ background: "#FFF8E7", border: "1px solid #FFD97D", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600, color: "#92400E", marginBottom: 2 }}>
                    The names do not match, so a person will look at it.
                  </div>
                  <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: "#92400E" }}>
                    ID: {claim.nameOnId ?? "—"} · Document: {claim.nameOnDocument ?? "—"}
                  </div>
                </div>
              </div>
            )}

            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
              Held for a person to check.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              When names differ or the property is held in an entity, our team reviews the relationship documents before granting ownership status.
            </p>

            {/* Relationship selection */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                Your Relationship to the Owner of Record
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {RELATIONSHIPS.map((r) => (
                  <label
                    key={r.value}
                    style={{ display: "flex", alignItems: "flex-start", gap: 12, border: `1px solid ${relationship === r.value ? V2_COLORS.blue : V2_COLORS.border}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", background: relationship === r.value ? V2_COLORS.lblue : V2_COLORS.paper, transition: "border-color 0.15s" }}
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value={r.value}
                      checked={relationship === r.value}
                      onChange={() => setRelation(r.value)}
                      style={{ accentColor: V2_COLORS.blue, marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Authorization doc upload */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Authorization Document
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted, marginBottom: 12 }}>
                Trust certificate, operating agreement page naming you, POA document, or letters testamentary.
              </p>
              {authFile ? (
                <div style={{ border: `1px solid ${V2_COLORS.blue}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: V2_COLORS.lblue }}>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>{authFile.name}</div>
                    <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>{(authFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => setAuthFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, fontSize: 18 }}>×</button>
                </div>
              ) : (
                <DocumentUploadZone onFile={(f) => handleAuthFile(f)} />
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!relationship || !authFile || submitting}
              style={{ background: !relationship || !authFile || submitting ? V2_COLORS.border : V2_COLORS.ink, color: !relationship || !authFile || submitting ? V2_COLORS.muted : "#fff", border: "none", borderRadius: 100, padding: "14px 28px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: !relationship || !authFile || submitting ? "not-allowed" : "pointer", width: "100%" }}
            >
              {submitting ? "Sending…" : "Send to manual review"}
            </button>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: V2_COLORS.ink, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, color: "#6B7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                The Clock Pauses
              </div>
              <div style={{ fontSize: 16, fontFamily: V2_FONTS.display, fontWeight: 700, color: "#fff", marginBottom: 10 }}>
                Review holds your place.
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: "#9CA3AF", lineHeight: 1.6, margin: 0 }}>
                Once you send for review, the 72-hour window is paused. No other claimant can take the address while your review is in progress.
              </p>
            </div>

            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Typical Turnaround
              </div>
              <div style={{ fontSize: 28, fontFamily: V2_FONTS.display, fontWeight: 800, color: V2_COLORS.blue, marginBottom: 6 }}>
                1–2 days
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, margin: 0 }}>
                Our review team works Monday through Friday. You'll receive an email when a decision is made.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
