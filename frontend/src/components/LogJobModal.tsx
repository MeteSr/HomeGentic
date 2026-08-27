import React, { useState, useEffect } from "react";
import { X, CheckCircle, AlertTriangle, ShieldCheck, Wrench, HardHat } from "lucide-react";
import { Button } from "./Button";
import { jobService, isInsuranceRelevant } from "@/services/job";
import { type Property } from "@/services/property";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

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

const STEP_LABELS = ["What", "Details", "Done"];

function StepIndicator({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0", margin: "0 auto 0.25rem" }}>
      {STEP_LABELS.map((label, i) => {
        const done    = i < step;
        const active  = i === step;
        const isLast  = i === STEP_LABELS.length - 1;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
              <div style={{
                width: "1.75rem", height: "1.75rem", borderRadius: "50%",
                background: done ? V2_COLORS.blue : active ? V2_COLORS.ink : V2_COLORS.border,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s",
              }}>
                {done
                  ? <CheckCircle size={13} color={V2_COLORS.paper} />
                  : <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 700, color: active ? V2_COLORS.paper : V2_COLORS.ink }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? V2_COLORS.ink : V2_COLORS.muted }}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div style={{ width: "3rem", height: "2px", background: done ? V2_COLORS.blue : V2_COLORS.border, marginBottom: "1rem", transition: "background 0.2s" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function LogJobModal({ isOpen, onClose, onSuccess, properties, prefill }: LogJobModalProps) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [loggedType, setLoggedType] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setForm({
      ...EMPTY_FORM,
      propertyId:     properties.length > 0 ? String(properties[0].id) : "",
      serviceType:    prefill?.serviceType    ?? SERVICE_TYPES[0],
      contractorName: prefill?.contractorName ?? "",
      date:           new Date().toISOString().split("T")[0],
    });
  }, [isOpen, prefill, properties]);

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
    if (!form.amount || parseFloat(form.amount) < 0) { toast.error("Enter the amount"); return; }
    if (!form.isDiy && !form.contractorName.trim())   { toast.error("Enter the contractor name"); return; }
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
      setStep(2);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to log job");
    } finally {
      setLoading(false);
    }
  };

  const showPermit = PERMIT_SERVICE_TYPES.has(form.serviceType);

  const stepTitle = step === 0 ? "What was done?" : step === 1 ? "Add the details" : `${loggedType} logged`;

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
          background: V2_COLORS.paper,
          borderRadius: V2_RADIUS.card,
          boxShadow: V2_SHADOWS.modal,
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
          padding: "1.25rem 1.5rem 1rem",
          borderBottom: `1px solid ${V2_COLORS.border}`,
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.blue, marginBottom: "0.2rem" }}>
              Maintenance Record
            </p>
            <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: V2_COLORS.ink }}>
              {stepTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, padding: "0.25rem" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        {step < 2 && (
          <div style={{ padding: "1rem 1.5rem 0", borderBottom: `1px solid ${V2_COLORS.border}` }}>
            <StepIndicator step={step} />
          </div>
        )}

        {/* ── Step 0: What ─────────────────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>
            {properties.length === 0 ? (
              <p style={{ textAlign: "center", padding: "1.5rem 0", color: V2_COLORS.muted, fontFamily: V2_FONTS.body, fontSize: "0.85rem", fontWeight: 300 }}>
                Add a property before logging jobs.
              </p>
            ) : (
              <>
                {/* DIY / Contractor — prominent split at the top */}
                <div>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: V2_COLORS.muted, marginBottom: "0.625rem" }}>
                    Who did the work?
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    {/* DIY */}
                    <button
                      onClick={() => update("isDiy", true)}
                      style={{
                        padding: "1rem", border: `2px solid ${form.isDiy ? V2_COLORS.blue : V2_COLORS.border}`,
                        background: form.isDiy ? V2_COLORS.lblue : V2_COLORS.paper,
                        borderRadius: V2_RADIUS.sm, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <Wrench size={20} color={form.isDiy ? V2_COLORS.blue : V2_COLORS.muted} />
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 700, color: form.isDiy ? V2_COLORS.blue : V2_COLORS.ink }}>
                        I did it myself
                      </span>
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", color: V2_COLORS.muted }}>DIY</span>
                    </button>
                    {/* Hired */}
                    <button
                      onClick={() => update("isDiy", false)}
                      style={{
                        padding: "1rem", border: `2px solid ${!form.isDiy ? V2_COLORS.ink : V2_COLORS.border}`,
                        background: !form.isDiy ? "#F5F3FF" : V2_COLORS.paper,
                        borderRadius: V2_RADIUS.sm, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <HardHat size={20} color={!form.isDiy ? V2_COLORS.ink : V2_COLORS.muted} />
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 700, color: !form.isDiy ? V2_COLORS.ink : V2_COLORS.ink }}>
                        I hired a pro
                      </span>
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", color: V2_COLORS.muted }}>Contractor</span>
                    </button>
                  </div>
                </div>

                {/* Property selector */}
                {properties.length > 1 && (
                  <div>
                    <label htmlFor="lj-property" className="form-label">Property</label>
                    <select id="lj-property" className="form-input" value={form.propertyId} onChange={(e) => update("propertyId", e.target.value)}>
                      {properties.map((p) => (
                        <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Service type */}
                <div>
                  <label htmlFor="lj-service-type" className="form-label">Service Type</label>
                  <select id="lj-service-type" className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
                    {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {isInsuranceRelevant(form.serviceType) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.4rem", padding: "0.35rem 0.6rem", background: V2_COLORS.lblue, border: `1px solid ${V2_COLORS.cobalTint}`, borderRadius: V2_RADIUS.sm }}>
                      <ShieldCheck size={11} color={V2_COLORS.blue} />
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 500, color: V2_COLORS.blue }}>
                        Insurance-relevant record
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.625rem 0.875rem", background: V2_COLORS.lblue, border: `1px solid ${V2_COLORS.cobalTint}`, borderRadius: V2_RADIUS.sm }}>
                  <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>📸</span>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.blue, lineHeight: 1.5, margin: 0 }}>
                    You'll be able to attach <strong>Before, During, and After</strong> photos in the next step.
                  </p>
                </div>

                <Button onClick={() => setStep(1)} style={{ width: "100%" }}>
                  Next: Add Details →
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── Step 1: Details ───────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>

            {/* Contractor name */}
            {!form.isDiy && (
              <div>
                <label htmlFor="lj-contractor" className="form-label">Contractor / Company Name</label>
                <input id="lj-contractor" className="form-input" placeholder="e.g. Cool Air Services LLC" value={form.contractorName} onChange={(e) => update("contractorName", e.target.value)} />
              </div>
            )}

            {/* Amount + Date */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="lj-amount" className="form-label">{form.isDiy ? "Materials Cost" : "Amount Paid"}</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: V2_COLORS.muted, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                  <input id="lj-amount" className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => update("amount", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
                </div>
              </div>
              <div>
                <label htmlFor="lj-date" className="form-label">Date Completed</label>
                <input id="lj-date" className="form-input" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="lj-description" className="form-label">Description <span style={{ color: V2_COLORS.muted, fontWeight: 300 }}>(optional)</span></label>
              <textarea id="lj-description" className="form-input" rows={2} placeholder="Describe the work done, materials used…" value={form.description} onChange={(e) => update("description", e.target.value)} style={{ resize: "vertical" }} />
            </div>

            {/* Permit — with explanation */}
            {showPermit && (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", padding: "0.75rem 1rem", border: `1px solid ${V2_COLORS.muted}`, background: V2_COLORS.attentionBg, borderRadius: V2_RADIUS.sm }}>
                  <AlertTriangle size={13} color={V2_COLORS.muted} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 300, color: V2_COLORS.muted, lineHeight: 1.5 }}>
                    {form.serviceType} work typically requires a permit. Logging the permit number adds legal weight to this record and increases your property score.
                  </p>
                </div>
                <div>
                  <label htmlFor="lj-permit" className="form-label">Permit Number <span style={{ color: V2_COLORS.muted, fontWeight: 300 }}>(optional)</span></label>
                  <input id="lj-permit" className="form-input" placeholder="e.g. HVAC-2024-0412" value={form.permitNumber} onChange={(e) => update("permitNumber", e.target.value)} />
                </div>
              </>
            )}

            {/* Warranty */}
            {!form.isDiy && (
              <div>
                <label htmlFor="lj-warranty" className="form-label">Warranty <span style={{ color: V2_COLORS.muted, fontWeight: 300 }}>(optional)</span></label>
                <div style={{ position: "relative" }}>
                  <input id="lj-warranty" className="form-input" type="number" min="0" placeholder="e.g. 12" value={form.warrantyMonths} onChange={(e) => update("warrantyMonths", e.target.value)} style={{ paddingRight: "4.5rem" }} />
                  <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", fontFamily: V2_FONTS.body, fontSize: "0.65rem", color: V2_COLORS.muted, pointerEvents: "none" }}>months</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.25rem" }}>
              <button
                onClick={() => setStep(0)}
                style={{
                  fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 500,
                  padding: "0.5rem 1.25rem", border: `1px solid ${V2_COLORS.border}`,
                  background: "none", cursor: "pointer", color: V2_COLORS.muted,
                  borderRadius: V2_RADIUS.pill,
                }}
              >
                ← Back
              </button>
              <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} style={{ flex: 1 }}>
                Save Record
              </Button>
            </div>

            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 300, color: V2_COLORS.muted, textAlign: "center" }}>
              Need to attach photos?{" "}
              <a href="/jobs/new" style={{ color: V2_COLORS.blue, textDecoration: "underline" }}>
                Open full form →
              </a>
            </p>
          </div>
        )}

        {/* ── Step 2: Success ───────────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "3.5rem", height: "3.5rem",
              border: `2px solid ${V2_COLORS.blue}`,
              borderRadius: V2_RADIUS.card,
              marginBottom: "1rem",
            }}>
              <CheckCircle size={24} color={V2_COLORS.blue} />
            </div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 600, color: V2_COLORS.blue, marginBottom: "0.375rem" }}>
              Record Saved
            </p>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, marginBottom: "1.5rem" }}>
              Your maintenance record has been added to your HomeGentic report.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={() => {
                  setStep(0);
                  setForm({ ...EMPTY_FORM, propertyId: form.propertyId, date: new Date().toISOString().split("T")[0] });
                }}
                style={{
                  fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 500,
                  padding: "0.5rem 1.25rem", border: `1px solid ${V2_COLORS.border}`,
                  background: "none", cursor: "pointer", color: V2_COLORS.muted,
                  borderRadius: V2_RADIUS.pill,
                }}
              >
                Log another
              </button>
              <button
                onClick={onClose}
                style={{
                  fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 500,
                  padding: "0.5rem 1.25rem", background: V2_COLORS.ink, color: V2_COLORS.paper,
                  border: "none", cursor: "pointer",
                  borderRadius: V2_RADIUS.pill,
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
