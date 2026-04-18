import React, { useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/Button";
import { systemAgesService, TRACKED_SYSTEMS, type SystemName, type SystemAges } from "@/services/systemAges";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

const SYSTEM_DESCRIPTIONS: Record<SystemName, string> = {
  "HVAC":         "Furnace, AC, heat pump",
  "Roofing":      "Shingles, membrane, or metal roof",
  "Water Heater": "Tank or tankless water heater",
  "Windows":      "Double/triple-pane windows",
  "Electrical":   "Panel, wiring, breakers",
  "Plumbing":     "Pipes, supply & drain lines",
  "Flooring":     "Hardwood, tile, carpet",
  "Insulation":   "Attic, wall, crawlspace insulation",
  "Solar Panels": "Panels + inverter system",
};

const CURRENT_YEAR = new Date().getFullYear();

export interface SystemAgesModalProps {
  open:        boolean;
  onClose:     () => void;
  propertyId:  string;
  yearBuilt:   number;
  /** Called after a successful save so the parent can refresh maintenance data. */
  onSuccess?:  () => void;
}

export default function SystemAgesModal({ open, onClose, propertyId, yearBuilt, onSuccess }: SystemAgesModalProps) {
  const stored = React.useMemo(
    () => (propertyId ? systemAgesService.get(propertyId) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertyId, open]   // re-read when modal opens
  );

  const [ages, setAges]       = useState<Record<SystemName, string>>(() => buildAges(stored, yearBuilt));
  const [touched, setTouched] = useState<Set<SystemName>>(() => buildTouched(stored));
  const [hasSolar, setHasSolar] = useState<boolean>(() => !!stored["Solar Panels"]);

  // Re-sync when propertyId / open changes
  React.useEffect(() => {
    if (open) {
      const s = propertyId ? systemAgesService.get(propertyId) : {};
      setAges(buildAges(s, yearBuilt));
      setTouched(buildTouched(s));
      setHasSolar(!!s["Solar Panels"]);
    }
  }, [propertyId, yearBuilt, open]);

  if (!open) return null;

  const handleChange = (sys: SystemName, value: string) => {
    setAges((prev) => ({ ...prev, [sys]: value }));
    setTouched((prev) => new Set(prev).add(sys));
  };

  const handleReset = (sys: SystemName) => {
    setAges((prev) => ({ ...prev, [sys]: String(yearBuilt) }));
    setTouched((prev) => { const next = new Set(prev); next.delete(sys); return next; });
  };

  const handleSave = () => {
    if (!propertyId) return;
    const result: SystemAges = {};
    for (const sys of TRACKED_SYSTEMS) {
      if (sys === "Solar Panels") {
        if (hasSolar) {
          const yr = parseInt(ages[sys], 10);
          if (!isNaN(yr) && yr >= 1900 && yr <= CURRENT_YEAR) result[sys] = yr;
        }
        continue;
      }
      if (touched.has(sys)) {
        const yr = parseInt(ages[sys], 10);
        if (!isNaN(yr) && yr >= 1900 && yr <= CURRENT_YEAR) result[sys] = yr;
      }
    }
    systemAgesService.set(propertyId, result);
    toast.success("System ages saved — maintenance predictions updated.");
    onSuccess?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set System Ages"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(14,14,12,0.55)",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:   COLORS.white,
        border:       `1px solid ${COLORS.rule}`,
        borderRadius: RADIUS.card,
        padding:      "2rem",
        maxWidth:     "560px",
        width:        "100%",
        maxHeight:    "90vh",
        overflowY:    "auto",
        position:     "relative",
      }}>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
        >
          <X size={18} />
        </button>

        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.375rem" }}>
          Maintenance
        </div>
        <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: UI.ink, marginBottom: "0.375rem" }}>
          System Ages
        </h2>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "1.5rem", lineHeight: 1.7 }}>
          When were each of your home's systems last installed or fully replaced?
          Accurate ages give you better maintenance predictions.
          Defaults to the house's build year ({yearBuilt}) when left unchanged.
        </p>

        <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white }}>
          {TRACKED_SYSTEMS.map((sys, i) => {
            const isTouched = touched.has(sys);
            const isCustom  = isTouched && ages[sys] !== String(yearBuilt);

            /* ── Solar Panels — optional toggle row ── */
            if (sys === "Solar Panels") {
              return (
                <div key={sys} style={{ padding: "0.875rem 1.25rem" }}>
                  {/* Toggle header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1rem" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.2rem" }}>
                        Solar Panels
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, marginLeft: "0.5rem" }}>optional</span>
                      </div>
                      <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight }}>
                        {SYSTEM_DESCRIPTIONS["Solar Panels"]}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                        {hasSolar ? "Installed" : "Not installed"}
                      </span>
                      {/* Toggle switch */}
                      <button
                        onClick={() => setHasSolar((v) => !v)}
                        aria-label="Toggle solar panels"
                        style={{
                          width: "2.25rem", height: "1.25rem", borderRadius: 100, flexShrink: 0,
                          background: hasSolar ? COLORS.sage : COLORS.rule,
                          border: "none", cursor: "pointer", position: "relative", padding: 0,
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{
                          position: "absolute", top: "2px",
                          left: hasSolar ? "calc(100% - 17px)" : "2px",
                          width: "13px", height: "13px", borderRadius: "50%",
                          background: COLORS.white,
                          transition: "left 0.15s",
                        }} />
                      </button>
                    </div>
                  </div>

                  {/* Year input — visible only when toggled on */}
                  {hasSolar && (
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.625rem", marginTop: "0.75rem" }}>
                      {isCustom && (
                        <button
                          onClick={() => handleReset("Solar Panels")}
                          style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}
                          title="Reset to house age"
                        >
                          Reset
                        </button>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                        <input
                          type="number"
                          min={1900}
                          max={CURRENT_YEAR}
                          value={ages["Solar Panels"]}
                          onChange={(e) => handleChange("Solar Panels", e.target.value)}
                          style={{
                            width: "5.5rem", padding: "0.375rem 0.625rem",
                            border: `1px solid ${isCustom ? UI.sage : UI.rule}`,
                            fontFamily: UI.mono, fontSize: "0.8rem", textAlign: "center",
                            outline: "none",
                            background: isCustom ? COLORS.sageLight : COLORS.white,
                            color: isCustom ? UI.sage : UI.ink,
                          }}
                        />
                        <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: UI.inkLight }}>
                          {isCustom ? `${CURRENT_YEAR - parseInt(ages["Solar Panels"] || "0", 10)} yrs old` : "house age"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            /* ── Standard system row ── */
            return (
              <div
                key={sys}
                style={{
                  display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center",
                  gap: "1rem", padding: "0.875rem 1.25rem",
                  borderBottom: `1px solid ${UI.rule}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.2rem" }}>
                    {sys}
                  </div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: UI.inkLight }}>
                    {SYSTEM_DESCRIPTIONS[sys]}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  {isCustom && (
                    <button
                      onClick={() => handleReset(sys)}
                      style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}
                      title="Reset to house age"
                    >
                      Reset
                    </button>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                    <input
                      type="number"
                      min={1900}
                      max={CURRENT_YEAR}
                      value={ages[sys]}
                      onChange={(e) => handleChange(sys, e.target.value)}
                      style={{
                        width: "5.5rem", padding: "0.375rem 0.625rem",
                        border: `1px solid ${isCustom ? UI.sage : UI.rule}`,
                        fontFamily: UI.mono, fontSize: "0.8rem", textAlign: "center",
                        outline: "none",
                        background: isCustom ? COLORS.sageLight : COLORS.white,
                        color: isCustom ? UI.sage : UI.ink,
                      }}
                    />
                    <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: UI.inkLight }}>
                      {isCustom ? `${CURRENT_YEAR - parseInt(ages[sys] || "0", 10)} yrs old` : "house age"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={handleSave} icon={<Save size={14} />} size="lg">
            Save System Ages
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildAges(stored: SystemAges, yearBuilt: number): Record<SystemName, string> {
  const init: Record<string, string> = {};
  for (const sys of TRACKED_SYSTEMS) {
    init[sys] = stored[sys] !== undefined ? String(stored[sys]) : String(yearBuilt);
  }
  return init as Record<SystemName, string>;
}

function buildTouched(stored: SystemAges): Set<SystemName> {
  const t = new Set<SystemName>();
  for (const sys of TRACKED_SYSTEMS) {
    if (stored[sys] !== undefined) t.add(sys);
  }
  return t;
}
