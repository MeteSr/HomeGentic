import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";
import { jobService } from "@/services/job";
import { photoService, PhotoQuota } from "@/services/photo";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const SERVICE_TYPES = [
  "HVAC","Roofing","Plumbing","Electrical","Flooring","Painting",
  "Landscaping","Windows","Foundation","Insulation","Drywall",
  "Kitchen Remodel","Bathroom Remodel","Other",
];
const PERMIT_SERVICE_TYPES = new Set(["HVAC","Roofing","Electrical","Plumbing","Foundation"]);

export default function JobCreatePage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; phase: string }[]>([]);
  const [form, setForm] = useState({
    propertyId: "", serviceType: SERVICE_TYPES[0], isDiy: false,
    contractorName: "", amount: "", date: new Date().toISOString().split("T")[0],
    description: "", permitNumber: "", warrantyMonths: "",
  });

  useEffect(() => {
    photoService.getQuota().then(setQuota);
    if (properties.length > 0) setForm((f) => ({ ...f, propertyId: String(properties[0].id) }));
  }, [properties]);

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.propertyId) { toast.error("Please select a property"); return; }
    if (!form.isDiy && !form.contractorName.trim()) { toast.error("Please enter the contractor name"); return; }
    if (!form.amount) { toast.error("Please enter the amount"); return; }
    setLoading(true);
    try {
      await jobService.create({
        propertyId: form.propertyId, serviceType: form.serviceType,
        contractorName: form.isDiy ? undefined : form.contractorName.trim(),
        amount: Math.round(parseFloat(form.amount) * 100),
        date: form.date, description: form.description, isDiy: form.isDiy,
        permitNumber: form.permitNumber.trim() || undefined,
        warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : undefined,
      });
      toast.success("Job logged successfully!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  const showPermitField = PERMIT_SERVICE_TYPES.has(form.serviceType);

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
          Maintenance Record
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Log a Job
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.5rem" }}>
          Record a completed maintenance job on the blockchain.
        </p>

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

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

          <div>
            <label className="form-label">Service Type *</label>
            <select className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* DIY toggle */}
          <div
            onClick={() => update("isDiy", !form.isDiy)}
            style={{
              display: "flex", alignItems: "center", gap: "0.875rem",
              padding: "0.875rem 1rem", cursor: "pointer",
              border: `1px solid ${form.isDiy ? S.rust : S.rule}`,
              background: form.isDiy ? "#FAF0ED" : "#fff",
            }}
          >
            <div style={{
              width: "2.25rem", height: "1.25rem",
              background: form.isDiy ? S.rust : S.rule,
              position: "relative", flexShrink: 0,
            }}>
              <div style={{
                position: "absolute", top: "0.125rem",
                left: form.isDiy ? "1.125rem" : "0.125rem",
                width: "1rem", height: "1rem",
                background: "#fff", transition: "left 0.15s",
              }} />
            </div>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: form.isDiy ? S.rust : S.ink, marginBottom: "0.2rem" }}>
                I did this myself (DIY)
              </p>
              <p style={{ fontSize: "0.75rem", color: S.inkLight, fontWeight: 300 }}>
                {form.isDiy ? "Your signature verifies this record." : "Toggle on if you performed the work yourself."}
              </p>
            </div>
          </div>

          {!form.isDiy && (
            <div>
              <label className="form-label">Contractor / Company Name *</label>
              <input className="form-input" placeholder="e.g. Cool Air Services LLC" value={form.contractorName} onChange={(e) => update("contractorName", e.target.value)} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="form-label">{form.isDiy ? "Materials Cost *" : "Amount Paid *"}</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: S.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => update("amount", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
              </div>
            </div>
            <div>
              <label className="form-label">Date Completed *</label>
              <input className="form-input" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Describe the work done, materials used..." value={form.description} onChange={(e) => update("description", e.target.value)} style={{ resize: "vertical" }} />
          </div>

          {showPermitField && (
            <div>
              <label className="form-label">Permit Number <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <input className="form-input" placeholder="e.g. HVAC-2024-0412" value={form.permitNumber} onChange={(e) => update("permitNumber", e.target.value)} />
            </div>
          )}

          {!form.isDiy && (
            <div>
              <label className="form-label">Warranty <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <div style={{ position: "relative" }}>
                <input className="form-input" type="number" min="0" placeholder="e.g. 12" value={form.warrantyMonths} onChange={(e) => update("warrantyMonths", e.target.value)} style={{ paddingRight: "4.5rem" }} />
                <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, pointerEvents: "none" }}>months</span>
              </div>
            </div>
          )}

          <div>
            <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
              Photos & Receipts <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span>
            </label>
            <ConstructionPhotoUpload
              onUpload={(file, phase) => setUploadedFiles((u) => [...u, { file, phase }])}
              quota={{ ...quota, used: quota.used + uploadedFiles.length }}
              onUpgradeQuota={() => navigate("/pricing")}
            />
          </div>

          <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} size="lg" style={{ width: "100%" }}>
            Log Job to Blockchain
          </Button>
        </div>
      </div>
    </Layout>
  );
}
