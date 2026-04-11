import React, { useState, useEffect } from "react";
import { X, Send, Zap } from "lucide-react";
import { Button } from "./Button";
import { quoteService, Urgency } from "@/services/quote";
import { type Property } from "@/services/property";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const SERVICE_TYPES = [
  "HVAC", "Roofing", "Plumbing", "Electrical", "Flooring", "Painting",
  "Landscaping", "Windows", "Foundation", "Other",
];

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string }[] = [
  { value: "low",       label: "Low",       desc: "Flexible timeline" },
  { value: "medium",    label: "Medium",    desc: "Within 2–4 weeks" },
  { value: "high",      label: "High",      desc: "Within 1 week" },
  { value: "emergency", label: "Emergency", desc: "ASAP" },
];

const EMPTY_FORM = {
  propertyId:  "",
  serviceType: SERVICE_TYPES[0],
  urgency:     "medium" as Urgency,
  description: "",
};

interface RequestQuoteModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  onSuccess:   (quoteId: string) => void;
  properties:  Property[];
  prefill?:    { serviceType?: string };
}

export function RequestQuoteModal({ isOpen, onClose, onSuccess, properties, prefill }: RequestQuoteModalProps) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  // Reset form + apply prefill whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setForm({
      ...EMPTY_FORM,
      propertyId:  properties.length > 0 ? String(properties[0].id) : "",
      serviceType: prefill?.serviceType ?? SERVICE_TYPES[0],
    });
  }, [isOpen, prefill, properties]);

  // Scroll lock + Escape
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.propertyId)        { toast.error("Select a property"); return; }
    if (!form.description.trim()) { toast.error("Describe the work needed"); return; }
    setLoading(true);
    try {
      const req = await quoteService.createRequest({
        propertyId:  form.propertyId,
        serviceType: form.serviceType,
        urgency:     form.urgency,
        description: form.description,
      });
      toast.success("Quote request sent to contractors!");
      onSuccess(req.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(46,37,64,0.5)",
        zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          borderRadius: RADIUS.card,
          boxShadow: SHADOWS.modal,
          width: "100%",
          maxWidth: "32rem",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          borderBottom: `1px solid ${COLORS.rule}`,
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", fontWeight: 600, color: COLORS.sage, marginBottom: "0.2rem" }}>
              Contractor Network
            </p>
            <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: COLORS.plum }}>
              Request a Quote
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>

          {properties.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0", color: COLORS.plumMid, fontFamily: FONTS.sans, fontSize: "0.85rem", fontWeight: 300 }}>
              Add a property before requesting quotes.
            </div>
          ) : (
            <>
              {/* Property */}
              {properties.length > 1 && (
                <div>
                  <label className="form-label">Property</label>
                  <select className="form-input" value={form.propertyId} onChange={(e) => update("propertyId", e.target.value)}>
                    {properties.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Service type */}
              <div>
                <label className="form-label">Service Type</label>
                <select className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
                  {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Urgency */}
              <div>
                <label className="form-label">Urgency</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                  {URGENCY_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      onClick={() => update("urgency", opt.value)}
                      style={{
                        padding: "0.625rem 0.875rem", cursor: "pointer",
                        background: form.urgency === opt.value ? COLORS.sageLight : COLORS.white,
                        border: `1.5px solid ${form.urgency === opt.value ? COLORS.sage : COLORS.rule}`,
                        borderRadius: RADIUS.sm,
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 600, color: form.urgency === opt.value ? COLORS.sage : COLORS.plum, marginBottom: "0.15rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        {opt.value === "emergency" && <Zap size={10} />}
                        {opt.label}
                      </div>
                      <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 300 }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="form-label">Describe the work needed</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Describe the issue or project. Include measurements, materials, or any relevant constraints."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Submit */}
              <Button loading={loading} onClick={handleSubmit} icon={<Send size={14} />} style={{ width: "100%" }}>
                Send Quote Request
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
