import React, { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Upload, CheckCircle, FileText, Clock, AlertCircle, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

type VerificationMethod = "UtilityBill" | "DeedRecord" | "TaxRecord";

const METHODS: { value: VerificationMethod; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "UtilityBill", label: "Utility Bill",    desc: "Recent electricity, gas, or water bill showing the property address.", icon: <FileText size={18} /> },
  { value: "DeedRecord",  label: "Property Deed",   desc: "Official deed or title document showing you as the owner of record.", icon: <Shield size={18} /> },
  { value: "TaxRecord",   label: "Tax Record",      desc: "Property tax assessment or receipt with your name and address.", icon: <FileText size={18} /> },
];

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Step = "form" | "submitted";

export default function PropertyVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [method, setMethod] = useState<VerificationMethod>("UtilityBill");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!file || !id) return;
    setSubmitting(true);
    try {
      const hash = await sha256Hex(file);
      await propertyService.submitVerification(BigInt(id), method, hash);
      setStep("submitted");
    } catch (err: any) {
      toast.error(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "submitted") {
    return (
      <Layout>
        <div style={{ maxWidth: "36rem", margin: "4rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <div style={{ border: `1px solid ${S.sage}`, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "5rem", height: "5rem", margin: "0 auto 1.5rem" }}>
            <CheckCircle size={36} color={S.sage} />
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
            Submitted
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.75rem" }}>
            Document submitted
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, lineHeight: 1.7, marginBottom: "0.5rem" }}>
            Your document has been hashed and recorded on-chain. Our team will review it and update your verification level within <strong style={{ color: S.ink }}>1–2 business days</strong>.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: `1px solid ${S.rule}`, padding: "0.5rem 1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, margin: "1.25rem 0 2rem" }}>
            <Clock size={12} />
            Status: Pending Review
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <Button variant="outline" onClick={() => navigate(`/properties/${id}`)}>Back to Property</Button>
            <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "36rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(`/properties/${id}`)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.75rem" }}
        >
          <ArrowLeft size={14} /> Back to property
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Ownership
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.5rem" }}>
          Verify ownership
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, lineHeight: 1.7, marginBottom: "1.5rem" }}>
          Upload a document proving you own this property. We compute a SHA-256 hash of your file and record it on-chain — the file itself is never stored.
        </p>

        {/* Info banner */}
        <div style={{ border: `1px solid ${S.rule}`, background: "#FAF0ED", padding: "0.875rem 1rem", marginBottom: "2rem", display: "flex", gap: "0.75rem" }}>
          <AlertCircle size={14} color={S.rust} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.ink, lineHeight: 1.65, margin: 0 }}>
            Verified properties can generate shareable HomeFax reports and command higher buyer trust.
          </p>
        </div>

        {/* Step 1: Document type */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
            1. Select document type
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
            {METHODS.map((m) => (
              <label key={m.value} style={{
                display: "flex", alignItems: "flex-start", gap: "1rem",
                padding: "1rem 1.125rem", cursor: "pointer",
                background: method === m.value ? "#FAF0ED" : "#fff",
              }}>
                <input
                  type="radio" name="method" value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  style={{ marginTop: "0.2rem", accentColor: S.rust }}
                />
                <div style={{ color: method === m.value ? S.rust : S.inkLight, flexShrink: 0, marginTop: "0.1rem" }}>
                  {m.icon}
                </div>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: method === m.value ? S.rust : S.ink, marginBottom: "0.2rem" }}>
                    {m.label}
                  </p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.55 }}>
                    {m.desc}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Step 2: Upload */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.875rem" }}>
            2. Upload document
          </p>

          {file ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "1rem 1.125rem", border: `1px solid ${S.sage}`, background: "#fff" }}>
              <FileText size={18} color={S.sage} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button onClick={() => setFile(null)} style={{ color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: "0.25rem" }}>
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
                border: `2px dashed ${dragOver ? S.rust : S.rule}`,
                padding: "2.5rem 1.5rem", textAlign: "center", cursor: "pointer",
                background: dragOver ? "#FAF0ED" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <Upload size={24} color={dragOver ? S.rust : S.inkLight} style={{ margin: "0 auto 0.75rem" }} />
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: dragOver ? S.rust : S.ink, marginBottom: "0.25rem" }}>
                Drop your file here or <span style={{ color: S.rust }}>browse</span>
              </p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
                PDF, JPG, PNG — max 10 MB
              </p>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}
        </div>

        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, lineHeight: 1.65, marginBottom: "1.75rem" }}>
          Your document is stored on ICP and only accessible to HomeFax admins for review. A SHA-256 hash is recorded on-chain so the file cannot be altered after submission.
        </p>

        <Button size="lg" style={{ width: "100%" }} disabled={!file || submitting} onClick={handleSubmit} icon={<Shield size={14} />}>
          {submitting ? "Hashing & submitting…" : "Submit for verification"}
        </Button>
      </div>
    </Layout>
  );
}
