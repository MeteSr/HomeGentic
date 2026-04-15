/**
 * FsboPanel — Epic 10.1
 *
 * Embedded panel within PropertyDetailPage that lets a homeowner activate
 * FSBO mode, walk through a checklist, and see real-time savings vs. agent
 * commission.
 *
 *   10.1.2 — Activation checklist (price → report → go live → done)
 *   10.1.3 — Real-time commission savings calculator
 *   10.1.4 — FSBO readiness label + missing-items guidance
 */

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Star } from "lucide-react";
import { Button } from "@/components/Button";
import {
  fsboService,
  computeFsboReadiness,
  computeAgentCommissionSavings,
  type FsboRecord,
  type FsboStep,
} from "@/services/fsbo";
import { mlsService, type MlsSubmitResult } from "@/services/mlsService";
import { listingService } from "@/services/listing";
import { fsboOfferService } from "@/services/fsboOffer";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import type { Property } from "@/services/property";
import { COLORS, FONTS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
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

export interface FsboPanelProps {
  propertyId:       string;
  score:            number;
  verifiedJobCount: number;
  hasReport:        boolean;
  property?:        Property;
}

export default function FsboPanel({ propertyId, score, verifiedJobCount, hasReport, property }: FsboPanelProps) {
  const [record,      setRecord]      = useState<FsboRecord | null>(() => fsboService.getRecord(propertyId));
  const [active,      setActive]      = useState(false);
  const [listPrice,   setListPrice]   = useState("");
  const [mlsResult,      setMlsResult]      = useState<MlsSubmitResult | null>(null);
  const [mlsError,       setMlsError]       = useState<string | null>(null);
  const [mlsLoading,     setMlsLoading]     = useState(false);
  const [agentRequested, setAgentRequested] = useState(false);
  const [userTier,       setUserTier]       = useState<PlanTier>("Free");

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
  }, []);

  const { readiness, missing } = computeFsboReadiness(score, verifiedJobCount, hasReport);
  const readinessLabel = READINESS_LABEL[readiness];
  const readinessColor = READINESS_COLOR[readiness];

  const canActivate = readiness !== "NotReady";
  const currentStep: FsboStep = record?.step ?? 1;

  // Savings calculation (real-time, 10.1.3)
  const listPriceCents = Math.round(parseFloat(listPrice || "0") * 100);
  const savingsCents   = listPriceCents > 0 ? computeAgentCommissionSavings(listPriceCents) : 0;

  async function handleSetPrice(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(listPrice) * 100);
    if (!cents || cents <= 0) return;
    const updated = fsboService.setFsboMode(propertyId, cents);
    setRecord(updated);
  }

  function handleAdvance() {
    const updated = fsboService.advanceStep(propertyId);
    setRecord(updated);
  }

  async function handleMlsSubmit() {
    if (!record || !property) return;
    setMlsLoading(true);
    setMlsError(null);
    try {
      const result = await mlsService.submit(propertyId, record.listPriceCents, property.address);
      setMlsResult(result);
    } catch (err: any) {
      setMlsError(err.message || "MLS submission failed");
    } finally {
      setMlsLoading(false);
    }
  }

  async function handleFindAgent() {
    if (!record) return;
    const offers      = fsboOfferService.getByProperty(propertyId);
    const daysOnMarket = record.activatedAt
      ? Math.round((Date.now() - record.activatedAt) / 86_400_000)
      : 0;
    const price = (record.listPriceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
    const notes = `Previously listed FSBO at $${price}. Days on market: ${daysOnMarket}. Offers received: ${offers.length}.`;
    const now = Date.now();
    await listingService.createBidRequest({
      propertyId,
      targetListDate:   now + 30 * 86_400_000,
      desiredSalePrice: record.listPriceCents,
      notes,
      bidDeadline:      now + 7 * 86_400_000,
    });
    setAgentRequested(true);
  }

  if (userTier === "Free") {
    return (
      <UpgradeGate
        feature="Agent Marketplace &amp; FSBO"
        description="Selling your home? Upgrade to Pro to make agents compete for your listing — or go FSBO with our full toolkit."
        icon="🏡"
      />
    );
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

          {/* Step 1 — Set list price */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {STEP_LABELS[1]}
              </h3>
              <form aria-label="FSBO Price Setup" onSubmit={handleSetPrice} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label htmlFor="fsbo-list-price" style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                    List Price ($)
                  </label>
                  <input
                    id="fsbo-list-price"
                    type="number"
                    min="1"
                    step="1000"
                    placeholder="e.g. 485000"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    style={{ width: "14rem", padding: "0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.875rem" }}
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

                <Button type="submit" style={{ alignSelf: "flex-start" }}>Save Price &amp; Continue</Button>
              </form>
            </div>
          )}

          {/* Step 2 — Review report */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Step 2 — Review Your HomeGentic Report
              </h3>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: "0 0 1rem" }}>
                Review your HomeGentic report before sharing it with buyers.
                {!hasReport && " No public report yet — generate one from the Reports tab."}
              </p>
              <Button onClick={handleAdvance}>
                {hasReport ? "Report Looks Good — Continue" : "Skip for Now"}
              </Button>
            </div>
          )}

          {/* Step 3 — Go live */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Step 3 — Go Live
              </h3>
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: "0 0 1rem" }}>
                Your FSBO listing page will be visible at a shareable URL with your HomeGentic badge.
              </p>
              <Button onClick={handleAdvance}>
                Publish FSBO Listing
              </Button>
            </div>
          )}

          {/* Done */}
          {currentStep === "done" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <Star size={20} color={UI.sage} />
                <div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", color: UI.ink }}>
                    Your FSBO listing is live!
                  </div>
                  <div style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight }}>
                    Share your HomeGentic listing link with potential buyers.
                  </div>
                </div>
              </div>

              {/* 10.3.6 — Flat-fee MLS submission */}
              {property && !mlsResult && (
                <div style={{ marginTop: "0.75rem" }}>
                  {mlsLoading ? (
                    <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.inkLight }}>Submitting…</p>
                  ) : (
                    <Button onClick={handleMlsSubmit} aria-label="Submit to MLS">
                      Submit to MLS
                    </Button>
                  )}
                  {mlsError && (
                    <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: "#c0392b", marginTop: "0.5rem" }}>
                      {mlsError}
                    </p>
                  )}
                </div>
              )}

              {mlsResult && (
                <div style={{ marginTop: "0.75rem" }}>
                  <a
                    href={mlsResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.875rem", color: UI.sage, textDecoration: "underline" }}
                  >
                    View MLS Listing
                  </a>
                </div>
              )}

              {/* 10.7.1 — Agent handoff */}
              <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "1rem" }}>
                {agentRequested ? (
                  <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.sage }}>
                    ✓ Agent request sent — agents will now compete for your listing.
                  </p>
                ) : (
                  <>
                    <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, marginBottom: "0.5rem" }}>
                      Changed your mind? Let agents compete for your listing.
                    </p>
                    <Button onClick={handleFindAgent}>
                      Find me an agent
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
