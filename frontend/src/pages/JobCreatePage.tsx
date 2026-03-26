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

const SERVICE_TYPES = [
  "HVAC",
  "Roofing",
  "Plumbing",
  "Electrical",
  "Flooring",
  "Painting",
  "Landscaping",
  "Windows",
  "Foundation",
  "Insulation",
  "Drywall",
  "Kitchen Remodel",
  "Bathroom Remodel",
  "Other",
];

// Service types where permits are commonly required
const PERMIT_SERVICE_TYPES = new Set(["HVAC", "Roofing", "Electrical", "Plumbing", "Foundation"]);

export default function JobCreatePage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; phase: string }[]>([]);
  const [form, setForm] = useState({
    propertyId: "",
    serviceType: SERVICE_TYPES[0],
    isDiy: false,
    contractorName: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    permitNumber: "",
    warrantyMonths: "",
  });

  useEffect(() => {
    photoService.getQuota().then(setQuota);
    if (properties.length > 0) {
      setForm((f) => ({ ...f, propertyId: String(properties[0].id) }));
    }
  }, [properties]);

  const update = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleUpload = (file: File, phase: string) => {
    setUploadedFiles((u) => [...u, { file, phase }]);
  };

  const showPermitField = PERMIT_SERVICE_TYPES.has(form.serviceType);

  const handleSubmit = async () => {
    if (!form.propertyId) {
      toast.error("Please select a property");
      return;
    }
    if (!form.isDiy && !form.contractorName.trim()) {
      toast.error("Please enter the contractor name");
      return;
    }
    if (!form.amount) {
      toast.error("Please enter the amount");
      return;
    }
    setLoading(true);
    try {
      await jobService.create({
        propertyId: form.propertyId,
        serviceType: form.serviceType,
        contractorName: form.isDiy ? undefined : form.contractorName.trim(),
        amount: Math.round(parseFloat(form.amount) * 100), // dollars → cents
        date: form.date,
        description: form.description,
        isDiy: form.isDiy,
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

  return (
    <Layout>
      <div style={{ maxWidth: "40rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "#6b7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            padding: 0,
            marginBottom: "1rem",
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111827", marginBottom: "0.25rem" }}>
          Log a Job
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          Record a completed maintenance job on the blockchain.
        </p>

        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "1.25rem",
            padding: "1.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Property */}
          {properties.length > 0 && (
            <div>
              <label className="form-label">Property *</label>
              <select
                className="form-input"
                value={form.propertyId}
                onChange={(e) => update("propertyId", e.target.value)}
              >
                {properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {p.address}, {p.city}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Service type */}
          <div>
            <label className="form-label">Service Type *</label>
            <select
              className="form-input"
              value={form.serviceType}
              onChange={(e) => update("serviceType", e.target.value)}
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* DIY toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.875rem 1rem",
              backgroundColor: form.isDiy ? "#f0fdf4" : "#f9fafb",
              border: `1px solid ${form.isDiy ? "#bbf7d0" : "#e5e7eb"}`,
              borderRadius: "0.75rem",
              cursor: "pointer",
            }}
            onClick={() => update("isDiy", !form.isDiy)}
          >
            <div
              style={{
                width: "2.5rem",
                height: "1.375rem",
                borderRadius: "9999px",
                backgroundColor: form.isDiy ? "#16a34a" : "#d1d5db",
                position: "relative",
                flexShrink: 0,
                transition: "background-color 0.15s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "0.125rem",
                  left: form.isDiy ? "1.25rem" : "0.125rem",
                  width: "1.125rem",
                  height: "1.125rem",
                  borderRadius: "50%",
                  backgroundColor: "white",
                  transition: "left 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", margin: 0 }}>
                I did this myself (DIY)
              </p>
              <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
                {form.isDiy
                  ? "No contractor needed — your signature verifies this record."
                  : "Toggle on if you performed the work yourself."}
              </p>
            </div>
          </div>

          {/* Contractor name — hidden for DIY */}
          {!form.isDiy && (
            <div>
              <label className="form-label">Contractor / Company Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Cool Air Services LLC"
                value={form.contractorName}
                onChange={(e) => update("contractorName", e.target.value)}
              />
            </div>
          )}

          {/* Amount + Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="form-label">
                {form.isDiy ? "Materials Cost *" : "Amount Paid *"}
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  style={{ paddingLeft: "1.5rem" }}
                />
              </div>
            </div>
            <div>
              <label className="form-label">Date Completed *</label>
              <input
                className="form-input"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder={
                form.isDiy
                  ? "Describe the work done, materials used..."
                  : "Describe the work done, materials used, warranty info..."
              }
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Permit number — shown for service types that commonly require one */}
          {showPermitField && (
            <div>
              <label className="form-label">
                Permit Number{" "}
                <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                className="form-input"
                placeholder="e.g. HVAC-2024-0412"
                value={form.permitNumber}
                onChange={(e) => update("permitNumber", e.target.value)}
              />
              <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                Including a permit number adds credibility to the record.
              </p>
            </div>
          )}

          {/* Warranty — only for contractor jobs */}
          {!form.isDiy && (
            <div>
              <label className="form-label">
                Warranty{" "}
                <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="e.g. 12"
                  value={form.warrantyMonths}
                  onChange={(e) => update("warrantyMonths", e.target.value)}
                  style={{ paddingRight: "4.5rem" }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    pointerEvents: "none",
                  }}
                >
                  months
                </span>
              </div>
            </div>
          )}

          {/* Photos */}
          <div>
            <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
              Photos & Receipts{" "}
              <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
            </label>
            <p style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.75rem" }}>
              Before/after photos and receipts strengthen your record.
            </p>
            <ConstructionPhotoUpload
              onUpload={handleUpload}
              quota={{ ...quota, used: quota.used + uploadedFiles.length }}
              onUpgradeQuota={() => navigate("/pricing")}
            />
          </div>

          <Button
            loading={loading}
            onClick={handleSubmit}
            icon={<CheckCircle size={16} />}
            size="lg"
            style={{ width: "100%" }}
          >
            Log Job to Blockchain
          </Button>
        </div>
      </div>
    </Layout>
  );
}
