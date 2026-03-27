import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Send, Zap, User } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { PhotoQuotaDisplay } from "@/components/PhotoQuotaDisplay";
import { quoteService, Urgency } from "@/services/quote";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const SERVICE_TYPES = ["HVAC","Roofing","Plumbing","Electrical","Flooring","Painting","Landscaping","Windows","Foundation","Other"];

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string }[] = [
  { value: "low",       label: "Low",       desc: "Flexible timeline" },
  { value: "medium",    label: "Medium",    desc: "Within 2–4 weeks" },
  { value: "high",      label: "High",      desc: "Within 1 week" },
  { value: "emergency", label: "Emergency", desc: "ASAP" },
];

// Tier → open request limit
const TIER_LIMITS: Record<string, number> = {
  Free: 3, Pro: 10, Premium: 10, ContractorPro: 999,
};

export default function QuoteRequestPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const prefill   = (location.state as { prefill?: Record<string, string> } | null)?.prefill ?? null;
  const { properties } = usePropertyStore();
  const [loading,   setLoading]   = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [tierLimit, setTierLimit] = useState(3);
  const [form, setForm] = useState({
    propertyId:  properties[0] ? String(properties[0].id) : "",
    serviceType: prefill?.serviceType ?? SERVICE_TYPES[0],
    urgency:     "medium" as Urgency,
    description: "",
    budgetMin:   "",
    budgetMax:   "",
  });

  useEffect(() => {
    quoteService.getRequests().then((reqs) => {
      const open = reqs.filter((r) => r.status === "open" || r.status === "quoted").length;
      setOpenCount(open);
      // Infer tier from limit embedded in response (fallback to Free)
      const tier = (reqs[0] as any)?.tier ?? "Free";
      setTierLimit(TIER_LIMITS[tier] ?? 3);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const quota     = { used: openCount, limit: tierLimit, tier: "Free" };
  const atLimit   = openCount >= tierLimit;
  const update    = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (properties.length === 0) {
    return (
      <Layout>
        <div style={{ maxWidth: "38rem", margin: "2rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", marginBottom: "0.5rem" }}>No properties yet</p>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, marginBottom: "1.25rem" }}>
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
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Contractor Network
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Request a Quote
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.5rem" }}>
          Get competitive quotes from verified HomeFax contractors.
        </p>

        {/* Preferred contractor banner (when arriving from contractor profile) */}
        {prefill?.contractorName && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", border: `1px solid ${S.sage}`, background: "#F0F6F3", marginBottom: "1.25rem" }}>
            <User size={13} color={S.sage} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, marginBottom: "0.1rem" }}>Preferred contractor</p>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: S.ink }}>{prefill.contractorName}</p>
            </div>
          </div>
        )}

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          <div>
            <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>Open Requests</label>
            <PhotoQuotaDisplay used={quota.used} limit={quota.limit} tier={quota.tier} onUpgrade={() => navigate("/pricing")} />
          </div>

          <div>
            <label className="form-label">Property *</label>
            <select className="form-input" value={form.propertyId} onChange={(e) => update("propertyId", e.target.value)}>
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Service Type *</label>
            <select className="form-input" value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Urgency *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: S.rule }}>
              {URGENCY_OPTIONS.map((opt) => (
                <div key={opt.value} onClick={() => update("urgency", opt.value)} style={{
                  padding: "0.75rem 1rem", cursor: "pointer",
                  background: form.urgency === opt.value ? "#FAF0ED" : "#fff",
                }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: form.urgency === opt.value ? S.rust : S.ink, marginBottom: "0.2rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    {opt.value === "emergency" && <Zap size={11} />}
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: S.inkLight, fontWeight: 300 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Budget range */}
          <div>
            <label className="form-label">Budget <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: S.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input className="form-input" type="number" min="0" placeholder="Min" value={form.budgetMin} onChange={(e) => update("budgetMin", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: S.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
                <input className="form-input" type="number" min="0" placeholder="Max" value={form.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} style={{ paddingLeft: "1.5rem" }} />
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">Describe the work needed *</label>
            <textarea className="form-input" rows={4} placeholder="Describe the issue or project in detail. Include any relevant measurements, materials, or constraints." value={form.description} onChange={(e) => update("description", e.target.value)} style={{ resize: "vertical" }} />
          </div>

          <Button loading={loading} disabled={atLimit} onClick={handleSubmit} icon={<Send size={14} />} size="lg" style={{ width: "100%" }}>
            {atLimit ? "Quote limit reached — Upgrade to continue" : "Send Quote Request"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
