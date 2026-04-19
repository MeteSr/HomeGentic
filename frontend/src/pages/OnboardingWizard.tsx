import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { propertyService } from "@/services/property";
import { photoService, type PhotoQuota } from "@/services/photo";
import { usePropertyStore } from "@/store/propertyStore";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";
import { Button } from "@/components/Button";
import { isValidZip, isValidUsState } from "@/utils/validators";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import type { PropertyType } from "@/services/property";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const PROPERTY_TYPES: PropertyType[] = [
  "SingleFamily", "Condo", "Townhouse", "MultiFamily",
];

const SYSTEM_LABELS = [
  { key: "hvac",        label: "HVAC / AC",        placeholder: "2018" },
  { key: "roof",        label: "Roof",              placeholder: "2015" },
  { key: "waterHeater", label: "Water Heater",      placeholder: "2020" },
  { key: "electrical",  label: "Electrical Panel",  placeholder: "2005" },
  { key: "plumbing",    label: "Plumbing",          placeholder: "1990" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressForm {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

interface DetailsForm {
  propertyType: PropertyType;
  yearBuilt: string;
  squareFeet: string;
}

interface SystemAgesForm {
  [key: string]: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span
          style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid }}
        >
          Step {step} of {TOTAL_STEPS}
        </span>
        <span style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", color: COLORS.plumMid }}>
          {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: "6px", background: COLORS.rule, borderRadius: 100 }}
      >
        <div style={{
          height: "6px", width: `${pct}%`,
          background: COLORS.sage,
          borderRadius: 100,
          transition: "width 0.35s ease",
        }} />
      </div>
    </div>
  );
}

function StepHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem",
      lineHeight: 1.1, color: COLORS.plum, margin: "0 0 0.375rem",
    }}>
      {children}
    </h2>
  );
}

function StepSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: FONTS.sans, fontSize: "0.85rem", color: COLORS.plumMid,
      fontWeight: 300, lineHeight: 1.6, margin: "0 0 1.5rem",
    }}>
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const navigate     = useNavigate();
  const { addProperty, setProperties } = usePropertyStore();

  const [step, setStep] = useState(1);

  // Step 1 — address
  const [addr, setAddr] = useState<AddressForm>({ address: "", city: "", state: "", zipCode: "" });

  // Step 2 — details
  const [details, setDetails] = useState<DetailsForm>({ propertyType: "SingleFamily", yearBuilt: "", squareFeet: "" });

  // Step 3 — documents
  const [quota, setQuota]   = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [registering, setRegistering]   = useState(false);

  // Step 4 — system ages
  const [ages, setAges] = useState<SystemAgesForm>({});

  // ── Validation ──────────────────────────────────────────────────────────────

  const step1Valid =
    addr.address.trim().length > 0 &&
    addr.city.trim().length > 0 &&
    isValidUsState(addr.state) &&
    isValidZip(addr.zipCode);

  const step2Valid =
    details.yearBuilt.length > 0 &&
    details.squareFeet.length > 0 &&
    Number(details.yearBuilt) >= 1900 &&
    Number(details.yearBuilt) <= new Date().getFullYear();

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleNext = async () => {
    if (step === 2 && !registeredId) {
      // Register the property when leaving step 2
      setRegistering(true);
      try {
        const property = await propertyService.registerProperty({
          address:      addr.address,
          city:         addr.city,
          state:        addr.state,
          zipCode:      addr.zipCode,
          propertyType: details.propertyType,
          yearBuilt:    parseInt(details.yearBuilt),
          squareFeet:   parseInt(details.squareFeet),
          tier:         "Free",
        });
        addProperty(property);
        setProperties([property]);
        setRegisteredId(String(property.id));
        // Pre-fetch quota for step 3
        photoService.getQuota().then(setQuota).catch(() => {});
        toast.success("Property registered!");
      } catch (err: any) {
        toast.error(err.message || "Registration failed");
        setRegistering(false);
        return;
      }
      setRegistering(false);
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleFinish = () => navigate("/dashboard");

  const handleSkip = () => navigate("/dashboard");

  const handleDocUpload = async (file: File, docType: string) => {
    if (!registeredId) return;
    await photoService.upload(file, `docs_${registeredId}`, registeredId, "PostConstruction", docType);
    setQuota((q) => ({ ...q, used: q.used + 1 }));
  };

  // ── Step content ────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <StepHeading>Property Address</StepHeading>
            <StepSubtitle>Tell us where your home is located.</StepSubtitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label" htmlFor="wiz-address">Street Address *</label>
                <AddressAutocomplete
                  id="wiz-address"
                  className="form-input"
                  value={addr.address}
                  onChange={(v: string) => setAddr((f) => ({ ...f, address: v }))}
                  onPlaceSelect={(place: any) => setAddr((f) => ({
                    ...f,
                    address: place.address || f.address,
                    city:    place.city    || f.city,
                    state:   place.state   || f.state,
                    zipCode: place.zipCode || f.zipCode,
                  }))}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label" htmlFor="wiz-city">City *</label>
                  <input id="wiz-city" className="form-input" placeholder="Austin"
                    value={addr.city} onChange={(e) => setAddr((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label" htmlFor="wiz-state">State *</label>
                  <input id="wiz-state" className="form-input" placeholder="TX" maxLength={2}
                    value={addr.state}
                    onChange={(e) => setAddr((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                    style={addr.state.length === 2 && !isValidUsState(addr.state) ? { borderColor: COLORS.rust } : undefined}
                  />
                  {addr.state.length === 2 && !isValidUsState(addr.state) && (
                    <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>
                      Valid US state abbreviation required
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="form-label" htmlFor="wiz-zip">ZIP Code *</label>
                <input id="wiz-zip" className="form-input" placeholder="78701"
                  value={addr.zipCode}
                  onChange={(e) => setAddr((f) => ({ ...f, zipCode: e.target.value }))}
                  style={addr.zipCode && !isValidZip(addr.zipCode) ? { borderColor: COLORS.rust } : undefined}
                />
                {addr.zipCode && !isValidZip(addr.zipCode) && (
                  <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>
                    Enter a 5-digit ZIP code
                  </p>
                )}
              </div>
              {addr.city && addr.state && <PermitCoverageIndicator city={addr.city} state={addr.state} />}
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <StepHeading>Property Details</StepHeading>
            <StepSubtitle>A few more details about your home.</StepSubtitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Property Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: COLORS.rule }}>
                  {PROPERTY_TYPES.map((t) => (
                    <div
                      key={t}
                      onClick={() => setDetails((d) => ({ ...d, propertyType: t }))}
                      style={{
                        padding: "0.75rem", cursor: "pointer",
                        background: details.propertyType === t ? COLORS.blush : COLORS.white,
                        fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 500,
                        textAlign: "center",
                        color: details.propertyType === t ? COLORS.rust : COLORS.plumMid,
                        border: details.propertyType === t ? `1.5px solid ${COLORS.rust}` : "none",
                      }}
                    >
                      {t === "SingleFamily" ? "Single Family" : t}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label" htmlFor="wiz-year">Year Built *</label>
                  <input id="wiz-year" className="form-input" type="number"
                    placeholder="1985" min="1900" max={new Date().getFullYear()}
                    value={details.yearBuilt}
                    onChange={(e) => setDetails((d) => ({ ...d, yearBuilt: e.target.value }))}
                  />
                  {details.yearBuilt && (Number(details.yearBuilt) < 1900 || Number(details.yearBuilt) > new Date().getFullYear()) && (
                    <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>
                      Year must be between 1900 and {new Date().getFullYear()}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label" htmlFor="wiz-sqft">Square Feet *</label>
                  <input id="wiz-sqft" className="form-input" type="number"
                    placeholder="2000" min="100"
                    value={details.squareFeet}
                    onChange={(e) => setDetails((d) => ({ ...d, squareFeet: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <StepHeading>Import Documents</StepHeading>
            <StepSubtitle>
              Upload existing receipts, permits, and inspection reports. Duplicates are
              auto-detected — drag in everything. This step is optional.
            </StepSubtitle>
            <ConstructionPhotoUpload
              onUpload={(file, docType) => { handleDocUpload(file, docType).catch(() => toast.error("Upload failed")); }}
              quota={quota}
              onUpgradeQuota={() => navigate("/pricing")}
            />
          </div>
        );

      case 4:
        return (
          <div>
            <StepHeading>System Ages</StepHeading>
            <StepSubtitle>
              When were your major systems last replaced? We use this to build accurate
              maintenance predictions. This step is optional.
            </StepSubtitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {SYSTEM_LABELS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="form-label" htmlFor={`sys-${key}`}>{label}</label>
                  <input
                    id={`sys-${key}`}
                    className="form-input"
                    type="number"
                    placeholder={placeholder}
                    min="1900"
                    max={new Date().getFullYear()}
                    value={ages[key] ?? ""}
                    onChange={(e) => setAges((a) => ({ ...a, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const isNextDisabled =
    (step === 1 && !step1Valid) ||
    (step === 2 && (!step2Valid || registering));

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.white,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "3rem 1.25rem 4rem",
    }}>

      {/* Logo */}
      <div
        style={{ display: "flex", alignItems: "center", marginBottom: "2.5rem", cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.5px", color: COLORS.plum }}>
          Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
        </span>
      </div>

      {/* Wizard card */}
      <div style={{
        borderRadius: RADIUS.card,
        border: `1px solid ${COLORS.rule}`,
        background: COLORS.white,
        padding: "2.5rem",
        maxWidth: "36rem",
        width: "100%",
        boxShadow: SHADOWS.modal,
      }}>

        <StepIndicator step={step} />

        {/* Step content */}
        <div style={{ marginBottom: "2rem" }}>
          {renderStep()}
        </div>

        {/* Navigation row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
          )}

          {step < TOTAL_STEPS ? (
            <Button
              style={{ flex: 1 }}
              disabled={isNextDisabled}
              loading={registering}
              onClick={handleNext}
              iconRight={<ArrowRight size={14} />}
            >
              Next
            </Button>
          ) : (
            <Button
              style={{ flex: 1 }}
              onClick={handleFinish}
              icon={<CheckCircle size={14} />}
            >
              Finish
            </Button>
          )}
        </div>

        {/* Skip setup link */}
        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button
            onClick={handleSkip}
            style={{
              fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid,
              background: "none", border: "none", cursor: "pointer",
              textDecoration: "underline", textUnderlineOffset: "3px",
            }}
          >
            Skip setup — go to my dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
