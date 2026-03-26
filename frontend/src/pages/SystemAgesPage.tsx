import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { usePropertyStore } from "@/store/propertyStore";
import { systemAgesService, TRACKED_SYSTEMS, SystemName, SystemAges } from "@/services/systemAges";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const SYSTEM_DESCRIPTIONS: Record<SystemName, string> = {
  "HVAC":          "Furnace, AC, heat pump",
  "Roofing":       "Shingles, membrane, or metal roof",
  "Water Heater":  "Tank or tankless water heater",
  "Windows":       "Double/triple-pane windows",
  "Electrical":    "Panel, wiring, breakers",
  "Plumbing":      "Pipes, supply & drain lines",
  "Flooring":      "Hardwood, tile, carpet",
  "Insulation":    "Attic, wall, crawlspace insulation",
};

const CURRENT_YEAR = new Date().getFullYear();

export default function SystemAgesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { properties } = usePropertyStore();

  const property = properties.find((p) => String(p.id) === id);
  const yearBuilt = property ? Number(property.yearBuilt) : CURRENT_YEAR - 20;

  // initialise from storage, falling back to yearBuilt for display purposes
  const stored = id ? systemAgesService.get(id) : {};
  const [ages, setAges] = useState<Record<SystemName, string>>(() => {
    const init: Record<string, string> = {};
    for (const sys of TRACKED_SYSTEMS) {
      init[sys] = stored[sys] !== undefined ? String(stored[sys]) : String(yearBuilt);
    }
    return init as Record<SystemName, string>;
  });

  // Track which systems the user has explicitly touched
  const [touched, setTouched] = useState<Set<SystemName>>(() => {
    const t = new Set<SystemName>();
    for (const sys of TRACKED_SYSTEMS) {
      if (stored[sys] !== undefined) t.add(sys);
    }
    return t;
  });

  const handleChange = (sys: SystemName, value: string) => {
    setAges((prev) => ({ ...prev, [sys]: value }));
    setTouched((prev) => new Set(prev).add(sys));
  };

  const handleReset = (sys: SystemName) => {
    setAges((prev) => ({ ...prev, [sys]: String(yearBuilt) }));
    setTouched((prev) => { const next = new Set(prev); next.delete(sys); return next; });
  };

  const handleSave = () => {
    if (!id) return;
    const result: SystemAges = {};
    for (const sys of TRACKED_SYSTEMS) {
      if (touched.has(sys)) {
        const yr = parseInt(ages[sys], 10);
        if (!isNaN(yr) && yr >= 1900 && yr <= CURRENT_YEAR) {
          result[sys] = yr;
        }
      }
    }
    systemAgesService.set(id, result);
    toast.success("System ages saved — maintenance predictions updated.");
    navigate(-1);
  };

  return (
    <Layout>
      <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          {property ? `${property.address}` : "Property"}
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          System Ages
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.75rem", lineHeight: 1.7 }}>
          When were each of your home's systems last installed or fully replaced?
          Accurate ages give you better maintenance predictions.
          Defaults to the house's build year ({yearBuilt}) when left unchanged.
        </p>

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
          {TRACKED_SYSTEMS.map((sys, i) => {
            const isTouched = touched.has(sys);
            const isCustom = isTouched && ages[sys] !== String(yearBuilt);
            return (
              <div
                key={sys}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1rem 1.25rem",
                  borderBottom: i < TRACKED_SYSTEMS.length - 1 ? `1px solid ${S.rule}` : "none",
                  background: isCustom ? "#FAFAF7" : "#fff",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: S.ink, marginBottom: "0.2rem" }}>
                    {sys}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight }}>
                    {SYSTEM_DESCRIPTIONS[sys]}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  {isCustom && (
                    <button
                      onClick={() => handleReset(sys)}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}
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
                        width: "5.5rem",
                        padding: "0.375rem 0.625rem",
                        border: `1px solid ${isCustom ? S.rust : S.rule}`,
                        fontFamily: S.mono,
                        fontSize: "0.8rem",
                        textAlign: "center",
                        outline: "none",
                        background: isCustom ? "#FFF8F7" : "#fff",
                        color: isCustom ? S.rust : S.ink,
                      }}
                    />
                    <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.inkLight }}>
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
    </Layout>
  );
}
