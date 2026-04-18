import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ShieldCheck, Wrench, ArrowRight, ArrowLeft, CheckCircle, FolderOpen, X } from "lucide-react";
import { propertyService, Property, PropertyType } from "@/services/property";
import { photoService, type PhotoQuota } from "@/services/photo";
import { systemAgesService } from "@/services/systemAges";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { lookupPropertyDetails } from "@/services/propertyLookup";
import { triggerPermitImport, createJobsFromPermits, type ImportedPermit, type PermitImportResult } from "@/services/permitImport";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";
import PermitImportReviewPanel from "@/components/PermitImportReviewPanel";
import PropertyVerifyModal from "@/components/PropertyVerifyModal";
import SystemAgesModal from "@/components/SystemAgesModal";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";
import { Button } from "@/components/Button";
import { isValidZip, isValidUsState } from "@/utils/validators";
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
  mono:     FONTS.sans,
};

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
  done: boolean;
}

function buildSteps(properties: Property[], firstPropertyId: bigint | undefined, hasDocs: boolean): Step[] {
  const hasProperty   = properties.length > 0;
  const verified      = properties.some((p) => p.verificationLevel !== "Unverified");
  const hasSystemAges = hasProperty && firstPropertyId != null && systemAgesService.hasAny(String(firstPropertyId));
  const propPath      = hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}` : "/properties/new";
  return [
    { id: "add-property",     icon: <Home size={20} />,        title: "Add your first property",      body: "Register your home on-chain and start building its verified maintenance history.",                                                                                            cta: hasProperty ? "View my property" : "Add property", href: propPath,                                     done: hasProperty  },
    { id: "verify-ownership", icon: <ShieldCheck size={20} />, title: "Verify ownership",              body: "Upload a utility bill, deed, or tax record to earn a verification badge that buyers trust.",                                                                                cta: "Verify now",                                      href: `${propPath}/verify`,                            done: verified     },
    { id: "import-docs",      icon: <FolderOpen size={20} />,  title: "Import historical documents",   body: "Bulk-upload existing receipts, permits, inspection reports, and warranties. Duplicates are auto-detected — drag in everything and HomeGentic sorts it out.",                cta: "Import documents",                                href: `${propPath}?tab=documents`,                     done: hasDocs      },
    { id: "system-ages",      icon: <Wrench size={20} />,      title: "Set your system ages",          body: "Tell us when your HVAC, roof, water heater, and other systems were last replaced — so predictions reflect reality, not just your home's build year.",                     cta: "Set system ages",                                 href: hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}/systems` : "/dashboard", done: hasSystemAges },
  ];
}

function StepCard({ step, index, isNext, onClick }: { step: Step; index: number; isNext: boolean; onClick: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "1rem",
      padding: "1.25rem 1.5rem",
      borderRadius: RADIUS.sm,
      border: `1.5px solid ${step.done ? COLORS.sageMid : isNext ? COLORS.sage : COLORS.rule}`,
      background: step.done ? COLORS.sageLight : COLORS.white,
    }}>
      {/* Icon */}
      <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: step.done ? COLORS.sageLight : isNext ? COLORS.sage : COLORS.rule, color: step.done ? COLORS.sage : isNext ? COLORS.white : COLORS.plumMid, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {step.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
            Step {index + 1}
          </span>
          {step.done && (
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, padding: "0.1rem 0.5rem", borderRadius: 100 }}>
              Done
            </span>
          )}
        </div>
        <h3 style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "0.938rem", color: step.done ? COLORS.plumMid : COLORS.plum, marginBottom: "0.25rem", textDecoration: step.done ? "line-through" : "none" }}>
          {step.title}
        </h3>
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.85rem", color: COLORS.plumMid, lineHeight: 1.6, fontWeight: 300 }}>{step.body}</p>
      </div>

      {!step.done && (
        <button onClick={onClick} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.25rem", borderRadius: 100, border: `1.5px solid ${isNext ? COLORS.sage : COLORS.rule}`, background: isNext ? COLORS.sage : COLORS.white, color: isNext ? COLORS.white : COLORS.plumMid, fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {step.cta} {isNext && <ArrowRight size={12} />}
        </button>
      )}

      {step.done && <CheckCircle size={20} color={COLORS.sage} style={{ flexShrink: 0 }} />}
    </div>
  );
}

const PROPERTY_TYPES: PropertyType[] = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];

interface RegForm {
  address: string; city: string; state: string; zipCode: string;
  propertyType: PropertyType; yearBuilt: string; squareFeet: string;
}

export default function OnboardingPage() {
  const navigate          = useNavigate();
  const { profile }       = useAuthStore();
  const { addProperty, setProperties: setStoreProperties } = usePropertyStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [hasDocs, setHasDocs]       = useState(false);
  const [loaded, setLoaded]         = useState(false);

  // Step modals
  const [verifyOpen, setVerifyOpen]               = useState(false);
  const [docsOpen, setDocsOpen]                   = useState(false);
  const [sysAgesOpen, setSysAgesOpen]             = useState(false);
  const [quota, setQuota]                         = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });

  // Inline property registration modal
  const [regOpen, setRegOpen]                     = useState(false);
  const [regSubStep, setRegSubStep]               = useState(1);
  const [regLoading, setRegLoading]               = useState(false);
  const [lookingUp, setLookingUp]                 = useState(false);
  const [permitResult, setPermitResult]           = useState<PermitImportResult | null>(null);
  const [registeredPropertyId, setRegisteredPropertyId] = useState<string | null>(null);
  const [regForm, setRegForm] = useState<RegForm>({
    address: "", city: "", state: "", zipCode: "",
    propertyType: "SingleFamily", yearBuilt: "", squareFeet: "",
  });
  const updateReg = (key: keyof RegForm, value: string) =>
    setRegForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    Promise.all([
      propertyService.getMyProperties().then(setProperties).catch(() => []),
    ]).then(([props]) => {
      const firstId = (props as Property[])[0]?.id;
      if (firstId) {
        photoService.getByJob(`docs_${String(firstId)}`).then((docs) => setHasDocs(docs.length > 0)).catch(() => {});
      }
    }).finally(() => setLoaded(true));
  }, []);

  const firstPropertyId = properties[0]?.id;
  const steps     = buildSteps(properties, firstPropertyId, hasDocs);
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep  = steps.find((s) => !s.done);
  const allDone   = loaded && doneCount === steps.length && steps.length > 0;

  useEffect(() => {
    if (!allDone || !firstPropertyId) return;
    const t = setTimeout(() => navigate(`/properties/${firstPropertyId}`), 1500);
    return () => clearTimeout(t);
  }, [allDone, firstPropertyId]);

  const refreshProperties = () =>
    propertyService.getMyProperties()
      .then((props) => { setProperties(props); setStoreProperties(props); })
      .catch(() => {});

  const handleStep = (step: Step) => {
    if (step.done) return;
    if (step.id === "add-property") {
      setRegForm({ address: "", city: "", state: "", zipCode: "", propertyType: "SingleFamily", yearBuilt: "", squareFeet: "" });
      setRegSubStep(1);
      setRegOpen(true);
      return;
    }
    if (step.id === "verify-ownership") { setVerifyOpen(true); return; }
    if (step.id === "import-docs") {
      photoService.getQuota().then(setQuota).catch(() => {});
      setDocsOpen(true);
      return;
    }
    if (step.id === "system-ages") { setSysAgesOpen(true); return; }
    navigate(step.href);
  };

  const handleDocUpload = async (file: File, docType: string) => {
    if (!firstPropertyId) return;
    const propId = String(firstPropertyId);
    await photoService.upload(file, `docs_${propId}`, propId, "PostConstruction", docType);
    setHasDocs(true);
    setQuota((q) => ({ ...q, used: q.used + 1 }));
  };

  const goToRegStep2 = async () => {
    setRegSubStep(2);
    setLookingUp(true);
    try {
      const result = await lookupPropertyDetails(regForm.address, regForm.city, regForm.state, regForm.zipCode);
      if (result) {
        setRegForm((f) => ({
          ...f,
          yearBuilt:  result.yearBuilt    ? String(result.yearBuilt)    : f.yearBuilt,
          squareFeet: result.squareFootage ? String(result.squareFootage) : f.squareFeet,
        }));
      }
    } finally {
      setLookingUp(false);
    }
  };

  const handleRegSubmit = async () => {
    setRegLoading(true);
    try {
      const property = await propertyService.registerProperty({
        address: regForm.address, city: regForm.city, state: regForm.state,
        zipCode: regForm.zipCode, propertyType: regForm.propertyType,
        yearBuilt: parseInt(regForm.yearBuilt), squareFeet: parseInt(regForm.squareFeet),
        tier: "Free",
      });
      addProperty(property);
      setProperties((prev) => [...prev, property]);
      toast.success("Property registered!");

      const result = await triggerPermitImport(property).catch(() => null);
      if (result?.citySupported && result.permits.length > 0) {
        setRegisteredPropertyId(String(property.id));
        setPermitResult(result);
        setRegSubStep(4);
      } else {
        setRegOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  const handlePermitConfirm = async (confirmed: ImportedPermit[]) => {
    if (registeredPropertyId && confirmed.length > 0) {
      await createJobsFromPermits(registeredPropertyId, confirmed).catch(() => {});
      toast.success(`${confirmed.length} permit record${confirmed.length !== 1 ? "s" : ""} added to your history.`);
    }
    setRegOpen(false);
    setPermitResult(null);
  };

  const yearBad = regForm.yearBuilt && (Number(regForm.yearBuilt) < 1900 || Number(regForm.yearBuilt) > new Date().getFullYear());

  return (
    <div style={{ minHeight: "100vh", background: UI.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "3rem 1.25rem 4rem" }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "3rem", cursor: "pointer" }} onClick={() => navigate("/")}>
        <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.5px", color: COLORS.plum }}>Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span></span>
      </div>

      {/* Card */}
      <div style={{ borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, background: COLORS.white, padding: "2.5rem", maxWidth: "38rem", width: "100%", boxShadow: SHADOWS.modal }}>

        {/* Welcome header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: COLORS.butter, color: COLORS.plum, padding: "5px 16px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)` }}>
            Welcome
          </div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: UI.ink, marginBottom: "0.5rem" }}>
            Welcome{profile?.email ? `, ${profile.email.split("@")[0]}` : ""}!
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, maxWidth: "26rem", margin: "0 auto" }}>
            You're in. Let's get your first property on-chain in the next few minutes.
          </p>

          {/* Progress */}
          {(() => {
            const pct      = Math.round((doneCount / steps.length) * 100);
            const barColor = allDone ? UI.sage : UI.rust;
            return (
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>
                    Setup progress
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
                    <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: allDone ? UI.sage : UI.rust }}>
                      {pct}%
                    </span>
                    <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight }}>
                      {doneCount}/{steps.length} steps
                    </span>
                  </div>
                </div>
                <div style={{ height: "6px", background: COLORS.rule, borderRadius: 100 }}>
                  <div style={{ height: "6px", width: `${pct}%`, background: barColor, borderRadius: 100, transition: "width 0.5s ease" }} />
                </div>
                {allDone && (
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.sage, marginTop: "0.5rem", textAlign: "center" }}>
                    ✓ Setup complete — your HomeGentic profile is ready.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Steps */}
        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {steps.map((step, i) => (
              <StepCard key={step.id} step={step} index={i} isNext={step === nextStep} onClick={() => handleStep(step)} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${UI.rule}`, display: "flex", justifyContent: "center" }}>
          <button onClick={() => navigate("/dashboard")} style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            Skip for now — go to my dashboard
          </button>
        </div>
      </div>

      {/* Verify Ownership Modal (step 2) */}
      {firstPropertyId != null && (
        <PropertyVerifyModal
          open={verifyOpen}
          onClose={() => setVerifyOpen(false)}
          propertyId={String(firstPropertyId)}
          onSuccess={() => { setVerifyOpen(false); refreshProperties(); }}
        />
      )}

      {/* System Ages Modal (step 4) */}
      {firstPropertyId != null && (
        <SystemAgesModal
          open={sysAgesOpen}
          onClose={() => setSysAgesOpen(false)}
          propertyId={String(firstPropertyId)}
          yearBuilt={Number(properties[0]?.yearBuilt ?? new Date().getFullYear())}
          onSuccess={() => setSysAgesOpen(false)}
        />
      )}

      {/* Document Import Modal (step 3) */}
      {docsOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(46,37,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDocsOpen(false); }}
        >
          <div style={{ background: COLORS.white, borderRadius: RADIUS.card, width: "100%", maxWidth: "34rem", maxHeight: "90vh", overflowY: "auto", padding: "2rem", boxShadow: SHADOWS.modal }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.sage, marginBottom: "0.25rem" }}>Step 3 of 4</div>
                <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: COLORS.plum, margin: 0 }}>Import historical documents</h2>
              </div>
              <button onClick={() => setDocsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: 0, display: "flex", marginTop: "0.25rem" }} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plumMid, lineHeight: 1.6, marginBottom: "1.25rem" }}>
              Drag in receipts, permits, inspection reports, and warranties. Duplicates are auto-detected.
            </p>
            <ConstructionPhotoUpload
              onUpload={(file, docType) => { handleDocUpload(file, docType).catch(() => toast.error("Upload failed")); }}
              quota={quota}
              onUpgradeQuota={() => navigate("/pricing")}
            />
            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={() => setDocsOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {/* Property Registration Modal */}
      {regOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(46,37,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}
          onClick={(e) => { if (e.target === e.currentTarget) setRegOpen(false); }}
        >
          <div style={{ background: COLORS.white, borderRadius: RADIUS.card, width: "100%", maxWidth: "32rem", maxHeight: "90vh", overflowY: "auto", padding: "2rem", boxShadow: SHADOWS.modal }}>

            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.sage, marginBottom: "0.25rem" }}>
                  Step 1 of 4
                </div>
                <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: COLORS.plum, margin: 0 }}>
                  Add your property
                </h2>
              </div>
              <button onClick={() => setRegOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: 0, display: "flex", marginTop: "0.25rem" }} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Sub-step progress bars */}
            {regSubStep < 4 && (
              <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem" }}>
                {[1, 2, 3].map((n) => (
                  <div key={n} style={{ flex: 1, height: "3px", background: regSubStep >= n ? COLORS.sage : COLORS.rule, borderRadius: 100, transition: "background 0.2s" }} />
                ))}
              </div>
            )}

            {/* Sub-step 1: Address */}
            {regSubStep === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="form-label" htmlFor="reg-address">Street Address *</label>
                  <AddressAutocomplete
                    id="reg-address"
                    className="form-input"
                    value={regForm.address}
                    onChange={(v) => updateReg("address", v)}
                    onPlaceSelect={(place) => {
                      setRegForm((f) => ({
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
                    <label className="form-label" htmlFor="reg-city">City *</label>
                    <input id="reg-city" className="form-input" placeholder="Austin" value={regForm.city} onChange={(e) => updateReg("city", e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="reg-state">State *</label>
                    <input
                      id="reg-state" className="form-input" placeholder="TX" maxLength={2}
                      value={regForm.state}
                      onChange={(e) => updateReg("state", e.target.value.toUpperCase())}
                      style={regForm.state.length === 2 && !isValidUsState(regForm.state) ? { borderColor: COLORS.rust } : undefined}
                    />
                    {regForm.state.length === 2 && !isValidUsState(regForm.state) && (
                      <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Valid US state abbreviation required</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="form-label" htmlFor="reg-zip">ZIP Code *</label>
                  <input
                    id="reg-zip" className="form-input" placeholder="78701"
                    value={regForm.zipCode}
                    onChange={(e) => updateReg("zipCode", e.target.value)}
                    style={regForm.zipCode && !isValidZip(regForm.zipCode) ? { borderColor: COLORS.rust } : undefined}
                  />
                  {regForm.zipCode && !isValidZip(regForm.zipCode) && (
                    <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Enter a 5-digit ZIP code (e.g. 78701)</p>
                  )}
                </div>
                {regForm.city && regForm.state && (
                  <PermitCoverageIndicator city={regForm.city} state={regForm.state} />
                )}
                <Button
                  style={{ width: "100%", marginTop: "0.5rem" }}
                  disabled={!regForm.address || !regForm.city || !isValidUsState(regForm.state) || !isValidZip(regForm.zipCode)}
                  onClick={goToRegStep2}
                  iconRight={<ArrowRight size={14} />}
                >
                  Next: Property Details
                </Button>
              </div>
            )}

            {/* Sub-step 2: Property details */}
            {regSubStep === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="form-label">Property Type *</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: COLORS.rule }}>
                    {PROPERTY_TYPES.map((t) => (
                      <div key={t} onClick={() => updateReg("propertyType", t)} style={{
                        padding: "0.75rem", cursor: "pointer",
                        background: regForm.propertyType === t ? COLORS.blush : COLORS.white,
                        fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
                        textTransform: "uppercase", textAlign: "center",
                        color: regForm.propertyType === t ? UI.rust : UI.inkLight,
                        border: regForm.propertyType === t ? `1px solid ${UI.rust}` : "none",
                      }}>
                        {t === "SingleFamily" ? "Single Family" : t}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="form-label" htmlFor="reg-year">
                      Year Built *
                      {lookingUp && <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, marginLeft: "0.5rem" }}>fetching…</span>}
                    </label>
                    <input
                      id="reg-year" className="form-input" type="number" placeholder="1985"
                      min="1900" max={new Date().getFullYear()}
                      value={regForm.yearBuilt} onChange={(e) => updateReg("yearBuilt", e.target.value)}
                      disabled={lookingUp}
                    />
                    {yearBad && (
                      <p style={{ color: COLORS.rust, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Year must be between 1900 and {new Date().getFullYear()}</p>
                    )}
                  </div>
                  <div>
                    <label className="form-label" htmlFor="reg-sqft">
                      Square Feet *
                      {lookingUp && <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, marginLeft: "0.5rem" }}>fetching…</span>}
                    </label>
                    <input
                      id="reg-sqft" className="form-input" type="number" placeholder="2000" min="100"
                      value={regForm.squareFeet} onChange={(e) => updateReg("squareFeet", e.target.value)}
                      disabled={lookingUp}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" onClick={() => setRegSubStep(1)} icon={<ArrowLeft size={14} />}>Back</Button>
                  <Button
                    style={{ flex: 1 }}
                    disabled={!regForm.yearBuilt || !regForm.squareFeet || !!yearBad}
                    onClick={() => setRegSubStep(3)}
                    iconRight={<ArrowRight size={14} />}
                  >
                    Review
                  </Button>
                </div>
              </div>
            )}

            {/* Sub-step 3: Review & confirm */}
            {regSubStep === 3 && (
              <div>
                <div style={{ border: `1px solid ${COLORS.rule}` }}>
                  {[
                    { label: "Address",    value: regForm.address },
                    { label: "City",       value: regForm.city },
                    { label: "State",      value: regForm.state },
                    { label: "ZIP",        value: regForm.zipCode },
                    { label: "Type",       value: regForm.propertyType === "SingleFamily" ? "Single Family" : regForm.propertyType },
                    { label: "Year Built", value: regForm.yearBuilt },
                    { label: "Sq Ft",      value: regForm.squareFeet },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.75rem 1.25rem",
                      borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.rule}` : "none",
                    }}>
                      <span style={{ fontFamily: FONTS.sans, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>{row.label}</span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                  <Button variant="outline" onClick={() => setRegSubStep(2)} icon={<ArrowLeft size={14} />}>Back</Button>
                  <Button loading={regLoading} onClick={handleRegSubmit} icon={<CheckCircle size={14} />} style={{ flex: 1 }}>Register Property</Button>
                </div>
              </div>
            )}

            {/* Sub-step 4: Permit import review */}
            {regSubStep === 4 && permitResult && (
              <PermitImportReviewPanel
                permits={permitResult.permits}
                onConfirm={handlePermitConfirm}
                onDismissAll={() => { setRegOpen(false); setPermitResult(null); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
