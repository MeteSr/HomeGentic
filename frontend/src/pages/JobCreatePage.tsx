import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { type Job, isInsuranceRelevant } from "@/services/job";
import { ArrowLeft, CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";
import { jobService } from "@/services/job";
import { photoService, PhotoQuota } from "@/services/photo";
import { paymentService, type PlanTier } from "@/services/payment";
import { propertyService } from "@/services/property";
import { usePropertyStore } from "@/store/propertyStore";
import { JobValueDelta } from "@/components/JobValueDelta";
import { computeScore } from "@/services/scoreService";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

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

const SERVICE_TYPES = [
  "HVAC","Roofing","Plumbing","Electrical","Flooring","Painting",
  "Landscaping","Windows","Foundation","Insulation","Drywall",
  "Kitchen Remodel","Bathroom Remodel","Other",
];
const PERMIT_SERVICE_TYPES = new Set(["HVAC","Roofing","Electrical","Plumbing","Foundation"]);

// Next-service suggestions per category
const NEXT_SERVICE: Record<string, string> = {
  HVAC:              "Schedule HVAC filter replacement in 3 months to maintain efficiency.",
  Roofing:           "Book an annual roof inspection to catch early wear.",
  Plumbing:          "Check water heater anode rod in 12 months to prevent corrosion.",
  Electrical:        "Schedule a panel safety inspection in 3 years.",
  Flooring:          "Consider re-sealing or refinishing flooring in 2 years.",
  Painting:          "Plan a touch-up inspection in 12 months.",
  "Kitchen Remodel": "Add appliance model numbers to your room record for warranty tracking.",
  "Bathroom Remodel":"Inspect grout and caulking in 12 months to prevent water intrusion.",
};

export default function JobCreatePage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const editJob   = (location.state as { editJob?: Job; prefill?: Record<string, string> } | null)?.editJob ?? null;
  const prefill   = (location.state as { editJob?: Job; prefill?: Record<string, string> } | null)?.prefill ?? null;
  const { properties, setProperties } = usePropertyStore();
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });
  const [userTier, setUserTier] = useState<PlanTier>("Free");
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; phase: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loggedServiceType, setLoggedServiceType] = useState("");
  const [scoreAtSubmit, setScoreAtSubmit] = useState(0);
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState({
    propertyId:      editJob ? editJob.propertyId                                              : "",
    serviceType:     editJob ? editJob.serviceType     : prefill?.serviceType    ?? SERVICE_TYPES[0],
    isDiy:           editJob ? editJob.isDiy           : false,
    contractorName:  editJob ? (editJob.contractorName ?? "") : prefill?.contractorName ?? "",
    amount:          editJob ? String((editJob.amount / 100).toFixed(2)) : prefill?.amount ?? "",
    date:            editJob ? editJob.date                                                    : new Date().toISOString().split("T")[0],
    description:     editJob ? (editJob.description ?? "")                                     : "",
    permitNumber:    editJob ? (editJob.permitNumber  ?? "")                                   : "",
    warrantyMonths:  editJob ? (editJob.warrantyMonths != null ? String(editJob.warrantyMonths) : "") : "",
  });

  // Populate the property store if the user navigated here directly (bypassing Dashboard)
  useEffect(() => {
    if (properties.length === 0) {
      propertyService.getMyProperties().then((list) => { if (list.length > 0) setProperties(list); }).catch((e) => console.error("[JobCreate] property load failed:", e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    photoService.getQuota().then(setQuota);
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((e) => console.error("[JobCreate] subscription load failed:", e));
    jobService.getAll().then((js) => setJobCount(js.length)).catch((e) => console.error("[JobCreate] job count load failed:", e));
    if (!editJob && properties.length > 0) setForm((f) => ({ ...f, propertyId: String(properties[0].id) }));
  }, [properties]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-navigate to dashboard 3 s after success
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => navigate("/dashboard"), 3000);
    return () => clearTimeout(timer);
  }, [submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.propertyId) { toast.error("Please select a property"); return; }
    if (!form.isDiy && !form.contractorName.trim()) { toast.error("Please enter the contractor name"); return; }
    if (!form.amount) { toast.error("Please enter the amount"); return; }
    setLoading(true);
    try {
      if (editJob) {
        await jobService.updateJob(editJob.id, {
          serviceType:    form.serviceType,
          contractorName: form.isDiy ? undefined : form.contractorName.trim(),
          amount:         Math.round(parseFloat(form.amount) * 100),
          date:           form.date,
          description:    form.description,
          isDiy:          form.isDiy,
          permitNumber:   form.permitNumber.trim() || undefined,
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : undefined,
        });
        toast.success("Job updated!");
      } else {
        await jobService.create({
          propertyId: form.propertyId, serviceType: form.serviceType,
          contractorName: form.isDiy ? undefined : form.contractorName.trim(),
          amount: Math.round(parseFloat(form.amount) * 100),
          date: form.date, description: form.description, isDiy: form.isDiy,
          permitNumber: form.permitNumber.trim() || undefined,
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : undefined,
        });
        setLoggedServiceType(form.serviceType);
        // Snapshot score for job-value delta display
        jobService.getAll().then((js) => setScoreAtSubmit(computeScore(js, []))).catch(() => {}); // score delta is display-only; failure does not affect job creation
        setSubmitted(true);
        return; // don't navigate — show success state
      }
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || (editJob ? "Failed to update job" : "Failed to create job"));
    } finally {
      setLoading(false);
    }
  };

  const showPermitField = PERMIT_SERVICE_TYPES.has(form.serviceType);
  const nextServiceTip  = NEXT_SERVICE[loggedServiceType] ?? "Log your next job to keep your HomeGentic Score growing.";

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Layout>
        <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
          <div className="job-success-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "4rem", height: "4rem", border: `2px solid ${UI.sage}`, marginBottom: "1.25rem" }}>
            <CheckCircle size={28} color={UI.sage} />
          </div>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.375rem" }}>
            Record Locked On-Chain
          </p>
          <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, marginBottom: "0.5rem" }}>
            {loggedServiceType} logged
          </h2>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.inkLight, marginBottom: "2rem" }}>
            Your maintenance record has been added to your HomeGentic report.
          </p>

          {/* §17.3.3 — Dollar value delta */}
          <JobValueDelta serviceType={loggedServiceType} currentScore={scoreAtSubmit} />

          {/* Next-service suggestion */}
          <div style={{ border: `1px solid ${UI.rule}`, padding: "1.25rem", background: COLORS.white, textAlign: "left", marginBottom: "1.5rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
              Next Step
            </p>
            <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.ink, lineHeight: 1.6, marginBottom: "0.875rem" }}>
              {nextServiceTip}
            </p>
            <button
              onClick={() => navigate("/maintenance")}
              style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: `1px solid ${UI.rule}`, background: "none", cursor: "pointer", color: UI.inkLight }}
            >
              Add to maintenance schedule →
            </button>
          </div>

          {/* Progress bar countdown */}
          <div style={{ height: "2px", background: UI.rule, marginBottom: "1.25rem", overflow: "hidden" }}>
            <div className="job-success-progress" style={{ height: "100%", background: UI.sage }} />
          </div>
          <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "1rem" }}>
            Redirecting to dashboard in 3 seconds…
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${UI.ink}`, background: UI.ink, color: UI.paper, cursor: "pointer" }}
            >
              Go to dashboard
            </button>
            <button
              onClick={() => { setSubmitted(false); setForm((f) => ({ ...f, serviceType: SERVICE_TYPES[0], contractorName: "", amount: "", description: "", permitNumber: "", warrantyMonths: "" })); }}
              style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${UI.rule}`, background: "none", cursor: "pointer", color: UI.inkLight }}
            >
              Log another job
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
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
          Maintenance Record
        </div>
        <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          {editJob ? "Edit Job" : "Log a Job"}
        </h1>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "1.5rem" }}>
          {editJob ? `Editing record for ${editJob.serviceType} · ${editJob.date}` : "Record a completed maintenance job on the blockchain."}
        </p>

        <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>

          {!editJob && properties.length > 0 && (
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
            <label className="form-label" htmlFor="serviceType">Service Type *</label>
            <select id="serviceType" className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {isInsuranceRelevant(form.serviceType) && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.4rem", padding: "0.35rem 0.6rem", background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}` }}>
                <ShieldCheck size={11} color={COLORS.sage} />
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage }}>
                  Insurance-relevant — this record may support a premium dispute or claim
                </span>
              </div>
            )}
          </div>

          {/* Permit warning */}
          {showPermitField && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "0.625rem",
              padding: "0.875rem 1rem",
              border: `1px solid ${COLORS.plumMid}`, background: COLORS.butter,
            }}>
              <AlertTriangle size={14} color={COLORS.plumMid} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.2rem" }}>
                  Permit may be required
                </p>
                <p style={{ fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 300 }}>
                  {form.serviceType} work typically requires a building permit. If one was pulled, logging the permit number below
                  significantly strengthens your record — buyers and lenders look for this.
                </p>
              </div>
            </div>
          )}

          {/* DIY toggle */}
          <div
            onClick={() => update("isDiy", !form.isDiy)}
            style={{
              display: "flex", alignItems: "center", gap: "0.875rem",
              padding: "0.875rem 1rem", cursor: "pointer",
              border: `1px solid ${form.isDiy ? UI.rust : UI.rule}`,
              background: form.isDiy ? COLORS.blush : COLORS.white,
            }}
          >
            <div style={{
              width: "2.25rem", height: "1.25rem",
              background: form.isDiy ? UI.rust : UI.rule,
              position: "relative", flexShrink: 0,
            }}>
              <div style={{
                position: "absolute", top: "0.125rem",
                left: form.isDiy ? "1.125rem" : "0.125rem",
                width: "1rem", height: "1rem",
                background: COLORS.white, transition: "left 0.15s",
              }} />
            </div>
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: form.isDiy ? UI.rust : UI.ink, marginBottom: "0.2rem" }}>
                I did this myself (DIY)
              </p>
              <p style={{ fontSize: "0.75rem", color: UI.inkLight, fontWeight: 300 }}>
                {form.isDiy ? "Your signature verifies this record." : "Toggle on if you performed the work yourself."}
              </p>
            </div>
          </div>

          {!form.isDiy && (
            <div>
              <label className="form-label" htmlFor="contractorName">Contractor / Company Name *</label>
              <input id="contractorName" className="form-input" placeholder="e.g. Cool Air Services LLC" value={form.contractorName} onChange={(e) => update("contractorName", e.target.value)} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="form-label" htmlFor="amount">{form.isDiy ? "Materials Cost *" : "Amount Paid *"}</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: UI.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input id="amount" className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => update("amount", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
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
              <label className="form-label" htmlFor="permitNumber">Permit Number <span style={{ color: UI.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <input id="permitNumber" className="form-input" placeholder="e.g. HVAC-2024-0412" value={form.permitNumber} onChange={(e) => update("permitNumber", e.target.value)} />
            </div>
          )}

          {!form.isDiy && (
            <div>
              <label className="form-label" htmlFor="warrantyMonths">Warranty <span style={{ color: UI.inkLight, fontWeight: 300 }}>(optional)</span></label>
              <div style={{ position: "relative" }}>
                <input id="warrantyMonths" className="form-input" type="number" min="0" placeholder="e.g. 12" value={form.warrantyMonths} onChange={(e) => update("warrantyMonths", e.target.value)} style={{ paddingRight: "4.5rem" }} />
                <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, pointerEvents: "none" }}>months</span>
              </div>
            </div>
          )}

          {!editJob && (
            <div>
              <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                Photos & Receipts <span style={{ color: UI.inkLight, fontWeight: 300 }}>(optional)</span>
              </label>
              <ConstructionPhotoUpload
                onUpload={(file, phase) => setUploadedFiles((u) => [...u, { file, phase }])}
                quota={{ ...quota, used: quota.used + uploadedFiles.length }}
                onUpgradeQuota={() => navigate("/pricing")}
              />
            </div>
          )}

          <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} size="lg" style={{ width: "100%" }}>
            {editJob ? "Save Changes" : "Log Job to Blockchain"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
