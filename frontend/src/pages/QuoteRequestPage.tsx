import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Send, Zap, User } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { PhotoQuotaDisplay } from "@/components/PhotoQuotaDisplay";
import { quoteService, Urgency } from "@/services/quote";
import { paymentService } from "@/services/payment";
import { propertyService } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { getPriceRange, PriceRange, SERVICE_SUBCATEGORIES } from "@/services/market";
import { PriceBenchmarkWidget } from "@/components/PriceBenchmarkWidget";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const SERVICE_TYPES = ["HVAC","Roofing","Plumbing","Electrical","Flooring","Painting","Landscaping","Windows","Foundation","Other"];

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string }[] = [
  { value: "low",       label: "Low",       desc: "Flexible timeline" },
  { value: "medium",    label: "Medium",    desc: "Within 2–4 weeks" },
  { value: "high",      label: "High",      desc: "Within 1 week" },
  { value: "emergency", label: "Emergency", desc: "ASAP" },
];

// Tier → open request limit (Infinity = no limit)
const TIER_LIMITS: Record<string, number> = {
  Free: 3, Basic: 3, Pro: 10,
  Premium: Infinity, ContractorFree: Infinity, ContractorPro: Infinity,
};

export default function QuoteRequestPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const prefill   = (location.state as { prefill?: Record<string, string> } | null)?.prefill ?? null;
  const { properties, setProperties } = usePropertyStore();
  const [loading,     setLoading]     = useState(false);
  const [openCount,   setOpenCount]   = useState(0);
  const [tierLimit,   setTierLimit]   = useState(3);
  const [propertyJobs, setPropertyJobs] = useState<Job[]>([]);
  const [priceRange,  setPriceRange]  = useState<PriceRange | null>(null);
  const [form, setForm] = useState({
    propertyId:  properties[0] ? String(properties[0].id) : "",
    serviceType: prefill?.serviceType ?? SERVICE_TYPES[0],
    subCategory: "",
    urgency:     "medium" as Urgency,
    description: "",
    budgetMin:   "",
    budgetMax:   "",
  });

  useEffect(() => {
    if (properties.length === 0) {
      propertyService.getMyProperties()
        .then((list) => {
          if (list.length > 0) {
            setProperties(list);
            setForm((f) => f.propertyId ? f : { ...f, propertyId: String(list[0].id) });
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.allSettled([quoteService.getRequests(), paymentService.getMySubscription()])
      .then(([reqsResult, subResult]) => {
        if (reqsResult.status === "fulfilled") {
          const open = reqsResult.value.filter((r) => r.status === "open" || r.status === "quoted").length;
          setOpenCount(open);
        }
        const tier = subResult.status === "fulfilled" ? subResult.value.tier : "Free";
        setTierLimit(TIER_LIMITS[tier] ?? 3);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load jobs for the selected property to inform price range
  useEffect(() => {
    if (!form.propertyId) return;
    jobService.getByProperty(form.propertyId).then(setPropertyJobs).catch(() => {});
  }, [form.propertyId]);

  // Recompute price range whenever service type, subcategory, or loaded jobs change
  useEffect(() => {
    const selectedProperty = properties.find((p) => String(p.id) === form.propertyId);
    const range = getPriceRange(form.serviceType, propertyJobs, selectedProperty?.state, form.subCategory || undefined);
    setPriceRange(range);
  }, [form.serviceType, form.subCategory, form.propertyId, propertyJobs, properties]);

  const quota     = { used: openCount, limit: tierLimit, tier: "Free" };
  const atLimit   = openCount >= tierLimit;
  const update    = (key: string, value: string) =>
    setForm((f) => key === "serviceType" ? { ...f, [key]: value, subCategory: "" } : { ...f, [key]: value });

  const subCategoryOptions = SERVICE_SUBCATEGORIES[form.serviceType] ?? [];

  if (properties.length === 0) {
    return (
      <Layout>
        <div style={{ maxWidth: "38rem", margin: "2rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <p style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", marginBottom: "0.5rem" }}>No properties yet</p>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginBottom: "1.25rem" }}>
            Add a property before requesting quotes.
          </p>
          <Button onClick={() => navigate("/properties/new")}>Add Property</Button>
        </div>
      </Layout>
    );
  }

  const handleSubmit = async () => {
    if (!form.description.trim()) { toast.error("Please describe the work needed"); return; }
    setLoading(true);
    try {
      const req = await quoteService.createRequest({
        propertyId: form.propertyId, serviceType: form.serviceType,
        urgency: form.urgency, description: form.description,
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
      <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
          Contractor Network
        </div>
        <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Request a Quote
        </h1>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "1.5rem" }}>
          Get competitive quotes from verified HomeGentic contractors.
        </p>

        {/* Preferred contractor banner (when arriving from contractor profile) */}
        {prefill?.contractorName && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", border: `1px solid ${UI.sage}`, background: COLORS.sageLight, marginBottom: "1.25rem" }}>
            <User size={13} color={UI.sage} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.1rem" }}>Preferred contractor</p>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: UI.ink }}>{prefill.contractorName}</p>
            </div>
          </div>
        )}

        <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>

          <div>
            <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>Open Requests</label>
            <PhotoQuotaDisplay used={quota.used} limit={quota.limit} tier={quota.tier} onUpgrade={() => navigate("/pricing")} />
          </div>

          <div>
            <label className="form-label" htmlFor="property">Property *</label>
            <select id="property" className="form-input" value={form.propertyId} onChange={(e) => update("propertyId", e.target.value)}>
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="service-type">Service Type *</label>
            <select id="service-type" className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {subCategoryOptions.length > 0 && (
            <div>
              <label className="form-label">
                What specifically do you need?
                <span style={{ color: UI.inkLight, fontWeight: 300, marginLeft: "0.375rem" }}>(optional — refines your price estimate)</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))", gap: "1rem" }}>
                <div
                  onClick={() => update("subCategory", "")}
                  style={{
                    padding: "0.625rem 0.875rem", cursor: "pointer",
                    background: form.subCategory === "" ? COLORS.blush : COLORS.white,
                    borderRadius: RADIUS.sm, boxShadow: SHADOWS.card,
                  }}
                >
                  <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: form.subCategory === "" ? UI.rust : UI.ink }}>
                    General / Not sure
                  </div>
                </div>
                {subCategoryOptions.map((opt) => (
                  <div
                    key={opt.label}
                    onClick={() => update("subCategory", opt.label)}
                    style={{
                      padding: "0.625rem 0.875rem", cursor: "pointer",
                      background: form.subCategory === opt.label ? COLORS.blush : COLORS.white,
                      borderRadius: RADIUS.sm, boxShadow: SHADOWS.card,
                    }}
                  >
                    <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: form.subCategory === opt.label ? UI.rust : UI.ink, marginBottom: "0.2rem" }}>
                      {opt.label}
                    </div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
                      ${Math.round(opt.lowCents / 100).toLocaleString()}–${Math.round(opt.highCents / 100).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* §17.1.3 — Zip-code price benchmark widget */}
          {(() => {
            const selectedProperty = properties.find((p) => String(p.id) === form.propertyId);
            return selectedProperty?.zipCode ? (
              <PriceBenchmarkWidget serviceType={form.serviceType} zipCode={selectedProperty.zipCode} />
            ) : null;
          })()}

          {/* Price range estimate */}
          {priceRange && (
            <div style={{ padding: "1rem 1.25rem", background: UI.paper, border: `1px solid ${UI.rule}`, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
                Typical price range — {form.subCategory || form.serviceType}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink }}>
                  ${Math.round(priceRange.low / 100).toLocaleString()}
                </span>
                <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>–</span>
                <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink }}>
                  ${Math.round(priceRange.high / 100).toLocaleString()}
                </span>
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginLeft: "0.25rem" }}>
                  median ${Math.round(priceRange.median / 100).toLocaleString()}
                </span>
              </div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                {priceRange.source === "local"
                  ? `Based on ${priceRange.sampleSize} verified job${priceRange.sampleSize !== 1 ? "s" : ""} in your HomeGentic history`
                  : "Based on 2024 Remodeling Magazine national averages, adjusted for your state"}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Urgency *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {URGENCY_OPTIONS.map((opt) => (
                <div key={opt.value} onClick={() => update("urgency", opt.value)} style={{
                  padding: "0.75rem 1rem", cursor: "pointer",
                  background: form.urgency === opt.value ? COLORS.blush : COLORS.white,
                  borderRadius: RADIUS.sm, boxShadow: SHADOWS.card,
                }}>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: form.urgency === opt.value ? UI.rust : UI.ink, marginBottom: "0.2rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    {opt.value === "emergency" && <Zap size={11} />}
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: UI.inkLight, fontWeight: 300 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Budget range */}
          <div>
            <label className="form-label">Budget <span style={{ color: UI.inkLight, fontWeight: 300 }}>(optional)</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: UI.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input className="form-input" type="number" min="0" placeholder="Min" value={form.budgetMin} onChange={(e) => update("budgetMin", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: UI.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input className="form-input" type="number" min="0" placeholder="Max" value={form.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
              </div>
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="description">Describe the work needed *</label>
            <textarea id="description" className="form-input" rows={4} placeholder="Describe the issue or project in detail. Include any relevant measurements, materials, or constraints." value={form.description} onChange={(e) => update("description", e.target.value)} style={{ resize: "vertical" }} />
          </div>

          <Button loading={loading} disabled={atLimit} onClick={handleSubmit} icon={<Send size={14} />} size="lg" style={{ width: "100%" }}>
            {atLimit ? "Quote limit reached — Upgrade to continue" : "Send Quote Request"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
