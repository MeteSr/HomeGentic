/**
 * InitListingModal — start a new FSBO listing from the property page.
 *
 * Collects:
 *   - Asking price (required)
 *   - Listing description (optional, with AI-draft)
 *
 * On submit:
 *   - Calls fsboService.setFsboMode(propertyId, priceCents, description)
 *   - Navigates to /my-listing/:propertyId
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/Button";
import { fsboService } from "@/services/fsbo";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";
import { COLORS, FONTS } from "@/theme";

// ─── Design tokens ────────────────────────────────────────────────────────────

const UI = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  sans:     FONTS.sans,
  mono:     FONTS.sans,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? null : val;
}

function draftDescription(property: Property, jobs: Job[], score: number): string {
  const verifiedJobs = jobs.filter((j) => j.verified ?? j.status === "verified");
  const types = Array.from(new Set(verifiedJobs.map((j) => j.serviceType))).slice(0, 3);
  const typeList = types.length > 0 ? ` — including ${types.join(", ")}` : "";
  const sqFt = Number(property.squareFeet).toLocaleString("en-US");
  const type = property.propertyType.replace(/([A-Z])/g, " $1").trim();
  const jobLine =
    verifiedJobs.length > 0
      ? ` ${verifiedJobs.length} verified maintenance job${verifiedJobs.length !== 1 ? "s" : ""} on record${typeList}.`
      : "";

  return `Well-maintained ${type} in ${property.city}, ${property.state}. Built ${property.yearBuilt}, ${sqFt} sq ft.${jobLine} HomeGentic score: ${score}/100 — all records verified on-chain.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open:       boolean;
  onClose:    () => void;
  property:   Property;
  jobs:       Job[];
  score:      number;
}

const labelStyle: React.CSSProperties = {
  display:       "block",
  fontFamily:    UI.mono,
  fontSize:      "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color:         UI.inkLight,
  marginBottom:  "0.35rem",
};

const inputStyle: React.CSSProperties = {
  width:      "100%",
  padding:    "0.55rem 0.75rem",
  border:     `1px solid ${COLORS.rule}`,
  fontFamily: UI.sans,
  fontSize:   "0.875rem",
  color:      COLORS.plum,
  background: COLORS.white,
  boxSizing:  "border-box",
  outline:    "none",
};

export default function InitListingModal({ open, onClose, property, jobs, score }: Props) {
  const navigate = useNavigate();

  const [priceInput,   setPriceInput]   = useState("");
  const [description,  setDescription]  = useState("");
  const [generating,   setGenerating]   = useState(false);
  const [priceError,   setPriceError]   = useState("");
  const [submitting,   setSubmitting]   = useState(false);

  if (!open) return null;

  function handleDraftAI() {
    setGenerating(true);
    // Simulate a short generation delay then fill the textarea
    setTimeout(() => {
      setDescription(draftDescription(property, jobs, score));
      setGenerating(false);
    }, 600);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dollars = parseDollars(priceInput);
    if (!dollars) {
      setPriceError("Enter a valid asking price.");
      return;
    }
    setPriceError("");
    setSubmitting(true);

    const priceCents = Math.round(dollars * 100);
    fsboService.setFsboMode(String(property.id), priceCents, description.trim() || undefined);
    navigate(`/my-listing/${property.id}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="List Your Home"
      style={{
        position:   "fixed", inset: 0, zIndex: 200,
        background: "rgba(14,11,23,0.55)",
        display:    "flex", alignItems: "center", justifyContent: "center",
        padding:    "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: COLORS.white,
        width:      "100%",
        maxWidth:   "520px",
        padding:    "2rem",
        position:   "relative",
      }}>
        {/* Close button */}
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position:   "absolute", top: "1rem", right: "1rem",
            background: "none", border: "none", cursor: "pointer",
            color:      UI.inkLight, padding: "0.25rem",
          }}
        >
          <X size={18} />
        </button>

        {/* Heading */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{
            fontFamily: UI.serif, fontWeight: 900, fontSize: "1.375rem",
            color: UI.ink, margin: 0, marginBottom: "0.375rem",
          }}>
            List Your Home
          </h2>
          <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, margin: 0 }}>
            {property.address} · {property.city}, {property.state}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Asking price */}
          <div>
            <label style={labelStyle}>Asking Price</label>
            <input
              style={{
                ...inputStyle,
                borderColor: priceError ? COLORS.rust : COLORS.rule,
              }}
              type="text"
              placeholder="e.g. 425000"
              value={priceInput}
              onChange={(e) => { setPriceInput(e.target.value); setPriceError(""); }}
            />
            {priceError && (
              <p style={{ fontFamily: UI.sans, fontSize: "0.7rem", color: COLORS.rust, marginTop: "0.25rem" }}>
                {priceError}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <label style={{ ...labelStyle, margin: 0 }}>Listing Description</label>
              <button
                type="button"
                onClick={handleDraftAI}
                disabled={generating}
                style={{
                  display:    "inline-flex", alignItems: "center", gap: "0.3rem",
                  fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em",
                  color:      generating ? UI.inkLight : COLORS.sage,
                  background: "none", border: "none", cursor: generating ? "default" : "pointer",
                  padding:    "0.2rem 0",
                }}
              >
                <Sparkles size={11} />
                {generating ? "Drafting…" : "Draft with AI"}
              </button>
            </div>
            <textarea
              style={{
                ...inputStyle,
                height:     "110px",
                resize:     "vertical",
                lineHeight: "1.55",
              }}
              placeholder="Describe your home for potential buyers. Leave blank to skip."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p style={{ fontFamily: UI.sans, fontSize: "0.7rem", color: UI.inkLight, marginTop: "0.25rem" }}>
              Optional — you can add or edit this later from My Listing.
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.5rem", borderTop: `1px solid ${COLORS.rule}` }}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Start My Listing →
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
