import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { CountdownTimer } from "./components/CountdownTimer";
import { DocumentUploadZone } from "./components/DocumentUploadZone";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";

type DocType = "UtilityBill" | "DeedRecord" | "TaxRecord";

const DOC_OPTIONS: Array<{ value: DocType; label: string; badge: string; badgeColor: string; badgeBg: string; desc: string }> = [
  { value: "UtilityBill", label: "Utility bill",   badge: "BASIC",    badgeColor: "#2E7D32", badgeBg: "#E8F5E9", desc: "Electric, gas, or water bill from the last 90 days" },
  { value: "DeedRecord",  label: "Property deed",  badge: "PREMIUM",  badgeColor: "#1565C0", badgeBg: "#E3F2FD", desc: "Warranty deed, grant deed, or quitclaim deed" },
  { value: "TaxRecord",   label: "Tax record",     badge: "PREMIUM",  badgeColor: "#1565C0", badgeBg: "#E3F2FD", desc: "County tax assessment or annual property tax statement" },
];

export default function VerifyDocumentPage() {
  const navigate             = useNavigate();
  const { id }               = useParams<{ id: string }>();
  const { claim, refresh }   = useVerifyContext();
  const [docType, setDocType] = useState<DocType>("DeedRecord");
  const [file,    setFile]    = useState<File | null>(null);
  const [hash,    setHash]    = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (f: File, h: string) => {
    setFile(f);
    setHash(h);
  };

  const handleSubmit = async () => {
    if (!file || !hash || !id) return;
    setSubmitting(true);
    try {
      await propertyService.submitVerification(id, docType, hash, claim.nameOnId ?? undefined);
      await refresh();
      navigate(`/properties/${id}/verify/status`);
    } catch (err: any) {
      toast.error(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const msLeft    = Math.max(0, claim.claimWindowEndsAt - Date.now());
  const isUrgent  = msLeft <= 12 * 60 * 60 * 1000;
  const nameMatch: boolean | null = claim.nameOnId != null && claim.nameOnDocument != null
    ? claim.nameOnId === claim.nameOnDocument
    : null;

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <CountdownTimer
          claimStartedAt={claim.claimStartedAt}
          claimWindowEndsAt={claim.claimWindowEndsAt}
          subtitle={isUrgent ? "Less than 12 hours left — act now." : undefined}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>
          {/* Main column */}
          <div>
            <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.blue, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Step 2 · What You Own
            </div>
            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
              Upload the ownership document.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              We compute a SHA-256 hash of your file and record it on-chain. The file itself is never stored on HomeGentic servers.
            </p>

            {/* Section 1: Document type */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                1 — Document Type
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DOC_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${docType === opt.value ? V2_COLORS.blue : V2_COLORS.border}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", background: docType === opt.value ? V2_COLORS.lblue : V2_COLORS.paper, transition: "border-color 0.15s" }}
                  >
                    <input
                      type="radio"
                      name="doc-type"
                      value={opt.value}
                      checked={docType === opt.value}
                      onChange={() => setDocType(opt.value)}
                      style={{ accentColor: V2_COLORS.blue }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>{opt.label}</span>
                        <span style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: opt.badgeColor, background: opt.badgeBg, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.05em" }}>{opt.badge}</span>
                      </div>
                      <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Section 2: Upload */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                2 — Upload and Hash
              </div>
              {file ? (
                <div style={{ border: `1px solid ${V2_COLORS.blue}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: V2_COLORS.lblue }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>{file.name}</div>
                    <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>{(file.size / 1024).toFixed(0)} KB · SHA-256: {hash.slice(0, 12)}…</div>
                  </div>
                  <button onClick={() => { setFile(null); setHash(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, fontSize: 18 }}>×</button>
                </div>
              ) : (
                <DocumentUploadZone onFile={handleFile} />
              )}
            </div>

            {/* Section 3: Name match */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                3 — Name Match
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ border: `1px solid ${V2_COLORS.border}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Name on ID</div>
                  <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>
                    {claim.nameOnId ?? <span style={{ color: V2_COLORS.muted, fontWeight: 400, fontStyle: "italic" }}>Complete Step 1 first</span>}
                  </div>
                </div>
                <div style={{ border: `1px solid ${V2_COLORS.border}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Name on Document</div>
                  <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>
                    {claim.nameOnDocument ?? <span style={{ color: V2_COLORS.muted, fontWeight: 400, fontStyle: "italic" }}>Detected from document</span>}
                  </div>
                </div>
              </div>
              {nameMatch === false && (
                <div style={{ marginTop: 8, fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.coral }}>
                  &#9888; Names differ — you may need to verify as a representative.
                </div>
              )}
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handleSubmit}
                disabled={!file || submitting}
                style={{ background: !file || submitting ? V2_COLORS.border : V2_COLORS.blue, color: !file || submitting ? V2_COLORS.muted : "#fff", border: "none", borderRadius: 100, padding: "12px 28px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: !file || submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Submitting…" : "Add a document to continue"}
              </button>
              <button
                onClick={() => navigate(`/properties/${id}/verify/representative`)}
                style={{ background: "none", border: `1px solid ${V2_COLORS.border}`, color: V2_COLORS.muted2, borderRadius: 100, padding: "12px 20px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              >
                Names differ
              </button>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {claim.identityVerified && (
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: "#16A34A", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Identity Cleared
                </div>
                <div style={{ fontSize: 15, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink, marginBottom: 4 }}>
                  {claim.nameOnId ?? "Verified"}
                </div>
                {claim.identityVerifiedAt && (
                  <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>
                    {new Date(claim.identityVerifiedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                What Reviewers Look For
              </div>
              {[
                "Your legal name appears on the document",
                "The property address matches exactly",
                "Document is dated within 12 months",
                "File is legible and unaltered",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: V2_COLORS.blue, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
