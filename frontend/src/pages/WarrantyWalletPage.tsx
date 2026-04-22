import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, AlertTriangle, Clock, ScanLine } from "lucide-react";
import { Layout } from "@/components/Layout";
import { jobService, Job } from "@/services/job";
import { propertyService, Property } from "@/services/property";
import { paymentService, type PlanTier } from "@/services/payment";
import { warrantyStatus, warrantyExpiry, daysRemaining, type WarrantyStatus } from "@/services/warranty";
import { extractDocument, fileToBase64, type DocumentExtraction } from "@/services/documentOcr";
import { UpgradeGate } from "@/components/UpgradeGate";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

const amber = COLORS.plumMid;

interface WarrantyJob {
  job:      Job;
  property: Property | undefined;
  status:   WarrantyStatus;
  expiry:   Date;
  daysLeft: number;
}

function StatusBadge({ status }: { status: WarrantyStatus }) {
  const cfg = {
    active:   { label: "Active",        color: UI.sage,     bg: COLORS.sageLight, border: `${UI.sage}40` },
    expiring: { label: "Expiring Soon", color: amber,      bg: COLORS.butter,    border: `${amber}40`  },
    expired:  { label: "Expired",       color: UI.inkLight, bg: UI.paper,          border: UI.rule        },
  }[status];
  return (
    <span style={{
      fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
      textTransform: "uppercase", color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      padding: "0.15rem 0.5rem",
    }}>
      {cfg.label}
    </span>
  );
}

function WarrantyRow({ item, isLast }: { item: WarrantyJob; isLast: boolean }) {
  const navigate = useNavigate();
  const icon = item.status === "active"
    ? <ShieldCheck size={16} color={UI.sage} />
    : item.status === "expiring"
    ? <AlertTriangle size={16} color={amber} />
    : <Clock size={16} color={UI.inkLight} />;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "1rem",
      padding: "1rem 1.25rem",
      borderBottom: isLast ? "none" : `1px solid ${UI.rule}`,
      background: COLORS.white,
    }}>
      <div style={{ marginTop: "0.1rem", flexShrink: 0 }}>{icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          <span style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.875rem", color: item.status === "expired" ? UI.inkLight : UI.ink }}>
            {item.job.serviceType}
          </span>
          <StatusBadge status={item.status} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.5rem" }}>
          {item.property && (
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
              {item.property.address}, {item.property.city}
            </span>
          )}
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
            {item.job.isDiy ? "DIY" : item.job.contractorName ?? "—"}
          </span>
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
            Job date: {item.job.date}
          </span>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1rem", color: item.status === "expiring" ? amber : item.status === "expired" ? UI.inkLight : UI.sage, lineHeight: 1, marginBottom: "0.2rem" }}>
          {item.status === "expired"
            ? `Exp. ${item.expiry.toLocaleDateString()}`
            : item.daysLeft === 0
            ? "Expires today"
            : `${item.daysLeft} day${item.daysLeft !== 1 ? "s" : ""}`}
        </div>
        {item.status !== "expired" && (
          <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
            until {item.expiry.toLocaleDateString()}
          </div>
        )}
        <button
          onClick={() => navigate(`/jobs/new`, { state: { editJob: item.job } })}
          style={{ marginTop: "0.5rem", fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: `1px solid ${UI.rule}`, padding: "0.2rem 0.5rem", cursor: "pointer" }}
        >
          View
        </button>
      </div>
    </div>
  );
}

function Section({ title, items, emptyText }: { title: string; items: WarrantyJob[]; emptyText: string }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
        {title} <span style={{ color: UI.rust }}>({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "1.25rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ border: `1px solid ${UI.rule}` }}>
          {items.map((item, i) => (
            <WarrantyRow key={item.job.id} item={item} isLast={i === items.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scan Document panel ──────────────────────────────────────────────────────

type ScanStep = "idle" | "extracting" | "confirm";

interface ScanForm {
  brand:         string;
  modelNumber:   string;
  serialNumber:  string;
  warrantyMonths: string;
  serviceType:   string;
  purchaseDate:  string;
  description:   string;
}

function ScanDocumentPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step,       setStep]       = useState<ScanStep>("idle");
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [form,       setForm]       = useState<ScanForm>({ brand: "", modelNumber: "", serialNumber: "", warrantyMonths: "", serviceType: "", purchaseDate: "", description: "" });
  const [error,      setError]      = useState<string | null>(null);
  const [submitted,  setSubmitted]  = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStep("extracting");
    try {
      const b64 = await fileToBase64(file);
      const result = await extractDocument(file.name, file.type, b64);
      setExtraction(result);
      setForm({
        brand:         result.brand         ?? "",
        modelNumber:   result.modelNumber   ?? "",
        serialNumber:  result.serialNumber  ?? "",
        warrantyMonths: result.warrantyMonths != null ? String(result.warrantyMonths) : "",
        serviceType:   result.serviceType   ?? "",
        purchaseDate:  result.purchaseDate  ?? "",
        description:   result.description,
      });
      setStep("confirm");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStep("idle");
    }
  }

  function handleChange(field: keyof ScanForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setStep("idle");
    setExtraction(null);
  }

  const isLowConfidence = extraction?.confidence === "low";

  return (
    <div style={{ border: `1px solid ${UI.rule}`, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
      <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
        Scan Document
      </div>

      {submitted && (
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.sage, marginBottom: "0.75rem" }}>
          ✓ Document registered. Log a job with this appliance to save the warranty.
        </p>
      )}

      {error && (
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#C94C2E", marginBottom: "0.75rem" }}>
          {error}
        </p>
      )}

      {step === "idle" && !submitted && (
        <>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginBottom: "1rem" }}>
            Upload a photo of an appliance manual or warranty card. Brand, model, serial number, and warranty term will be extracted automatically.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${UI.ink}`, background: "none", color: UI.ink, cursor: "pointer" }}
          >
            <ScanLine size={13} /> Scan Document
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleFile} />
        </>
      )}

      {step === "extracting" && (
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>Extracting document data…</p>
      )}

      {step === "confirm" && extraction && (
        <form onSubmit={handleSubmit}>
          {isLowConfidence && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#B45309", background: "#FEF3C7", padding: "0.5rem 0.75rem", marginBottom: "1rem", border: "1px solid #FCD34D" }}>
              Low confidence — review carefully before saving. Fields may be inaccurate.
            </p>
          )}
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginBottom: "1rem" }}>{extraction.description}</p>

          {(["brand", "modelNumber", "serialNumber", "serviceType", "purchaseDate", "warrantyMonths"] as const).map((field) => (
            <div key={field} style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "0.25rem", textTransform: "uppercase" }}>
                {field === "warrantyMonths" ? "Warranty (months)" : field === "modelNumber" ? "Model #" : field === "serialNumber" ? "Serial #" : field === "purchaseDate" ? "Purchase Date" : field === "serviceType" ? "Category" : "Brand"}
              </label>
              <input
                value={form[field]}
                onChange={(e) => handleChange(field, e.target.value)}
                style={{ width: "100%", fontFamily: UI.mono, fontSize: "0.8rem", padding: "0.4rem 0.5rem", border: `1px solid ${UI.rule}`, background: COLORS.white, color: UI.ink, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="submit" style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${UI.rust}`, background: UI.rust, color: UI.paper, cursor: "pointer" }}>
              Save to Wallet
            </button>
            <button type="button" onClick={() => { setStep("idle"); setExtraction(null); }} style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WarrantyWalletPage() {
  const navigate = useNavigate();
  const [warrantyJobs, setWarrantyJobs] = useState<WarrantyJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [userTier, setUserTier] = useState<PlanTier>("Free");

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((e) => console.error("[WarrantyWalletPage] subscription load failed:", e));
    Promise.all([
      jobService.getAll(),
      propertyService.getMyProperties(),
    ]).then(([jobs, properties]) => {
      const propMap = Object.fromEntries(properties.map((p) => [String(p.id), p]));
      const withWarranty = jobs
        .filter((j) => j.warrantyMonths && j.warrantyMonths > 0)
        .map((job): WarrantyJob => ({
          job,
          property: propMap[job.propertyId],
          status:   warrantyStatus(job),
          expiry:   new Date(warrantyExpiry(job)),
          daysLeft: Math.max(0, daysRemaining(job)),
        }))
        .sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
      setWarrantyJobs(withWarranty);
    }).catch((e) => console.error("[WarrantyWalletPage] load failed:", e)).finally(() => setLoaded(true));
  }, []);

  const expiring = warrantyJobs.filter((w) => w.status === "expiring");
  const active   = warrantyJobs.filter((w) => w.status === "active");
  const expired  = warrantyJobs.filter((w) => w.status === "expired");

  if (userTier === "Free") {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
          <UpgradeGate
            feature="Warranty Wallet"
            description="Track active warranties across all your appliances and systems — and get alerts before they expire."
            icon="🛡️"
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
          Warranty Wallet
        </div>
        <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Your Warranties
        </h1>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "2rem" }}>
          Warranties logged across all your maintenance jobs.
        </p>

        <ScanDocumentPanel />

        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : warrantyJobs.length === 0 ? (
          <div style={{ padding: "2rem", border: `1px solid ${UI.rule}`, background: COLORS.white, textAlign: "center" }}>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>No warranties logged yet</p>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginBottom: "1.25rem" }}>
              When you log a job with a warranty duration, it will appear here.
            </p>
            <button
              onClick={() => navigate("/jobs/new")}
              style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${UI.rust}`, background: UI.rust, color: UI.paper, cursor: "pointer" }}
            >
              Log a Job
            </button>
          </div>
        ) : (
          <>
            <Section title="Expiring Soon" items={expiring} emptyText="No warranties expiring in the next 90 days." />
            <Section title="Active"        items={active}   emptyText="No active warranties." />
            <Section title="Expired"       items={expired}  emptyText="No expired warranties." />
          </>
        )}
      </div>
    </Layout>
  );
}
