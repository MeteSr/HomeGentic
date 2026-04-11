import React, { useState, useEffect } from "react";
import { X, CheckCircle, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "./Button";
import { jobService, isInsuranceRelevant } from "@/services/job";
import { type Property } from "@/services/property";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const SERVICE_TYPES = [
  "HVAC", "Roofing", "Plumbing", "Electrical", "Flooring", "Painting",
  "Landscaping", "Windows", "Foundation", "Insulation", "Drywall",
  "Kitchen Remodel", "Bathroom Remodel", "Other",
];
const PERMIT_SERVICE_TYPES = new Set(["HVAC", "Roofing", "Electrical", "Plumbing", "Foundation"]);

const EMPTY_FORM = {
  propertyId:     "",
  serviceType:    SERVICE_TYPES[0],
  isDiy:          false,
  contractorName: "",
  amount:         "",
  date:           new Date().toISOString().split("T")[0],
  description:    "",
  permitNumber:   "",
  warrantyMonths: "",
};

interface LogJobModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess:  () => void;
  properties: Property[];
  prefill?:   { serviceType?: string; contractorName?: string };
}

export function LogJobModal({ isOpen, onClose, onSuccess, properties, prefill }: LogJobModalProps) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loggedType, setLoggedType] = useState("");

  // Reset form + apply prefill whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSubmitted(false);
    setForm({
      ...EMPTY_FORM,
      propertyId:  properties.length > 0 ? String(properties[0].id) : "",
      serviceType: prefill?.serviceType    ?? SERVICE_TYPES[0],
      contractorName: prefill?.contractorName ?? "",
      date:        new Date().toISOString().split("T")[0],
    });
  }, [isOpen, prefill, properties]);

  // Lock body scroll and handle Escape
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

  const update = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.propertyId)                            { toast.error("Select a property"); return; }
    if (!form.isDiy && !form.contractorName.trim())  { toast.error("Enter the contractor name"); return; }
    if (!form.amount || parseFloat(form.amount) < 0) { toast.error("Enter the amount"); return; }
    setLoading(true);
    try {
      await jobService.create({
        propertyId:     form.propertyId,
        serviceType:    form.serviceType,
        contractorName: form.isDiy ? undefined : form.contractorName.trim(),
        amount:         Math.round(parseFloat(form.amount) * 100),
        date:           form.date,
        description:    form.description,
        isDiy:          form.isDiy,
        permitNumber:   form.permitNumber.trim() || undefined,
        warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : undefined,
      });
      setLoggedType(form.serviceType);
      setSubmitted(true);
      onSuccess(); // refresh parent data immediately
    } catch (err: any) {
      toast.error(err.message || "Failed to log job");
    } finally {
      setLoading(false);
    }
  };

  const showPermit = PERMIT_SERVICE_TYPES.has(form.serviceType);

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
          maxWidth: "34rem",
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
              Maintenance Record
            </p>
            <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: COLORS.plum }}>
              {submitted ? `${loggedType} logged` : "Log a Job"}
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

        {/* Success state */}
        {submitted ? (
          <div style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "3.5rem", height: "3.5rem",
              border: `2px solid ${COLORS.sage}`,
              borderRadius: RADIUS.card,
              marginBottom: "1rem",
            }}>
              <CheckCircle size={24} color={COLORS.sage} />
            </div>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600, color: COLORS.sage, marginBottom: "0.375rem" }}>
              Record Locked On-Chain
            </p>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, marginBottom: "1.5rem" }}>
              Your maintenance record has been added to your HomeGentic report.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setForm({ ...EMPTY_FORM, propertyId: form.propertyId, date: new Date().toISOString().split("T")[0] });
                }}
                style={{
                  fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 500,
                  padding: "0.5rem 1.25rem", border: `1px solid ${COLORS.rule}`,
                  background: "none", cursor: "pointer", color: COLORS.plumMid,
                  borderRadius: RADIUS.pill,
                }}
              >
                Log another
              </button>
              <button
                onClick={onClose}
                style={{
                  fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 500,
                  padding: "0.5rem 1.25rem", background: COLORS.plum, color: COLORS.white,
                  border: "none", cursor: "pointer",
                  borderRadius: RADIUS.pill,
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>

            {/* No property guard */}
            {properties.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0", color: COLORS.plumMid, fontFamily: FONTS.sans, fontSize: "0.85rem", fontWeight: 300 }}>
                Add a property before logging jobs.
              </div>
            ) : (
              <>
                {/* Property selector */}
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
                  {isInsuranceRelevant(form.serviceType) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.4rem", padding: "0.35rem 0.6rem", background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, borderRadius: RADIUS.sm }}>
                      <ShieldCheck size={11} color={COLORS.sage} />
                      <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 500, color: COLORS.sage }}>
                        Insurance-relevant record
                      </span>
                    </div>
                  )}
                </div>

                {/* Permit warning */}
                {showPermit && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", padding: "0.75rem 1rem", border: `1px solid ${COLORS.plumMid}`, background: COLORS.butter, borderRadius: RADIUS.sm }}>
                    <AlertTriangle size={13} color={COLORS.plumMid} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 300, color: COLORS.plumMid, lineHeight: 1.5 }}>
                      {form.serviceType} work typically requires a permit. Log the permit number below to strengthen this record.
                    </p>
                  </div>
                )}

                {/* DIY toggle */}
                <div
                  onClick={() => update("isDiy", !form.isDiy)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.875rem",
                    padding: "0.75rem 1rem", cursor: "pointer",
                    border: `1px solid ${form.isDiy ? COLORS.sage : COLORS.rule}`,
                    background: form.isDiy ? COLORS.sageLight : COLORS.white,
                    borderRadius: RADIUS.sm,
                  }}
                >
                  <div style={{ width: "2.25rem", height: "1.25rem", background: form.isDiy ? COLORS.sage : COLORS.rule, borderRadius: 100, position: "relative", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: "0.125rem", left: form.isDiy ? "1.125rem" : "0.125rem", width: "1rem", height: "1rem", background: COLORS.white, borderRadius: 100, transition: "left 0.15s" }} />
                  </div>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.85rem", fontWeight: 500, color: form.isDiy ? COLORS.sage : COLORS.plum }}>
                    {form.isDiy ? "DIY — I did this myself" : "I hired a contractor"}
                  </p>
                </div>

                {/* Contractor name */}
                {!form.isDiy && (
                  <div>
                    <label className="form-label">Contractor / Company Name</label>
                    <input className="form-input" placeholder="e.g. Cool Air Services LLC" value={form.contractorName} onChange={(e) => update("contractorName", e.target.value)} />
                  </div>
                )}

                {/* Amount + Date */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="form-label">{form.isDiy ? "Materials Cost" : "Amount Paid"}</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: COLORS.plumMid, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                      <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => update("amount", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Date Completed</label>
                    <input className="form-input" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="form-label">Description <span style={{ color: COLORS.plumMid, fontWeight: 300 }}>(optional)</span></label>
                  <textarea className="form-input" rows={2} placeholder="Describe the work done, materials used…" value={form.description} onChange={(e) => update("description", e.target.value)} style={{ resize: "vertical" }} />
                </div>

                {/* Permit number */}
                {showPermit && (
                  <div>
                    <label className="form-label">Permit Number <span style={{ color: COLORS.plumMid, fontWeight: 300 }}>(optional)</span></label>
                    <input className="form-input" placeholder="e.g. HVAC-2024-0412" value={form.permitNumber} onChange={(e) => update("permitNumber", e.target.value)} />
                  </div>
                )}

                {/* Warranty */}
                {!form.isDiy && (
                  <div>
                    <label className="form-label">Warranty <span style={{ color: COLORS.plumMid, fontWeight: 300 }}>(optional)</span></label>
                    <div style={{ position: "relative" }}>
                      <input className="form-input" type="number" min="0" placeholder="e.g. 12" value={form.warrantyMonths} onChange={(e) => update("warrantyMonths", e.target.value)} style={{ paddingRight: "4.5rem" }} />
                      <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", fontFamily: FONTS.mono, fontSize: "0.65rem", color: COLORS.plumMid, pointerEvents: "none" }}>months</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.25rem" }}>
                  <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} style={{ flex: 1 }}>
                    Log Job to Blockchain
                  </Button>
                </div>

                {/* Full-page escape hatch (for photo uploads) */}
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 300, color: COLORS.plumMid, textAlign: "center" }}>
                  Need to attach photos?{" "}
                  <a href="/jobs/new" style={{ color: COLORS.sage, textDecoration: "underline" }}>
                    Open full form <ArrowRight size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                  </a>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
