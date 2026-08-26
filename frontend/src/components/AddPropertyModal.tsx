import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Shield, Camera, FileText, Clock, Check } from "lucide-react";
import { propertyService } from "@/services/property";
import { photoService, type PhotoQuota } from "@/services/photo";
import { authService } from "@/services/auth";
import { usePropertyStore } from "@/store/propertyStore";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";
import { isValidZip, isValidUsState } from "@/utils/validators";
import toast from "react-hot-toast";
import { V2_FONTS } from "@/theme";
import type { PropertyType } from "@/services/property";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  blue:     "#2B34FF",
  blueLight:"#E0E2FF",
  blueBdr:  "#B9BDF5",
  ink:      "#0B0D1A",
  muted:    "#6B7080",
  coral:    "#C23F1F",
  rule:     "#D9DBE4",
  bg:       "#F5F6FF",
  card:     "#FFFFFF",
  green:    "#166534",
  greenBg:  "#F0FDF4",
  amberBg:  "#FFFBEB",
  amber:    "#B45309",
  radius:   16,
};
const F = V2_FONTS;

// ── Constants ──────────────────────────────────────────────────────────────────
const PROPERTY_TYPES: PropertyType[] = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];
const PT_LABELS: Record<PropertyType, string> = {
  SingleFamily: "Single Family",
  Condo:        "Condo",
  Townhouse:    "Townhouse",
  MultiFamily:  "Multi-Family",
};

const BASELINE_SYSTEMS = [
  { key: "hvac",        label: "HVAC / Air Conditioning",   prompt: "Outdoor condenser + indoor air handler" },
  { key: "waterHeater", label: "Water Heater",              prompt: "Note the model number if visible" },
  { key: "electrical",  label: "Electrical Panel",          prompt: "Open the door and capture breaker labels" },
  { key: "shutoff",     label: "Main Water Shut-off Valve", prompt: "Locate and photograph the valve" },
  { key: "roof",        label: "Roof",                      prompt: "From ground level or attic hatch" },
  { key: "garageDoor",  label: "Garage Door Opener",        prompt: "Motor unit and model label" },
];

const SYSTEM_AGES = [
  { key: "hvac",        label: "HVAC / AC"        },
  { key: "roof",        label: "Roof"              },
  { key: "waterHeater", label: "Water Heater"      },
  { key: "electrical",  label: "Electrical Panel"  },
  { key: "plumbing",    label: "Plumbing"          },
];

const DOC_TYPES = [
  { value: "DeedRecord",  label: "Deed / Title"  },
  { value: "UtilityBill", label: "Utility Bill"  },
  { value: "TaxRecord",   label: "Tax Record"    },
];

// ── Types ──────────────────────────────────────────────────────────────────────
type StepKey = "address" | "details" | "saved" | "photos" | "documents" | "ages" | "verify";

interface AddressForm { address: string; city: string; state: string; zipCode: string; }
interface DetailsForm { propertyType: PropertyType; yearBuilt: string; squareFeet: string; }
interface VerifyForm  { legalName: string; docType: string; docFile: File | null; }

// ── Score helper ───────────────────────────────────────────────────────────────
function computeScore(
  step: StepKey,
  photosCount: number,
  docsUploaded: number,
  verifySubmitted: boolean,
): number {
  if (step === "address" || step === "details") return 0;
  let score = 20; // base for completing required steps
  score += photosCount; // +1 per photo (max +6)
  if (docsUploaded > 0) score += 8;
  if (verifySubmitted) score += 20;
  return score;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepBadge({ label }: { label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      font: `600 9.5px/1 ${F.mono}`, letterSpacing: ".14em",
      color: T.blue, background: T.blueLight,
      border: `1px solid ${T.blueBdr}`,
      borderRadius: 100, padding: "5px 10px",
      marginBottom: 14,
    }}>
      {label}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{
      display: "block",
      font: `600 10px/1 ${F.mono}`, letterSpacing: ".1em",
      color: T.muted, textTransform: "uppercase",
      marginBottom: 7,
    }}>
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        display: "block", width: "100%",
        font: `400 14px/1 ${F.body}`,
        color: T.ink, background: T.card,
        border: `1px solid ${T.rule}`,
        borderRadius: T.radius - 4,
        padding: "12px 14px",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        display: "block", width: "100%",
        font: `400 14px/1 ${F.body}`,
        color: T.ink, background: T.card,
        border: `1px solid ${T.rule}`,
        borderRadius: T.radius - 4,
        padding: "12px 14px",
        outline: "none",
        appearance: "none",
        ...props.style,
      }}
    />
  );
}

function PrimaryBtn({
  children, onClick, disabled, loading, fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "13px 24px",
        font: `600 14px/1 ${F.body}`,
        color: disabled ? T.muted : "#fff",
        background: disabled ? T.rule : T.blue,
        border: "none", borderRadius: T.radius,
        cursor: disabled ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
        width: fullWidth ? "100%" : undefined,
        transition: "background 0.15s",
      }}
    >
      {loading ? "Saving…" : children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "13px 20px",
        font: `500 14px/1 ${F.body}`,
        color: T.muted,
        background: "transparent",
        border: `1px solid ${T.rule}`,
        borderRadius: T.radius,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ── Left rail ──────────────────────────────────────────────────────────────────

interface RailProps {
  step: StepKey;
  address: string;
  score: number;
  photosCount: number;
  docsUploaded: number;
  agesFilledCount: number;
  verifySubmitted: boolean;
  onNav: (s: StepKey) => void;
  propertyName?: string;
}

function LeftRail({
  step, address, score, photosCount, docsUploaded, agesFilledCount, verifySubmitted, onNav, propertyName,
}: RailProps) {
  const requiredDone = step !== "address" && step !== "details";
  const maxScore = 54;

  const navItem = (
    label: string,
    meta: string,
    done: boolean,
    target: StepKey,
    active: boolean,
    available: boolean,
  ) => (
    <button
      key={label}
      onClick={() => available && onNav(target)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", background: "none", border: "none",
        padding: "9px 0", cursor: available ? "pointer" : "default",
        textAlign: "left",
      }}
    >
      {/* Bullet */}
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: done ? T.blue : active ? T.blue : "transparent",
        border: `2px solid ${done || active ? T.blue : T.rule}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && <Check size={10} color="#fff" strokeWidth={3} />}
        {active && !done && (
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          font: `${active ? 600 : 500} 12.5px/1.3 ${F.body}`,
          color: active ? T.ink : done ? T.ink : T.muted,
        }}>
          {label}
        </div>
        {meta && (
          <div style={{
            font: `400 10.5px/1 ${F.mono}`, color: done ? T.green : T.muted,
            marginTop: 2, letterSpacing: ".04em",
          }}>
            {meta}
          </div>
        )}
      </div>
    </button>
  );

  return (
    <div style={{
      width: 240, flexShrink: 0,
      borderRight: `1px solid ${T.rule}`,
      padding: "28px 24px",
      display: "flex", flexDirection: "column", gap: 0,
      background: T.card,
    }}>
      {/* Property name */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: T.muted, marginBottom: 6 }}>
          PROPERTY
        </div>
        <div style={{ font: `700 14px/1.3 ${F.body}`, color: T.ink, wordBreak: "break-word" }}>
          {propertyName || address || "New property"}
        </div>
      </div>

      {/* Score (only when past required steps) */}
      {requiredDone && (
        <div style={{
          background: T.blueLight, border: `1px solid ${T.blueBdr}`,
          borderRadius: T.radius, padding: "12px 14px", marginBottom: 22,
        }}>
          <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: T.blue, marginBottom: 6 }}>
            RECORD SCORE
          </div>
          <div style={{ font: `700 22px/1 ${F.display}`, color: T.blue }}>
            {score} <span style={{ font: `400 13px/1 ${F.body}`, color: T.blueBdr }}>/ {maxScore}</span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: T.blueBdr, borderRadius: 100, marginTop: 10 }}>
            <div style={{
              height: 4, width: `${Math.min(100, (score / maxScore) * 100)}%`,
              background: T.blue, borderRadius: 100, transition: "width .4s",
            }} />
          </div>
        </div>
      )}

      {/* Required section */}
      <div style={{ font: `600 9px/1 ${F.mono}`, letterSpacing: ".12em", color: T.muted, marginBottom: 8 }}>
        REQUIRED
      </div>
      <div style={{ marginBottom: 16 }}>
        {navItem("Address", step === "address" ? "In progress" : "Done", step !== "address", "address", step === "address", true)}
        {navItem(
          "Home details",
          step === "details" ? "In progress" : requiredDone ? "Done" : "",
          requiredDone,
          "details",
          step === "details",
          requiredDone || step === "details",
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${T.rule}`, marginBottom: 16 }} />

      {/* Optional section */}
      <div style={{ font: `600 9px/1 ${F.mono}`, letterSpacing: ".12em", color: T.muted, marginBottom: 8 }}>
        OPTIONAL
      </div>
      <div>
        {navItem(
          "Verify ownership",
          verifySubmitted ? "Submitted" : "+20 score",
          verifySubmitted,
          "verify",
          step === "verify",
          requiredDone,
        )}
        {navItem(
          "Baseline photos",
          `${photosCount} / 6`,
          photosCount === 6,
          "photos",
          step === "photos",
          requiredDone,
        )}
        {navItem(
          "Import documents",
          docsUploaded > 0 ? `${docsUploaded} uploaded` : "0 uploaded",
          docsUploaded > 0,
          "documents",
          step === "documents",
          requiredDone,
        )}
        {navItem(
          "System ages",
          agesFilledCount > 0 ? `${agesFilledCount} / 5 filled` : "",
          agesFilledCount === 5,
          "ages",
          step === "ages",
          requiredDone,
        )}
      </div>
    </div>
  );
}

// ── Task card (on "saved" step) ───────────────────────────────────────────────

function TaskCard({
  icon, chip, title, cta, onCta, done,
}: {
  icon: React.ReactNode;
  chip: string;
  title: string;
  cta: string;
  onCta: () => void;
  done?: boolean;
}) {
  return (
    <div style={{
      border: `1px solid ${done ? T.blueBdr : T.rule}`,
      borderRadius: T.radius,
      padding: "16px 18px",
      background: done ? T.blueLight : T.card,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: done ? T.blue : T.muted }}>{icon}</div>
        <div style={{
          font: `600 9px/1 ${F.mono}`, letterSpacing: ".1em",
          color: done ? T.green : T.blue,
          background: done ? T.greenBg : T.blueLight,
          border: `1px solid ${done ? "#BBF7D0" : T.blueBdr}`,
          borderRadius: 100, padding: "4px 8px",
        }}>
          {done ? "DONE" : chip}
        </div>
      </div>
      <div style={{ font: `600 13px/1.3 ${F.body}`, color: T.ink }}>{title}</div>
      {!done && (
        <button
          onClick={onCta}
          style={{
            font: `500 12px/1 ${F.body}`, color: T.blue,
            background: "none", border: "none",
            padding: 0, cursor: "pointer", textAlign: "left",
            textDecoration: "underline", textUnderlineOffset: 3,
          }}
        >
          {cta} →
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
}

export default function AddPropertyModal({ open, onClose }: Props) {
  const navigate               = useNavigate();
  const { isMobile }           = useBreakpoint();
  const { addProperty }        = usePropertyStore();

  const [step, setStep]        = useState<StepKey>("address");

  const [addr, setAddr]        = useState<AddressForm>({ address: "", city: "", state: "", zipCode: "" });
  const [details, setDetails]  = useState<DetailsForm>({ propertyType: "SingleFamily", yearBuilt: "", squareFeet: "" });

  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [registering,  setRegistering]  = useState(false);

  const [baselineCompleted, setBaselineCompleted] = useState<Set<string>>(new Set());
  const [uploadingBaseline, setUploadingBaseline] = useState<string | null>(null);
  const baselineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [quota,        setQuota]        = useState<PhotoQuota>({ used: 0, limit: 10, tier: "Free" });
  const [docsUploaded, setDocsUploaded] = useState(0);
  const [ages,         setAges]         = useState<Record<string, string>>({});
  const [hasSolar,     setHasSolar]     = useState(false);

  const [verify,           setVerify]           = useState<VerifyForm>({ legalName: "", docType: "DeedRecord", docFile: null });
  const [verifySubmitted,  setVerifySubmitted]  = useState(false);
  const [submittingVerify, setSubmittingVerify] = useState(false);

  // Derived
  const photosCount    = baselineCompleted.size;
  const agesFilledCount = Object.values(ages).filter(v => v.trim().length > 0).length;
  const score          = computeScore(step, photosCount, docsUploaded, verifySubmitted);
  const propAddress    = [addr.address, addr.city, addr.state].filter(Boolean).join(", ");

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep("address");
    setAddr({ address: "", city: "", state: "", zipCode: "" });
    setDetails({ propertyType: "SingleFamily", yearBuilt: "", squareFeet: "" });
    setRegisteredId(null);
    setRegistering(false);
    setBaselineCompleted(new Set());
    setUploadingBaseline(null);
    setDocsUploaded(0);
    setAges({});
    setHasSolar(false);
    setVerify({ legalName: "", docType: "DeedRecord", docFile: null });
    setVerifySubmitted(false);
    setSubmittingVerify(false);
  }, [open]);

  // Auto-skip baseline step in E2E
  useEffect(() => {
    if (step === "photos" && (window as any).__e2e_skipBaselinePhotos) {
      setStep("saved");
    }
  }, [step]);

  // ── Validation ────────────────────────────────────────────────────────────────
  const addrValid =
    addr.address.trim().length > 0 &&
    addr.city.trim().length > 0 &&
    isValidUsState(addr.state) &&
    isValidZip(addr.zipCode);

  const detailsValid =
    details.yearBuilt.length > 0 &&
    details.squareFeet.length > 0 &&
    Number(details.yearBuilt) >= 1900 &&
    Number(details.yearBuilt) <= new Date().getFullYear() &&
    Number(details.squareFeet) >= 100;

  const verifyFormValid = verify.legalName.trim().length > 0 && verify.docFile !== null;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSaveProperty = async () => {
    if (registeredId) { setStep("saved"); return; }
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
      setRegisteredId(String(property.id));
      photoService.getQuota().then(setQuota).catch(() => {});
      toast.success("Property saved!");
      setStep("saved");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const handleBaselineUpload = async (systemKey: string, file: File) => {
    if (!registeredId) return;
    setUploadingBaseline(systemKey);
    try {
      await photoService.upload(file, `baseline_${registeredId}`, registeredId, "PostConstruction", systemKey);
      setBaselineCompleted(prev => new Set(prev).add(systemKey));
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingBaseline(null);
    }
  };

  const handleDocUpload = async (file: File, docType: string) => {
    if (!registeredId) return;
    await photoService.upload(file, `docs_${registeredId}`, registeredId, "PostConstruction", docType);
    setDocsUploaded(n => n + 1);
    setQuota(q => ({ ...q, used: q.used + 1 }));
  };

  const handleSubmitVerify = async () => {
    if (!registeredId || !verify.docFile) return;
    setSubmittingVerify(true);
    try {
      const buffer     = await verify.docFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashHex    = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      await propertyService.submitVerification(registeredId, verify.docType, hashHex);
      setVerifySubmitted(true);
      toast.success("Verification submitted — pending review");
      setStep("saved");
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setSubmittingVerify(false);
    }
  };

  const handleFinish = () => {
    authService.completeOnboarding().catch(e => console.error("[AddPropertyModal] completeOnboarding:", e));
    onClose();
    if (registeredId) navigate(`/properties/${registeredId}`);
  };

  // ── Step content ──────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      // ── ADDRESS ──────────────────────────────────────────────────────────────
      case "address":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="STEP 1 OF 2 · REQUIRED" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Where is the home?
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 28px" }}>
                Start with the street address. We'll check for public permits automatically.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <FieldLabel htmlFor="wiz-address">Street address</FieldLabel>
                  <AddressAutocomplete
                    id="wiz-address"
                    value={addr.address}
                    placeholder="123 Main St"
                    style={{
                      display: "block", width: "100%",
                      font: `400 14px/1 ${F.body}`, color: T.ink,
                      background: T.card, border: `1px solid ${T.rule}`,
                      borderRadius: T.radius - 4, padding: "12px 14px", outline: "none",
                    }}
                    onChange={v => setAddr(f => ({ ...f, address: v }))}
                    onPlaceSelect={place => setAddr(f => ({
                      ...f,
                      address: place.address || f.address,
                      city:    place.city    || f.city,
                      state:   place.state   || f.state,
                      zipCode: place.zipCode || f.zipCode,
                    }))}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <div>
                    <FieldLabel htmlFor="wiz-city">City</FieldLabel>
                    <FieldInput
                      id="wiz-city" placeholder="Nashville"
                      value={addr.city} onChange={e => setAddr(f => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="wiz-state">State</FieldLabel>
                    <FieldInput
                      id="wiz-state" placeholder="TN" maxLength={2}
                      value={addr.state}
                      onChange={e => setAddr(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                      style={addr.state.length === 2 && !isValidUsState(addr.state) ? { borderColor: T.coral } : undefined}
                    />
                    {addr.state.length === 2 && !isValidUsState(addr.state) && (
                      <p style={{ font: `400 11px/1 ${F.mono}`, color: T.coral, marginTop: 5 }}>
                        Valid state abbreviation required
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="wiz-zip">ZIP code</FieldLabel>
                  <FieldInput
                    id="wiz-zip" placeholder="37201"
                    value={addr.zipCode} onChange={e => setAddr(f => ({ ...f, zipCode: e.target.value }))}
                    style={addr.zipCode && !isValidZip(addr.zipCode) ? { borderColor: T.coral } : undefined}
                  />
                  {addr.zipCode && !isValidZip(addr.zipCode) && (
                    <p style={{ font: `400 11px/1 ${F.mono}`, color: T.coral, marginTop: 5 }}>
                      Enter a 5-digit ZIP
                    </p>
                  )}
                </div>

                {addr.city && addr.state && (
                  <PermitCoverageIndicator city={addr.city} state={addr.state} />
                )}
              </div>
            </div>

            <div style={{ paddingTop: 28, borderTop: `1px solid ${T.rule}`, marginTop: 28 }}>
              <PrimaryBtn onClick={() => setStep("details")} disabled={!addrValid} fullWidth>
                Continue →
              </PrimaryBtn>
            </div>
          </div>
        );

      // ── DETAILS ───────────────────────────────────────────────────────────────
      case "details":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="STEP 2 OF 2 · REQUIRED" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Year built and size.
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 28px" }}>
                We use this to estimate system ages and flag era-specific risks.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <div>
                    <FieldLabel htmlFor="wiz-year">Year built</FieldLabel>
                    <FieldInput
                      id="wiz-year" type="number" placeholder="1985"
                      min={1900} max={new Date().getFullYear()}
                      value={details.yearBuilt}
                      onChange={e => setDetails(d => ({ ...d, yearBuilt: e.target.value }))}
                    />
                    {details.yearBuilt && (Number(details.yearBuilt) < 1900 || Number(details.yearBuilt) > new Date().getFullYear()) && (
                      <p style={{ font: `400 11px/1 ${F.mono}`, color: T.coral, marginTop: 5 }}>
                        Must be 1900–{new Date().getFullYear()}
                      </p>
                    )}
                  </div>
                  <div>
                    <FieldLabel htmlFor="wiz-sqft">Square feet</FieldLabel>
                    <FieldInput
                      id="wiz-sqft" type="number" placeholder="2,000"
                      min={100} value={details.squareFeet}
                      onChange={e => setDetails(d => ({ ...d, squareFeet: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Property type</FieldLabel>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                    {PROPERTY_TYPES.map(pt => (
                      <button
                        key={pt}
                        onClick={() => setDetails(d => ({ ...d, propertyType: pt }))}
                        style={{
                          padding: "11px 14px",
                          font: `${details.propertyType === pt ? 600 : 400} 13px/1 ${F.body}`,
                          color: details.propertyType === pt ? T.blue : T.muted,
                          background: details.propertyType === pt ? T.blueLight : T.card,
                          border: `${details.propertyType === pt ? 2 : 1}px solid ${details.propertyType === pt ? T.blue : T.rule}`,
                          borderRadius: T.radius - 4,
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {PT_LABELS[pt]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ paddingTop: 28, borderTop: `1px solid ${T.rule}`, marginTop: 28, display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setStep("address")}>← Back</GhostBtn>
              <div style={{ flex: 1 }}>
                <PrimaryBtn onClick={handleSaveProperty} disabled={!detailsValid} loading={registering} fullWidth>
                  Save property
                </PrimaryBtn>
              </div>
            </div>
          </div>
        );

      // ── SAVED ─────────────────────────────────────────────────────────────────
      case "saved":
        return (
          <div>
            <StepBadge label="SAVED · FREE TIER" />
            <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              Your property is saved.
            </h2>
            <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 24px" }}>
              The required record is complete. Add optional details to unlock predictions and boost your score.
            </p>

            {/* Score */}
            <div style={{
              background: T.blueLight, border: `1px solid ${T.blueBdr}`,
              borderRadius: T.radius, padding: "16px 18px", marginBottom: 24,
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div>
                <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: T.blue, marginBottom: 4 }}>
                  RECORD SCORE
                </div>
                <div style={{ font: `700 28px/1 ${F.display}`, color: T.blue }}>
                  {score}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: `400 12px/1.5 ${F.body}`, color: T.muted, marginBottom: 6 }}>
                  Complete optional steps to reach 54
                </div>
                <div style={{ height: 6, background: T.blueBdr, borderRadius: 100 }}>
                  <div style={{
                    height: 6, width: `${Math.min(100, (score / 54) * 100)}%`,
                    background: T.blue, borderRadius: 100, transition: "width .4s",
                  }} />
                </div>
              </div>
            </div>

            {/* Task cards */}
            <div data-testid="task-cards" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 28 }}>
              <TaskCard
                icon={<Shield size={20} />}
                chip="+20 SCORE"
                title="Verify ownership"
                cta="Start verification"
                onCta={() => setStep("verify")}
                done={verifySubmitted}
              />
              <TaskCard
                icon={<Camera size={20} />}
                chip="6 SYSTEMS"
                title="Baseline photos"
                cta="Open camera guide"
                onCta={() => setStep("photos")}
                done={photosCount === 6}
              />
              <TaskCard
                icon={<FileText size={20} />}
                chip="RECEIPTS + PERMITS"
                title="Import documents"
                cta="Import files"
                onCta={() => setStep("documents")}
                done={docsUploaded > 0}
              />
              <TaskCard
                icon={<Clock size={20} />}
                chip="5 SYSTEMS"
                title="System ages"
                cta="Fill in ages"
                onCta={() => setStep("ages")}
                done={agesFilledCount === 5}
              />
            </div>

            <PrimaryBtn onClick={handleFinish} fullWidth>
              View property record →
            </PrimaryBtn>
          </div>
        );

      // ── PHOTOS ────────────────────────────────────────────────────────────────
      case "photos":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="OPTIONAL · BASELINE RECORD" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Capture baseline photos.
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 20px" }}>
                Photograph your major systems to create a permanent record. Each photo adds +1 to your score.
              </p>

              {/* Counter */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: T.blueLight, border: `1px solid ${T.blueBdr}`,
                borderRadius: T.radius, marginBottom: 16,
              }}>
                <span style={{ font: `500 11px/1 ${F.mono}`, letterSpacing: ".1em", color: T.blue }}>
                  PHOTOS CAPTURED
                </span>
                <span style={{ font: `700 16px/1 ${F.display}`, color: T.blue }}>
                  {photosCount} / {BASELINE_SYSTEMS.length}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {BASELINE_SYSTEMS.map(({ key, label, prompt }) => {
                  const done      = baselineCompleted.has(key);
                  const uploading = uploadingBaseline === key;
                  return (
                    <div key={key} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                      border: `1px solid ${done ? T.blueBdr : T.rule}`,
                      borderRadius: T.radius - 4,
                      background: done ? T.blueLight : T.card,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: done ? T.blue : "transparent",
                        border: `2px solid ${done ? T.blue : T.rule}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {done && <Check size={11} color="#fff" strokeWidth={3} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ font: `600 13px/1.3 ${F.body}`, color: T.ink }}>{label}</div>
                        <div style={{ font: `400 11.5px/1.4 ${F.body}`, color: T.muted, marginTop: 2 }}>
                          {done ? "Captured" : prompt}
                        </div>
                      </div>
                      {!done && (
                        <>
                          <input
                            type="file" accept="image/*" style={{ display: "none" }}
                            ref={el => { baselineInputRefs.current[key] = el; }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleBaselineUpload(key, file).catch(() => {});
                              e.target.value = "";
                            }}
                          />
                          <button
                            disabled={uploading}
                            onClick={() => baselineInputRefs.current[key]?.click()}
                            style={{
                              flexShrink: 0, padding: "7px 14px",
                              font: `500 12px/1 ${F.body}`, color: T.blue,
                              background: T.blueLight, border: `1px solid ${T.blueBdr}`,
                              borderRadius: 100, cursor: uploading ? "wait" : "pointer",
                              opacity: uploading ? 0.6 : 1,
                            }}
                          >
                            {uploading ? "Uploading…" : "Add photo"}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ paddingTop: 24, borderTop: `1px solid ${T.rule}`, marginTop: 24, display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setStep("saved")}>Skip</GhostBtn>
              <div style={{ flex: 1 }}>
                <PrimaryBtn onClick={() => setStep("saved")} fullWidth>Save & continue</PrimaryBtn>
              </div>
            </div>
          </div>
        );

      // ── DOCUMENTS ─────────────────────────────────────────────────────────────
      case "documents":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="OPTIONAL · DOCUMENTED VALUE" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Import documents.
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 24px" }}>
                Upload receipts, permits, and inspection reports. Duplicates are auto-detected. Adds +8 to your score.
              </p>
              {docsUploaded > 0 && (
                <div style={{
                  font: `500 12px/1 ${F.mono}`, letterSpacing: ".08em",
                  color: T.green, background: T.greenBg,
                  border: "1px solid #BBF7D0", borderRadius: T.radius,
                  padding: "10px 14px", marginBottom: 16,
                }}>
                  {docsUploaded} document{docsUploaded !== 1 ? "s" : ""} uploaded
                </div>
              )}
              <ConstructionPhotoUpload
                onUpload={(file, docType) => { handleDocUpload(file, docType).catch(() => toast.error("Upload failed")); }}
                quota={quota}
                onUpgradeQuota={() => { onClose(); navigate("/pricing"); }}
              />
            </div>

            <div style={{ paddingTop: 24, borderTop: `1px solid ${T.rule}`, marginTop: 24, display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setStep("saved")}>Skip</GhostBtn>
              <div style={{ flex: 1 }}>
                <PrimaryBtn onClick={() => setStep("saved")} fullWidth>Save & continue</PrimaryBtn>
              </div>
            </div>
          </div>
        );

      // ── AGES ──────────────────────────────────────────────────────────────────
      case "ages":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="OPTIONAL · PREDICTIONS" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                How old are your systems?
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 24px" }}>
                We've pre-filled the year the home was built. Update any you know for better predictions.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {SYSTEM_AGES.map(({ key, label }) => (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, alignItems: "center" }}>
                    <FieldLabel htmlFor={`sys-${key}`}>{label}</FieldLabel>
                    <FieldInput
                      id={`sys-${key}`} type="number"
                      min={1900} max={new Date().getFullYear()}
                      placeholder={details.yearBuilt || "Year"}
                      value={ages[key] ?? ""}
                      onChange={e => setAges(a => ({ ...a, [key]: e.target.value }))}
                    />
                  </div>
                ))}

                <div style={{ borderTop: `1px solid ${T.rule}`, paddingTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    id="sys-solar" type="checkbox"
                    checked={hasSolar} onChange={e => setHasSolar(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: T.blue }}
                  />
                  <label htmlFor="sys-solar" style={{
                    font: `500 13px/1 ${F.body}`, color: T.ink, cursor: "pointer",
                  }}>
                    Solar panels
                  </label>
                  {hasSolar && (
                    <FieldInput
                      type="number" min={1990} max={new Date().getFullYear()}
                      placeholder="Year installed"
                      value={ages["solar"] ?? ""}
                      onChange={e => setAges(a => ({ ...a, solar: e.target.value }))}
                      style={{ marginLeft: "auto", width: 140 }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div style={{ paddingTop: 24, borderTop: `1px solid ${T.rule}`, marginTop: 24, display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setStep("saved")}>Skip</GhostBtn>
              <div style={{ flex: 1 }}>
                <PrimaryBtn onClick={() => setStep("saved")} fullWidth>Save & continue</PrimaryBtn>
              </div>
            </div>
          </div>
        );

      // ── VERIFY ────────────────────────────────────────────────────────────────
      case "verify":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1 }}>
              <StepBadge label="OPTIONAL · +20 SCORE" />
              <h2 style={{ font: `700 26px/1.15 ${F.display}`, color: T.ink, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Verify ownership.
              </h2>
              <p style={{ font: `400 13.5px/1.6 ${F.body}`, color: T.muted, margin: "0 0 24px" }}>
                Submit your legal name and an ownership document. Our team reviews within 1–2 business days and adds +20 to your record score.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <FieldLabel htmlFor="wiz-legal-name">Legal name</FieldLabel>
                  <FieldInput
                    id="wiz-legal-name" placeholder="Jane Smith"
                    value={verify.legalName}
                    onChange={e => setVerify(v => ({ ...v, legalName: e.target.value }))}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="wiz-doc-type">Document type</FieldLabel>
                  <FieldSelect
                    id="wiz-doc-type"
                    value={verify.docType}
                    onChange={e => setVerify(v => ({ ...v, docType: e.target.value }))}
                  >
                    {DOC_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FieldLabel htmlFor="wiz-verify-doc">Ownership document</FieldLabel>
                  <input
                    id="wiz-verify-doc" type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setVerify(v => ({ ...v, docFile: e.target.files?.[0] ?? null }))}
                    style={{
                      display: "block",
                      font: `400 13px/1 ${F.body}`, color: T.muted,
                      marginTop: 4,
                    }}
                  />
                  {verify.docFile && (
                    <p style={{ font: `400 11px/1 ${F.mono}`, color: T.green, marginTop: 6 }}>
                      {verify.docFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div style={{ paddingTop: 24, borderTop: `1px solid ${T.rule}`, marginTop: 24, display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setStep("saved")}>← Back</GhostBtn>
              <div style={{ flex: 1 }}>
                <PrimaryBtn
                  onClick={handleSubmitVerify}
                  disabled={!verifyFormValid}
                  loading={submittingVerify}
                  fullWidth
                >
                  Submit for review
                </PrimaryBtn>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(11,13,26,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isMobile ? 0 : "1.5rem",
        overflowY: "auto",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="property-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add property wizard"
        style={{
          display: "flex",
          width: "100%",
          maxWidth: isMobile ? undefined : 920,
          height: isMobile ? "100dvh" : undefined,
          maxHeight: isMobile ? undefined : "90vh",
          background: T.card,
          borderRadius: isMobile ? 0 : T.radius + 4,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(11,13,26,0.22)",
          position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 10,
            background: T.bg, border: `1px solid ${T.rule}`,
            borderRadius: "50%", width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: T.muted,
          }}
        >
          <X size={15} />
        </button>

        {/* Left rail (desktop only) */}
        {!isMobile && (
          <LeftRail
            step={step}
            address={propAddress}
            score={score}
            photosCount={photosCount}
            docsUploaded={docsUploaded}
            agesFilledCount={agesFilledCount}
            verifySubmitted={verifySubmitted}
            onNav={setStep}
          />
        )}

        {/* Right content */}
        <div style={{
          flex: 1, minWidth: 0, overflowY: "auto",
          padding: isMobile ? "24px 20px 32px" : "32px 36px",
          background: step === "saved" ? T.bg : T.card,
          display: "flex", flexDirection: "column",
        }}>
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
