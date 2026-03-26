import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle, Home } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { propertyService, PropertyType, SubscriptionTier } from "@/services/property";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

interface FormData {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType;
  yearBuilt: string;
  squareFeet: string;
  tier: SubscriptionTier;
}

const PROPERTY_TYPES: PropertyType[] = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];
const TIERS: { value: SubscriptionTier; label: string; price: string; desc: string }[] = [
  { value: "Free", label: "Free", price: "$0", desc: "1 property, 5 photos/job" },
  { value: "Pro", label: "Pro", price: "$9/mo", desc: "5 properties, 20 photos/job" },
  { value: "Premium", label: "Premium", price: "$49/yr", desc: "Unlimited everything" },
];

export default function PropertyRegisterPage() {
  const navigate = useNavigate();
  const { addProperty } = usePropertyStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    address: "",
    city: "",
    state: "",
    zipCode: "",
    propertyType: "SingleFamily",
    yearBuilt: "",
    squareFeet: "",
    tier: "Free",
  });

  const update = (key: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const property = await propertyService.registerProperty({
        address: form.address,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        propertyType: form.propertyType,
        yearBuilt: parseInt(form.yearBuilt),
        squareFeet: parseInt(form.squareFeet),
        tier: form.tier,
      });
      addProperty(property);
      toast.success("Property registered!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    maxWidth: "40rem",
    margin: "2rem auto",
    padding: "0 1.5rem",
  };

  const cardStyle = {
    backgroundColor: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "1.25rem",
    padding: "2rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  return (
    <Layout>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <button
            onClick={() => navigate("/dashboard")}
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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111827" }}>
            Register a Property
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Add your home to the HomeFax blockchain registry.
          </p>
        </div>

        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {[1, 2, 3].map((n, i) => (
            <React.Fragment key={n}>
              <div
                style={{
                  width: "1.75rem",
                  height: "1.75rem",
                  borderRadius: "9999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  backgroundColor: step >= n ? "#3b82f6" : "#e5e7eb",
                  color: step >= n ? "white" : "#9ca3af",
                }}
              >
                {n}
              </div>
              {i < 2 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    backgroundColor: step > n ? "#3b82f6" : "#e5e7eb",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Address */}
        {step === 1 && (
          <div style={cardStyle}>
            <h2 style={{ fontWeight: 800, fontSize: "1.125rem", color: "#111827", marginBottom: "1.25rem" }}>
              Property Address
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Street Address *</label>
                <input
                  className="form-input"
                  placeholder="123 Main Street"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">City *</label>
                  <input
                    className="form-input"
                    placeholder="Austin"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">State *</label>
                  <input
                    className="form-input"
                    placeholder="TX"
                    maxLength={2}
                    value={form.state}
                    onChange={(e) => update("state", e.target.value.toUpperCase())}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">ZIP Code *</label>
                <input
                  className="form-input"
                  placeholder="78701"
                  value={form.zipCode}
                  onChange={(e) => update("zipCode", e.target.value)}
                />
              </div>
            </div>
            <Button
              style={{ width: "100%", marginTop: "1.5rem" }}
              disabled={!form.address || !form.city || !form.state || !form.zipCode}
              onClick={() => setStep(2)}
              iconRight={<ArrowRight size={16} />}
            >
              Next: Property Details
            </Button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div style={cardStyle}>
            <h2 style={{ fontWeight: 800, fontSize: "1.125rem", color: "#111827", marginBottom: "1.25rem" }}>
              Property Details
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Property Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {PROPERTY_TYPES.map((t) => (
                    <div
                      key={t}
                      onClick={() => update("propertyType", t)}
                      style={{
                        padding: "0.625rem",
                        borderRadius: "0.625rem",
                        border:
                          form.propertyType === t
                            ? "2px solid #3b82f6"
                            : "2px solid #e5e7eb",
                        backgroundColor: form.propertyType === t ? "#eff6ff" : "white",
                        cursor: "pointer",
                        fontSize: "0.813rem",
                        fontWeight: 600,
                        textAlign: "center",
                        color: form.propertyType === t ? "#1d4ed8" : "#374151",
                        transition: "all 0.15s",
                      }}
                    >
                      {t === "SingleFamily" ? "Single Family" : t}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">Year Built *</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="1985"
                    min="1800"
                    max={new Date().getFullYear()}
                    value={form.yearBuilt}
                    onChange={(e) => update("yearBuilt", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Square Feet *</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="2000"
                    min="100"
                    value={form.squareFeet}
                    onChange={(e) => update("squareFeet", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Plan</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {TIERS.map((t) => (
                    <div
                      key={t.value}
                      onClick={() => update("tier", t.value)}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "0.625rem",
                        border:
                          form.tier === t.value ? "2px solid #3b82f6" : "2px solid #e5e7eb",
                        backgroundColor: form.tier === t.value ? "#eff6ff" : "white",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            color: form.tier === t.value ? "#1d4ed8" : "#111827",
                          }}
                        >
                          {t.label}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", marginLeft: "0.5rem" }}>
                          {t.desc}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: "0.875rem",
                          color: form.tier === t.value ? "#1d4ed8" : "#374151",
                        }}
                      >
                        {t.price}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <Button variant="outline" onClick={() => setStep(1)} icon={<ArrowLeft size={16} />}>
                Back
              </Button>
              <Button
                style={{ flex: 1 }}
                disabled={!form.yearBuilt || !form.squareFeet}
                onClick={() => setStep(3)}
                iconRight={<ArrowRight size={16} />}
              >
                Review
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div
                style={{
                  width: "2.5rem",
                  height: "2.5rem",
                  backgroundColor: "#eff6ff",
                  borderRadius: "0.625rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Home size={20} color="#3b82f6" />
              </div>
              <h2 style={{ fontWeight: 800, fontSize: "1.125rem", color: "#111827" }}>
                Review & Confirm
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.5rem" }}>
              {[
                { label: "Address", value: form.address },
                { label: "City", value: form.city },
                { label: "State", value: form.state },
                { label: "ZIP", value: form.zipCode },
                { label: "Type", value: form.propertyType === "SingleFamily" ? "Single Family" : form.propertyType },
                { label: "Year Built", value: form.yearBuilt },
                { label: "Square Feet", value: form.squareFeet },
                { label: "Plan", value: form.tier },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#6b7280" }}>{row.label}</span>
                  <span style={{ fontWeight: 600, color: "#111827" }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setStep(2)} icon={<ArrowLeft size={16} />}>
                Back
              </Button>
              <Button
                loading={loading}
                onClick={handleSubmit}
                icon={<CheckCircle size={16} />}
                style={{ flex: 1 }}
              >
                Register Property
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
