/**
 * DashboardV3's main panel CTA button always renders as a fully-styled,
 * clickable blue button (see DashboardV3.tsx), but its click handler only
 * actually does something for a panel key if that key is either:
 *   - handled by name inside DashboardV3.tsx's onClick (awaiting, forecast,
 *     people, billing, market, sensors, spend, activity), or
 *   - present in CTA_FLOW (or the panel's own PanelData.ctaFlow — unused
 *     today, but checked here too for completeness).
 *
 * A panel key present in PANEL_ORDER but missing from both is a silent
 * no-op: the button looks and feels clickable but does nothing when
 * clicked. That's exactly what happened for score/property/market/
 * sensors/safety/spend/activity before this test was added — this guards
 * against it happening again for any future panel.
 */

import { describe, it, expect } from "vitest";
import { CTA_FLOW, PANEL_ORDER, buildPanels, type PanelCtx } from "@/components/dashboardV3/panelData";
import type { PanelKey } from "@/components/dashboardV3/types";

// Panel keys whose CTA is handled by an explicit `if (activeKey === "...")`
// branch in DashboardV3.tsx's main CTA onClick, rather than via CTA_FLOW.
const HANDLED_BY_NAME_IN_DASHBOARD: PanelKey[] = [
  "awaiting", "forecast", "people", "billing", "market", "sensors", "spend", "activity",
];

function emptyCtx(): PanelCtx {
  return {
    score: 0, grade: "F", breakdown: { verifiedJobPts: 0, valuePts: 0, verificationPts: 0, diversityPts: 0 } as any,
    premium: null, zipCode: "",
    activeProperty: null, properties: [],
    jobs: [], pendingProposals: [], decayEvents: [], atRiskWarnings: [], scoreEvents: [],
    quoteRequests: [], bidCountMap: {},
    recurringServices: [], visitLogMap: {},
    rooms: [],
    sensorDevices: [], sensorAlerts: [],
    systemAges: {} as any, people: null,
    planTier: "Free", subExpiresAt: null, subCancelledAt: null,
    agentCreditsLeft: null, agentQuotaExhausted: false,
    goPanel: () => {}, openFlow: () => {},
    approveProposal: () => {}, declineProposal: () => {}, approveAll: () => {},
    navigate: () => {},
  };
}

describe("DashboardV3 panel CTA — every panel's button does something", () => {
  const panels = buildPanels(emptyCtx());

  it.each(PANEL_ORDER)("panel %s's CTA resolves to a real action", (key) => {
    const handledByName = HANDLED_BY_NAME_IN_DASHBOARD.includes(key);
    const hasCtaFlow = Boolean(panels[key].ctaFlow ?? CTA_FLOW[key]);
    expect(
      handledByName || hasCtaFlow,
      `Panel "${key}" has cta="${panels[key].cta}" but no ctaFlow, no CTA_FLOW entry, ` +
        `and isn't special-cased by name in DashboardV3.tsx's CTA onClick — clicking it does nothing.`
    ).toBe(true);
  });
});
