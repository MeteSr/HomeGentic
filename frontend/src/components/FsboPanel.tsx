/**
 * FsboPanel — Epic 10.1
 *
 * Setup wizard on My Listing for a home that isn't live yet: asking price,
 * a look at the HomeGentic report, then Go Live. Each step is saved to the
 * listing canister, so the seller can leave and pick up where they stopped.
 *
 *   10.1.2 — Activation checklist (price → report → go live)
 *   10.1.3 — Real-time commission savings calculator
 *   10.1.4 — FSBO readiness label + missing-items guidance
 */

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/Button";
import {
  fsboService,
  computeFsboReadiness,
  computeAgentCommissionSavings,
  type FsboRecord,
  type FsboStep,
} from "@/services/fsbo";
import type { Property } from "@/services/property";
import { V2_COLORS, V2_FONTS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  sage:     V2_COLORS.blue,
  inkLight: V2_COLORS.muted,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
  sans:     V2_FONTS.body,
};

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const READINESS_LABEL: Record<string, string> = {
  NotReady:        "Not Ready",
  Ready:           "Ready",
  OptimallyReady:  "Optimally Ready",
};

const READINESS_COLOR: Record<string, string> = {
  NotReady:       "#c0392b",
  Ready:          "#e37400",
  OptimallyReady: "#188038",
};

const STEP_LABELS: Record<FsboStep, string> = {
  1:    "Step 1 — Enter Your Asking Price",
  2:    "Step 2 — Review Your HomeGentic Report",
  3:    "Step 3 — Go Live",
  done: "You're Live!",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem",
};
const inputStyle: React.CSSProperties = {
  padding: "0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.875rem",
};

export interface FsboPanelProps {
  propertyId:       string;
  score:            number;
  verifiedJobCount: number;
  hasReport:        boolean;
  /** Needed to publish (address, type, size). Without it the Go Live step waits. */
  property?:        Property | null;
  /** The saved setup, or null before the seller starts. */
  record:           FsboRecord | null;
  onChange:         (record: FsboRecord) => void;
}

export default function FsboPanel({ propertyId, score, verifiedJobCount, hasReport, property, record, onChange }: FsboPanelProps) {
  const [active,      setActive]      = useState(false);
  const [listPrice,   setListPrice]   = useState(() => record ? String(Math.round(record.listPriceCents / 100)) : "");
  const [description, setDescription] = useState(() => record?.description ?? "");
  const [bedrooms,    setBedrooms]    = useState("");
  const [bathrooms,   setBathrooms]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const { readiness, missing } = computeFsboReadiness(score, verifiedJobCount, hasReport);
  const readinessLabel = READINESS_LABEL[readiness];
  const readinessColor = READINESS_COLOR[readiness];

  const canActivate = readiness !== "NotReady";
  const currentStep: FsboStep = record?.step ?? 1;

  // Savings calculation (real-time, 10.1.3)
  const listPriceCents = Math.round(parseFloat(listPrice || "0") * 100);
  const savingsCents   = listPriceCents > 0 ? computeAgentCommissionSavings(listPriceCents) : 0;

  async function run(action: () => Promise<FsboRecord>) {
    setSaving(true);
    setError(null);
    try {
      onChange(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSetPrice(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(listPrice) * 100);
    if (!cents || cents <= 0) { setError("Enter an asking price above $0."); return; }
    void run(() => fsboService.saveDraft(propertyId, cents, description, 2));
  }

  function handleReportReviewed() {
    if (!record) return;
    void run(() => fsboService.saveDraft(propertyId, record.listPriceCents, record.description, 3));
  }

  function handleGoLive(e: React.FormEvent) {
    e.preventDefault();
    if (!record || !property) return;
    const beds  = parseInt(bedrooms, 10);
    const baths = parseInt(bathrooms, 10);
    if (!(beds >= 0) || !(baths >= 0)) { setError("Enter the number of bedrooms and bathrooms."); return; }
    void run(() => fsboService.goLive(property, record, { bedrooms: beds, bathrooms: baths }));
  }

  return (
    <div style={{ border: `1px solid ${UI.rule}`, padding: "1.5rem" }}>
      {/* Header */}
      <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink, margin: "0 0 0.5rem" }}>
        Sell This Home Yourself
      </h2>
      <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: "0 0 1rem" }}>
        Use your HomeGentic record to sell without paying a listing agent.
      </p>

      {/* 10.1.4 — Readiness */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          FSBO Readiness:
        </span>
        <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: readinessColor }}>
          {readinessLabel}
        </span>
      </div>

      {missing.length > 0 && (
        <ul style={{ margin: "0 0 1rem", padding: "0 0 0 1.25rem", listStyle: "none" }}>
          {missing.map((m, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontFamily: UI.mono, fontSize: "0.65rem", color: readiness === "NotReady" ? "#c0392b" : UI.inkLight, marginBottom: "0.25rem" }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {m}
            </li>
          ))}
        </ul>
      )}

      {/* Not activated yet */}
      {!active && !record && (
        <Button
          onClick={() => setActive(true)}
          disabled={!canActivate}
          aria-label="Activate FSBO"
        >
          {canActivate ? "Get Started" : "Complete Requirements First"}
        </Button>
      )}

      {/* Activation flow */}
      {(active || record) && (
        <div style={{ marginTop: "1rem" }}>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {([1, 2, 3, "done"] as FsboStep[]).map((s) => {
              const stepNum = s === "done" ? 4 : Number(s);
              const currNum = currentStep === "done" ? 4 : Number(currentStep);
              const done    = stepNum < currNum;
              const current = s === currentStep;
              return (
                <span
                  key={String(s)}
                  style={{
                    fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: done ? UI.sage : current ? UI.ink : UI.inkLight,
                    display: "flex", alignItems: "center", gap: "0.25rem",
                  }}
                >
                  {done && <CheckCircle2 size={11} color={UI.sage} />}
                  {s === "done" ? "Done" : `Step ${s}`}
                </span>
              );
            })}
          </div>

          {error && (
            <p role="alert" style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: "#c0392b", margin: "0 0 0.75rem" }}>
              {error}
            </p>
          )}

          {/* Step 1 — Set list price */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {STEP_LABELS[1]}
              </h3>
              <form aria-label="FSBO Price Setup" onSubmit={handleSetPrice} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label htmlFor="fsbo-list-price" style={labelStyle}>List Price ($)</label>
                  <input
                    id="fsbo-list-price"
                    type="number"
                    min="1"
                    step="any"
                    placeholder="e.g. 485000"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    style={{ ...inputStyle, width: "14rem" }}
                  />
                </div>

                {/* 10.1.3 — Real-time savings */}
                {savingsCents > 0 && (
                  <div style={{ background: "#f0faf4", border: "1px solid #c3e6cb", padding: "0.75rem 1rem" }}>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#188038", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
                      Estimated Savings vs. 3% Agent Commission
                    </div>
                    <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", color: "#188038" }}>
                      ~{formatPrice(savingsCents)}
                    </div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: "#188038", marginTop: "0.2rem" }}>
                      At {formatPrice(listPriceCents)}, you save ~{formatPrice(savingsCents)} vs. a 3% buyer's agent commission
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="fsbo-description" style={labelStyle}>Description for buyers (optional)</label>
                  <textarea
                    id="fsbo-description"
                    value={description}
                    maxLength={5000}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ ...inputStyle, width: "100%", height: "90px", boxSizing: "border-box", fontFamily: UI.sans }}
                  />
                </div>

                <Button type="submit" loading={saving} style={{ alignSelf: "flex-start" }}>Save Price &amp; Continue</Button>
              </form>
            </div>
          )}

          {/* Step 2 — Review report */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {STEP_LABELS[2]}
              </h3>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: "0 0 1rem" }}>
                Buyers on your listing page get a link to your report when it's shared publicly.
                {!hasReport && (
                  <> You don't have a public report yet. <Link to={`/properties/${propertyId}`} style={{ color: UI.sage }}>Create one from your property page</Link>.</>
                )}
              </p>
              <Button onClick={handleReportReviewed} loading={saving}>
                {hasReport ? "Report Looks Good — Continue" : "Skip for Now"}
              </Button>
            </div>
          )}

          {/* Step 3 — Go live */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {STEP_LABELS[3]}
              </h3>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: "0 0 1rem" }}>
                Your listing will appear in HomeGentic's For Sale search and on its own page at
                {" "}<code>/for-sale/{propertyId}</code>, with your asking price, address, home details,
                verified job count and HomeGentic score.
              </p>
              <form aria-label="Go Live" onSubmit={handleGoLive} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label htmlFor="fsbo-bedrooms" style={labelStyle}>Bedrooms</label>
                  <input id="fsbo-bedrooms" type="number" min="0" max="50" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
                </div>
                <div>
                  <label htmlFor="fsbo-bathrooms" style={labelStyle}>Bathrooms</label>
                  <input id="fsbo-bathrooms" type="number" min="0" max="50" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
                </div>
                <Button type="submit" loading={saving} disabled={!property}>
                  Publish FSBO Listing
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
