import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Upload, CheckCircle, FileText, Clock, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/Button";
import { propertyService } from "@/services/property";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

type VerificationMethod = "UtilityBill" | "DeedRecord" | "TaxRecord";

const METHODS: { value: VerificationMethod; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "UtilityBill", label: "Utility Bill",  desc: "Recent electricity, gas, or water bill showing the property address.", icon: <FileText size={18} /> },
  { value: "DeedRecord",  label: "Property Deed", desc: "Official deed or title document showing you as the owner of record.",  icon: <Shield size={18} />   },
  { value: "TaxRecord",   label: "Tax Record",    desc: "Property tax assessment or receipt with your name and address.",       icon: <FileText size={18} /> },
];

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PropertyVerifyModalProps {
  open:        boolean;
  onClose:     () => void;
  propertyId:  string;
  /** Called after successful submission so the parent can refresh property data. */
  onSuccess?:  () => void;
}

export default function PropertyVerifyModal({ open, onClose, propertyId, onSuccess }: PropertyVerifyModalProps) {
  const navigate    = useNavigate();
  const openAddProp = useAddPropertyStore((s) => s.open);

  const [method,     setMethod]     = useState<VerificationMethod>("UtilityBill");
  const [file,       setFile]       = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFile = (f: File) => {
    if (f.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const hash = await sha256Hex(file);
      await propertyService.submitVerification(propertyId, method, hash);
      setSubmitted(true);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setMethod("UtilityBill");
    setFile(null);
    setSubmitted(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify Property Ownership"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(14,14,12,0.55)",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background:   COLORS.white,
        border:       `1px solid ${COLORS.rule}`,
        borderRadius: RADIUS.card,
        padding:      "2rem",
        maxWidth:     "580px",
        width:        "100%",
        maxHeight:    "90vh",
        overflowY:    "auto",
        position:     "relative",
      }}>

        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
        >
          <X size={18} />
        </button>

        {submitted ? (
          // ── Success state ──────────────────────────────────────────────────
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ border: `1px solid ${UI.sage}`, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "5rem", height: "5rem", margin: "0 auto 1.5rem", borderRadius: RADIUS.card }}>
              <CheckCircle size={36} color={UI.sage} />
            </div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.5rem" }}>
              Submitted
            </div>
            <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: UI.ink, marginBottom: "0.75rem" }}>
              Document submitted
            </h2>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, lineHeight: 1.7, marginBottom: "0.5rem" }}>
              Your document has been hashed and recorded on-chain. Our team will review it and update your verification level within <strong style={{ color: UI.ink }}>1–2 business days</strong>.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${UI.rule}`, padding: "0.5rem 1rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, margin: "1.25rem 0 2rem" }}>
              <Clock size={12} />
              Status: Pending Review
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <Button variant="outline" onClick={handleClose}>Back to Property</Button>
              <Button onClick={() => { handleClose(); openAddProp(); }}>Continue Setup</Button>
            </div>
          </div>
        ) : (
          // ── Form state ─────────────────────────────────────────────────────
          <>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.375rem" }}>
              Ownership
            </div>
            <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: UI.ink, marginBottom: "0.375rem" }}>
              Verify ownership
            </h2>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, lineHeight: 1.7, marginBottom: "1.25rem" }}>
              Upload a document proving you own this property. We compute a SHA-256 hash and record it on-chain — the file itself is never stored.
            </p>

            {/* What you'll unlock */}
            <div style={{ border: `1px solid ${UI.rule}`, marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.5rem 0.875rem", borderBottom: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                What you'll unlock
              </div>
              {[
                { doc: "Utility Bill",               level: "Basic",   color: UI.sage,   perks: "Shareable reports · Contractor trust badge" },
                { doc: "Property Deed or Tax Record", level: "Premium", color: "#2563EB", perks: "All Basic perks · Highest buyer trust · Premium badge" },
              ].map(({ doc, level, color, perks }) => (
                <div key={level} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.625rem 0.875rem", borderBottom: `1px solid ${UI.rule}` }}>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color, background: `${color}18`, padding: "0.25rem 0.5rem", whiteSpace: "nowrap" }}>
                    {level}
                  </div>
                  <div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.ink, fontWeight: 600 }}>{doc}</div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.58rem", color: UI.inkLight, letterSpacing: "0.04em", marginTop: "0.1rem" }}>{perks}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "0.5rem 0.875rem", fontFamily: UI.mono, fontSize: "0.58rem", color: UI.inkLight, letterSpacing: "0.04em" }}>
                The file is never stored — only a SHA-256 hash is recorded on-chain.
              </div>
            </div>

            {/* Step 1: Document type */}
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
                1. Select document type
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: UI.rule }}>
                {METHODS.map((m) => (
                  <label key={m.value} style={{
                    display: "flex", alignItems: "flex-start", gap: "1rem",
                    padding: "0.875rem 1rem", cursor: "pointer",
                    background: method === m.value ? COLORS.blush : COLORS.white,
                  }}>
                    <input
                      type="radio" name="verify-method" value={m.value}
                      checked={method === m.value}
                      onChange={() => setMethod(m.value)}
                      style={{ marginTop: "0.2rem", accentColor: UI.sage }}
                    />
                    <div style={{ color: method === m.value ? UI.sage : UI.inkLight, flexShrink: 0, marginTop: "0.1rem" }}>
                      {m.icon}
                    </div>
                    <div>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: method === m.value ? UI.sage : UI.ink, marginBottom: "0.2rem" }}>
                        {m.label}
                      </p>
                      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight, lineHeight: 1.55 }}>
                        {m.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Step 2: Upload */}
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
                2. Upload document
              </p>

              {file ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "1rem", border: `1px solid ${UI.sage}` }}>
                  <FileText size={18} color={UI.sage} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button onClick={() => setFile(null)} style={{ color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: "0.25rem" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? UI.sage : UI.rule}`,
                    padding: "2rem 1.5rem", textAlign: "center", cursor: "pointer",
                    background: dragOver ? COLORS.blush : COLORS.white,
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <Upload size={24} color={dragOver ? UI.sage : UI.inkLight} style={{ margin: "0 auto 0.75rem" }} />
                  <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: dragOver ? UI.sage : UI.ink, marginBottom: "0.25rem" }}>
                    Drop your file here or <span style={{ color: UI.sage }}>browse</span>
                  </p>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                    PDF, JPG, PNG — max 10 MB
                  </p>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              )}
            </div>

            <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, lineHeight: 1.65, marginBottom: "1.5rem" }}>
              Your document is stored on ICP and only accessible to HomeGentic admins for review. A SHA-256 hash is recorded on-chain so the file cannot be altered after submission.
            </p>

            <Button size="lg" style={{ width: "100%" }} disabled={!file || submitting} onClick={handleSubmit} icon={<Shield size={14} />}>
              {submitting ? "Hashing & submitting…" : "Submit for verification"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
