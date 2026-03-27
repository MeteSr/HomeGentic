import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { recurringService, RecurringServiceType, Frequency, SERVICE_TYPE_LABELS, FREQUENCY_LABELS } from "@/services/recurringService";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const SERVICE_TYPES: RecurringServiceType[] = [
  "LawnCare", "PestControl", "PoolMaintenance", "GutterCleaning", "PressureWashing", "Other",
];

const FREQUENCIES: Frequency[] = [
  "Weekly", "BiWeekly", "Monthly", "Quarterly", "SemiAnnually", "Annually",
];

export default function RecurringServiceCreatePage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdName, setCreatedName] = useState("");
  const [form, setForm] = useState({
    propertyId:      "",
    serviceType:     "LawnCare"     as RecurringServiceType,
    providerName:    "",
    providerLicense: "",
    providerPhone:   "",
    frequency:       "Monthly"      as Frequency,
    startDate:       new Date().toISOString().split("T")[0],
    contractEndDate: "",
    notes:           "",
  });

  useEffect(() => {
    if (properties.length > 0) setForm((f) => ({ ...f, propertyId: String(properties[0].id) }));
  }, [properties]);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => navigate("/dashboard"), 3000);
    return () => clearTimeout(timer);
  }, [submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.propertyId)    { toast.error("Please select a property"); return; }
    if (!form.providerName.trim()) { toast.error("Please enter the provider name"); return; }
    if (!form.startDate)     { toast.error("Please enter a start date"); return; }
    setLoading(true);
    try {
      await recurringService.create({
        propertyId:       form.propertyId,
        serviceType:      form.serviceType,
        providerName:     form.providerName.trim(),
        providerLicense:  form.providerLicense.trim() || undefined,
        providerPhone:    form.providerPhone.trim()   || undefined,
        frequency:        form.frequency,
        startDate:        form.startDate,
        contractEndDate:  form.contractEndDate || undefined,
        notes:            form.notes.trim()    || undefined,
      });
      setCreatedName(SERVICE_TYPE_LABELS[form.serviceType]);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create recurring service");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Layout>
        <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "4rem", height: "4rem", border: `2px solid ${S.sage}`, marginBottom: "1.25rem" }}>
            <CheckCircle size={28} color={S.sage} />
          </div>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.sage, marginBottom: "0.375rem" }}>
            Service Logged
          </p>
          <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, marginBottom: "0.5rem" }}>
            {createdName} added
          </h2>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight, marginBottom: "2rem" }}>
            Open the service to attach a contract document and log visits.
          </p>
          <div style={{ height: "2px", background: S.rule, marginBottom: "1.25rem", overflow: "hidden" }}>
            <div style={{ height: "100%", background: S.sage, animation: "progress 3s linear forwards" }} />
          </div>
          <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "1rem" }}>
            Redirecting to dashboard in 3 seconds…
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.ink}`, background: S.ink, color: S.paper, cursor: "pointer" }}
            >
              Go to dashboard
            </button>
            <button
              onClick={() => { setSubmitted(false); setForm((f) => ({ ...f, providerName: "", notes: "" })); }}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
            >
              Add another
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Recurring Services
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Add a Service
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.5rem" }}>
          Log an ongoing service contract. Attach the contract doc after saving.
        </p>

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Property selector */}
          {properties.length > 0 && (
            <div>
              <label className="form-label">Property *</label>
              <select className="form-input" value={form.propertyId} onChange={(e) => update("propertyId", e.target.value)}>
                {properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
                ))}
              </select>
            </div>
          )}

          {/* Service type */}
          <div>
            <label className="form-label">Service Type *</label>
            <select className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Provider name */}
          <div>
            <label className="form-label">Provider / Company Name *</label>
            <input className="form-input" placeholder="e.g. Green Lawn Co." value={form.providerName} onChange={(e) => update("providerName", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="form-label">License # <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <input className="form-input" placeholder="e.g. PCO-12345" value={form.providerLicense} onChange={(e) => update("providerLicense", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Phone <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <input className="form-input" placeholder="e.g. (555) 000-0000" value={form.providerPhone} onChange={(e) => update("providerPhone", e.target.value)} />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="form-label">Frequency *</label>
            <select className="form-input" value={form.frequency} onChange={(e) => update("frequency", e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="form-label">Contract Start *</label>
              <input className="form-input" type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contract End <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <input className="form-input" type="date" value={form.contractEndDate} onChange={(e) => update("contractEndDate", e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
            <textarea className="form-input" rows={2} placeholder="e.g. Monthly treatment, includes interior" value={form.notes} onChange={(e) => update("notes", e.target.value)} style={{ resize: "vertical" }} />
          </div>

          <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} size="lg" style={{ width: "100%" }}>
            Save Service
          </Button>
        </div>

        {/* Info callout */}
        <div style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginTop: "1rem", background: S.paper }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.375rem" }}>
            About contract documents
          </p>
          <p style={{ fontSize: "0.8rem", fontWeight: 300, color: S.ink, lineHeight: 1.6 }}>
            After saving, open the service to attach your contract document — one upload covers the whole relationship. Buyers see a clean summary, not a pile of receipts.
          </p>
        </div>
      </div>
    </Layout>
  );
}
