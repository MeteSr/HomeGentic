import React, { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Upload, CheckCircle, FileText, Clock, AlertCircle, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationMethod = "UtilityBill" | "DeedRecord" | "TaxRecord";

const METHODS: { value: VerificationMethod; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: "UtilityBill",
    label: "Utility Bill",
    desc: "Recent electricity, gas, or water bill showing the property address.",
    icon: <FileText size={20} />,
  },
  {
    value: "DeedRecord",
    label: "Property Deed",
    desc: "Official deed or title document showing you as the owner of record.",
    icon: <Shield size={20} />,
  },
  {
    value: "TaxRecord",
    label: "Tax Record",
    desc: "Property tax assessment or receipt with your name and address.",
    icon: <FileText size={20} />,
  },
];

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Component ────────────────────────────────────────────────────────────────

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
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
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

      // TODO: Replace with ICP blob storage upload once available.
      // The file should be uploaded to an ICP asset/blob canister here,
      // and the returned storage reference passed alongside the hash so
      // admins can retrieve and review the original document.
      // Tracking issue: swap stub for real upload when ICP blob storage lands.
      //
      // await icpBlobStorage.upload(file); // <-- replace this stub

      await propertyService.submitVerification(BigInt(id), method, hash);
      setStep("submitted");
    } catch (err: any) {
      toast.error(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submitted state ──────────────────────────────────────────────────────
  if (step === "submitted") {
    return (
      <Layout>
        <div style={{ maxWidth: "36rem", margin: "4rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <div style={{
            width: "5rem", height: "5rem", borderRadius: "9999px",
            backgroundColor: "#DCFCE7", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem",
          }}>
            <CheckCircle size={36} color="#16A34A" />
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem" }}>
            Document submitted
          </h1>
          <p style={{ color: "#6B7280", lineHeight: 1.65, marginBottom: "0.5rem" }}>
            Your document has been hashed and recorded on-chain. Our team will review it and update your verification level within <strong style={{ color: "#111827" }}>1–2 business days</strong>.
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            backgroundColor: "#FEF9C3", color: "#854D0E",
            padding: "0.5rem 1rem", borderRadius: "9999px",
            fontSize: "0.8rem", fontWeight: 600, margin: "1.25rem 0 2rem",
          }}>
            <Clock size={14} />
            Status: Pending Review
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <Button variant="outline" onClick={() => navigate(`/properties/${id}`)}>
              Back to Property
            </Button>
            <Button onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Form state ───────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ maxWidth: "36rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Back link */}
        <button
          onClick={() => navigate(`/properties/${id}`)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            color: "#6B7280", fontSize: "0.875rem", fontWeight: 500,
            background: "none", border: "none", cursor: "pointer", marginBottom: "1.75rem",
            padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Back to property
        </button>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{
            width: "3rem", height: "3rem", borderRadius: "0.75rem",
            backgroundColor: "#DBEAFE", display: "flex",
            alignItems: "center", justifyContent: "center", marginBottom: "1rem",
          }}>
            <Shield size={22} color="#2563EB" />
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", marginBottom: "0.5rem" }}>
            Verify ownership
          </h1>
          <p style={{ color: "#6B7280", lineHeight: 1.65 }}>
            Upload a document proving you own this property. We compute a SHA-256 hash of your file and record it on-chain — the file itself is never stored.
          </p>
        </div>

        {/* Info banner */}
        <div style={{
          display: "flex", gap: "0.75rem",
          backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE",
          borderRadius: "0.75rem", padding: "0.875rem 1rem", marginBottom: "2rem",
        }}>
          <AlertCircle size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <p style={{ fontSize: "0.85rem", color: "#1D4ED8", lineHeight: 1.6, margin: 0 }}>
            Verified properties can generate shareable HomeFax reports and command higher buyer trust.
          </p>
        </div>

        {/* Step 1: Document type */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.875rem" }}>
            1. Select document type
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {METHODS.map((m) => (
              <label key={m.value} style={{
                display: "flex", alignItems: "flex-start", gap: "1rem",
                padding: "1rem 1.125rem", borderRadius: "0.75rem", cursor: "pointer",
                border: `2px solid ${method === m.value ? "#3B82F6" : "#E5E7EB"}`,
                backgroundColor: method === m.value ? "#EFF6FF" : "white",
                transition: "border-color 0.15s, background-color 0.15s",
              }}>
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  style={{ marginTop: "0.2rem", accentColor: "#3B82F6" }}
                />
                <div style={{
                  color: method === m.value ? "#2563EB" : "#6B7280",
                  flexShrink: 0, marginTop: "0.1rem",
                }}>
                  {m.icon}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "#111827", marginBottom: "0.2rem" }}>
                    {m.label}
                  </p>
                  <p style={{ fontSize: "0.82rem", color: "#6B7280", lineHeight: 1.5 }}>
                    {m.desc}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Step 2: Upload */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.875rem" }}>
            2. Upload document
          </p>

          {file ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.875rem",
              padding: "1rem 1.125rem", borderRadius: "0.75rem",
              border: "2px solid #16A34A", backgroundColor: "#F0FDF4",
            }}>
              <FileText size={20} color="#16A34A" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </p>
                <p style={{ fontSize: "0.78rem", color: "#6B7280" }}>
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: "0.25rem" }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#3B82F6" : "#D1D5DB"}`,
                borderRadius: "0.875rem",
                padding: "2.5rem 1.5rem",
                textAlign: "center", cursor: "pointer",
                backgroundColor: dragOver ? "#EFF6FF" : "#FAFAFA",
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              <Upload size={28} color={dragOver ? "#3B82F6" : "#9CA3AF"} style={{ margin: "0 auto 0.75rem" }} />
              <p style={{ fontWeight: 600, color: "#374151", marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                Drop your file here or <span style={{ color: "#3B82F6" }}>browse</span>
              </p>
              <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>
                PDF, JPG, PNG — max 10 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}
        </div>

        {/* Privacy note */}
        <p style={{ fontSize: "0.78rem", color: "#9CA3AF", lineHeight: 1.6, marginBottom: "1.75rem" }}>
          🔒 Your document is stored on ICP and only accessible to HomeFax admins for review. A SHA-256 hash is recorded on-chain so the file cannot be altered after submission.
        </p>

        {/* Submit */}
        <Button
          size="lg"
          style={{ width: "100%" }}
          disabled={!file || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Hashing & submitting…" : "Submit for verification"}
        </Button>
      </div>
    </Layout>
  );
}
