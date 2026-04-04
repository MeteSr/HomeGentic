import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService, PropertyType, SubscriptionTier } from "@/services/property";
import { usePropertyStore } from "@/store/propertyStore";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { triggerPermitImport, createJobsFromPermits, type ImportedPermit, type PermitImportResult } from "@/services/permitImport";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";
import PermitImportReviewPanel from "@/components/PermitImportReviewPanel";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

interface FormData {
  address: string; city: string; state: string; zipCode: string;
  propertyType: PropertyType; yearBuilt: string; squareFeet: string;
  tier: SubscriptionTier;
}

const PROPERTY_TYPES: PropertyType[] = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];
const TIERS: { value: SubscriptionTier; label: string; price: string; desc: string }[] = [
  { value: "Free",    label: "Free",    price: "$0",     desc: "1 property, 5 photos/job" },
  { value: "Pro",     label: "Pro",     price: "$10/mo", desc: "5 properties, 20 photos/job" },
  { value: "Premium", label: "Premium", price: "$49/mo", desc: "Unlimited everything" },
];

export default function PropertyRegisterPage() {
  const navigate = useNavigate();
  const { addProperty } = usePropertyStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [permitResult, setPermitResult] = useState<PermitImportResult | null>(null);
  const [registeredPropertyId, setRegisteredPropertyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    address: "", city: "", state: "", zipCode: "",
    propertyType: "SingleFamily", yearBuilt: "", squareFeet: "", tier: "Free",
  });

  const update = (key: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const property = await propertyService.registerProperty({
        address: form.address, city: form.city, state: form.state,
        zipCode: form.zipCode, propertyType: form.propertyType,
        yearBuilt: parseInt(form.yearBuilt), squareFeet: parseInt(form.squareFeet),
        tier: form.tier,
      });
      addProperty(property);
      toast.success("Property registered!");

      // §17.5.3 — trigger permit import in background; show review step if found
      const result = await triggerPermitImport(property).catch(() => null);
      if (result?.citySupported && result.permits.length > 0) {
        setRegisteredPropertyId(property.id);
        setPermitResult(result);
        setStep(4);
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePermitConfirm = async (confirmed: ImportedPermit[]) => {
    if (registeredPropertyId && confirmed.length > 0) {
      await createJobsFromPermits(registeredPropertyId, confirmed).catch(() => {});
      toast.success(`${confirmed.length} permit record${confirmed.length !== 1 ? "s" : ""} added to your history.`);
    }
    navigate("/dashboard");
  };

  return (
    <Layout>
      <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          New Property
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "1.5rem" }}>
          Register a Property
        </h1>

        {/* Step indicator */}
        {step < 4 && (
          <div style={{ display: "flex", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{
                flex: 1, padding: "0.625rem", textAlign: "center",
                borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`,
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                color: step === n ? S.rust : step > n ? S.inkLight : COLORS.rule,
                background: step === n ? COLORS.blush : COLORS.white,
              }}>
                {n === 1 ? "Address" : n === 2 ? "Details" : "Confirm"}
              </div>
            ))}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.75rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Street Address *</label>
                <AddressAutocomplete
                  className="form-input"
                  value={form.address}
                  onChange={(v) => update("address", v)}
                  onPlaceSelect={(place) => {
                    setForm((f) => ({
                      ...f,
                      address: place.address || f.address,
                      city:    place.city    || f.city,
                      state:   place.state   || f.state,
                      zipCode: place.zipCode || f.zipCode,
                    }));
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">City *</label>
                  <input className="form-input" placeholder="Austin" value={form.city} onChange={(e) => update("city", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">State *</label>
                  <input className="form-input" placeholder="TX" maxLength={2} value={form.state} onChange={(e) => update("state", e.target.value.toUpperCase())} />
                </div>
              </div>
              <div>
                <label className="form-label">ZIP Code *</label>
                <input className="form-input" placeholder="78701" value={form.zipCode} onChange={(e) => update("zipCode", e.target.value)} />
              </div>
              {/* §17.5.5 — permit coverage indicator */}
              {form.city && form.state && (
                <PermitCoverageIndicator city={form.city} state={form.state} />
              )}
            </div>
            <Button style={{ width: "100%", marginTop: "1.5rem" }} disabled={!form.address || !form.city || !form.state || !form.zipCode} onClick={() => setStep(2)} iconRight={<ArrowRight size={14} />}>
              Next: Property Details
            </Button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.75rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Property Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: S.rule }}>
                  {PROPERTY_TYPES.map((t) => (
                    <div key={t} onClick={() => update("propertyType", t)} style={{
                      padding: "0.75rem", cursor: "pointer",
                      background: form.propertyType === t ? COLORS.blush : COLORS.white,
                      fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
                      textTransform: "uppercase", textAlign: "center",
                      color: form.propertyType === t ? S.rust : S.inkLight,
                      border: form.propertyType === t ? `1px solid ${S.rust}` : "none",
                    }}>
                      {t === "SingleFamily" ? "Single Family" : t}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">Year Built *</label>
                  <input className="form-input" type="number" placeholder="1985" min="1800" max={new Date().getFullYear()} value={form.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Square Feet *</label>
                  <input className="form-input" type="number" placeholder="2000" min="100" value={form.squareFeet} onChange={(e) => update("squareFeet", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Plan</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
                  {TIERS.map((t) => (
                    <div key={t.value} onClick={() => update("tier", t.value)} style={{
                      padding: "0.875rem 1rem", cursor: "pointer",
                      background: form.tier === t.value ? COLORS.blush : COLORS.white,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: form.tier === t.value ? S.rust : S.ink }}>{t.label}</span>
                        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginLeft: "0.75rem" }}>{t.desc}</span>
                      </div>
                      <span style={{ fontFamily: S.mono, fontSize: "0.75rem", fontWeight: 500, color: form.tier === t.value ? S.rust : S.inkLight }}>{t.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <Button variant="outline" onClick={() => setStep(1)} icon={<ArrowLeft size={14} />}>Back</Button>
              <Button style={{ flex: 1 }} disabled={!form.yearBuilt || !form.squareFeet} onClick={() => setStep(3)} iconRight={<ArrowRight size={14} />}>Review</Button>
            </div>
          </div>
        )}

        {/* Step 4 — §17.5.4 Permit import review */}
        {step === 4 && permitResult && (
          <PermitImportReviewPanel
            permits={permitResult.permits}
            onConfirm={handlePermitConfirm}
            onDismissAll={() => navigate("/dashboard")}
          />
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Review & Confirm</p>
            </div>
            {[
              { label: "Address",    value: form.address },
              { label: "City",       value: form.city },
              { label: "State",      value: form.state },
              { label: "ZIP",        value: form.zipCode },
              { label: "Type",       value: form.propertyType === "SingleFamily" ? "Single Family" : form.propertyType },
              { label: "Year Built", value: form.yearBuilt },
              { label: "Sq Ft",      value: form.squareFeet },
              { label: "Plan",       value: form.tier },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.75rem 1.25rem",
                borderBottom: i < arr.length - 1 ? `1px solid ${S.rule}` : "none",
              }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{row.label}</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ padding: "1.25rem", display: "flex", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setStep(2)} icon={<ArrowLeft size={14} />}>Back</Button>
              <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={14} />} style={{ flex: 1 }}>Register Property</Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
