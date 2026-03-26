import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Zap } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { PhotoQuotaDisplay } from "@/components/PhotoQuotaDisplay";
import { quoteService, Urgency } from "@/services/quote";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const SERVICE_TYPES = [
  "HVAC", "Roofing", "Plumbing", "Electrical", "Flooring",
  "Painting", "Landscaping", "Windows", "Foundation", "Other",
];

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string; color: string; bg: string }[] = [
  { value: "low", label: "Low", desc: "Flexible timeline", color: "#059669", bg: "#f0fdf4" },
  { value: "medium", label: "Medium", desc: "Within 2–4 weeks", color: "#d97706", bg: "#fffbeb" },
  { value: "high", label: "High", desc: "Within 1 week", color: "#dc2626", bg: "#fef2f2" },
  { value: "emergency", label: "Emergency", desc: "ASAP", color: "#7c3aed", bg: "#f5f3ff" },
];

export default function QuoteRequestPage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    propertyId: properties[0] ? String(properties[0].id) : "",
    serviceType: SERVICE_TYPES[0],
    urgency: "medium" as Urgency,
    description: "",
  });

  // Free tier quota for demo
  const quota = { used: 1, limit: 3, tier: "Free" };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      toast.error("Please describe the work needed");
      return;
    }
    setLoading(true);
    try {
      const req = await quoteService.createRequest({
        propertyId: form.propertyId,
        serviceType: form.serviceType,
        urgency: form.urgency,
        description: form.description,
      });
      toast.success("Quote request sent to contractors!");
      navigate(`/quotes/${req.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send request");
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
          Request a Quote
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          Get competitive quotes from verified HomeFax contractors.
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
          {/* Quota warning */}
          <div>
            <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Quote Request Quota
            </label>
            <PhotoQuotaDisplay
              used={quota.used}
              limit={quota.limit}
              tier={quota.tier}
              onUpgrade={() => navigate("/pricing")}
            />
          </div>

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

          {/* Urgency */}
          <div>
            <label className="form-label">Urgency *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {URGENCY_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => update("urgency", opt.value)}
                  style={{
                    padding: "0.75rem",
                    borderRadius: "0.625rem",
                    border:
                      form.urgency === opt.value
                        ? `2px solid ${opt.color}`
                        : "2px solid #e5e7eb",
                    backgroundColor: form.urgency === opt.value ? opt.bg : "white",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      color: form.urgency === opt.value ? opt.color : "#374151",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    {opt.value === "emergency" && <Zap size={14} />}
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Describe the work needed *</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Describe the issue or project in detail. Include any relevant measurements, materials, or constraints."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>

          <Button
            loading={loading}
            disabled={quota.used >= quota.limit}
            onClick={handleSubmit}
            icon={<Send size={16} />}
            size="lg"
            style={{ width: "100%" }}
          >
            {quota.used >= quota.limit ? "Quote limit reached — Upgrade to continue" : "Send Quote Request"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
