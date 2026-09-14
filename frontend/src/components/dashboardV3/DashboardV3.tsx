/**
 * DashboardV3 — voice-first, left-rail rebuild of the homeowner dashboard.
 *
 * Implements the "HomeGentic Dashboard v3 left nav" design (Claude Design
 * handoff bundle): a resting score/pulse stage, a left rail of record
 * panels that rise on demand, a bottom ask bar that routes typed queries
 * to a panel and hands the mic to the real voice agent, and action CTAs
 * that open the app's existing real modals (Add Room, Log Job, Request
 * Quote, Recurring Service, Upgrade, Init Listing) plus two new ones for
 * flows the app didn't have a home for yet (award a bid, chase a
 * countersignature).
 *
 * All data is real — see panelData.ts. Nothing here is demo/mock copy.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { useQuoteSummary } from "@/hooks/useQuoteSummary";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { useScoreTracking } from "@/hooks/useScoreTracking";
import { usePropertyRooms } from "@/hooks/usePropertyRooms";
import { useSubscription } from "@/hooks/useSubscription";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import {
  computeScoreWithDecay, computeBreakdown, getScoreGrade, premiumEstimate, isCertified,
} from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay } from "@/services/scoreDecayService";
import { getWeeklyPulse } from "@/services/pulseService";
import { getRecentScoreEvents } from "@/services/scoreEventService";
import { sensorService, type SensorDevice, type SensorEvent } from "@/services/sensor";

import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { AddRoomModal } from "@/components/AddRoomModal";
import RecurringServiceCreateModal from "@/components/RecurringServiceCreateModal";
import UpgradeModal from "@/components/UpgradeModal";
import InitListingModal from "@/components/InitListingModal";

import { AwardBidModal } from "./AwardBidModal";
import { ChaseSignatureModal } from "./ChaseSignatureModal";
import { HG_EASE } from "./theme";
import { buildPanels, CTA_FLOW, PANEL_ORDER, type PanelCtx } from "./panelData";
import type { FlowKey, PanelData, PanelKey, PanelRow } from "./types";

// ── Keyword routing for the ask bar's typed search ──────────────────────────

const KEYS: { k: PanelKey; words: string[] }[] = [
  { k: "safety", words: ["safe", "security", "alarm", "smoke", "detector", "lock", "camera"] },
  { k: "awaiting", words: ["approve", "awaiting", "pending", "waiting on me"] },
  { k: "activity", words: ["activity", "history", "recent", "what changed"] },
  { k: "rooms", words: ["room", "zone", "garage", "attic", "kitchen", "bath", "bedroom", "laundry"] },
  { k: "billing", words: ["bill", "plan", "subscription", "invoice", "charge", "card", "upgrade", "credits"] },
  { k: "sensors", words: ["leak", "leaking", "sensor", "wet", "water heater", "humidity", "device"] },
  { k: "spend", words: ["spend", "spent", "cost", "money", "budget", "paid", "how much"] },
  { k: "score", words: ["score", "grade", "points", "rating"] },
  { k: "market", words: ["worth", "value", "sell", "sale", "resale", "market", "comp"] },
  { k: "maint", words: ["due", "upcoming", "maintenance", "service", "schedule", "gutter"] },
  { k: "docs", words: ["document", "receipt", "permit", "warranty", "proof"] },
  { k: "pros", words: ["contractor", "pro", "crew", "countersign"] },
  { k: "jobs", words: ["job", "bid", "quote", "roof", "posted"] },
  { k: "property", words: ["property", "house", "home", "built", "age", "depreciation"] },
];

function routeQuery(q: string): PanelKey {
  const low = q.toLowerCase();
  const hit = KEYS.find((e) => e.words.some((w) => low.indexOf(w) > -1));
  return hit ? hit.k : "score";
}

// ── Small presentational bits ────────────────────────────────────────────────

function Dot({ color, style }: { color: string; style?: React.CSSProperties }) {
  return <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, ...style }} />;
}

function Row({ row, index, rise }: { row: PanelRow; index: number; rise: string }) {
  return (
    <div
      onClick={row.onTap}
      style={{
        display: "flex", alignItems: "center", gap: 20, padding: "13px 2px",
        borderBottom: "1px solid var(--hg-line)",
        animation: `${rise} .5s ${HG_EASE} ${(0.05 + index * 0.05).toFixed(2)}s both`,
        cursor: row.onTap ? "pointer" : "default",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "600 14.5px/1.3 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-2)" }}>{row.lead}</div>
        <div style={{ font: "400 11.5px/1.4 'JetBrains Mono',monospace", color: "var(--hg-muted)", marginTop: 6 }}>{row.sub}</div>
        {row.hasBar && (
          <div style={{ height: 5, borderRadius: 100, background: "var(--hg-line)", marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 100, width: row.pct, background: row.barColor }} />
          </div>
        )}
      </div>
      <div style={{ flex: "none", textAlign: "right" }}>
        <div style={{ font: "600 14.5px/1.3 'Hanken Grotesk',sans-serif", color: row.tone ?? "var(--hg-ink-2)", whiteSpace: "nowrap" }}>{row.right}</div>
        {row.rightSub && <div style={{ font: "400 11px/1.3 'JetBrains Mono',monospace", color: "var(--hg-muted)", marginTop: 6, whiteSpace: "nowrap" }}>{row.rightSub}</div>}
      </div>
      {row.hasActions && (
        <div style={{ flex: "none", display: "flex", gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); row.approve?.(); }} style={{ minHeight: 34, padding: "0 14px", borderRadius: 100, background: "#2B34FF", border: "1.5px solid #2B34FF", font: "600 12.5px/1 'Hanken Grotesk',sans-serif", color: "#FCFCFD", cursor: "pointer" }}>Approve</button>
          <button onClick={(e) => { e.stopPropagation(); row.decline?.(); }} style={{ minHeight: 34, padding: "0 12px", borderRadius: 100, background: "transparent", border: "1.5px solid var(--hg-line-2)", font: "600 12.5px/1 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", cursor: "pointer" }}>Decline</button>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function DashboardV3() {
  const { profile } = useAuthStore();
  const { open: openAddProp } = useAddPropertyStore();
  const { properties, loading: propLoading } = usePropertySummary();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const activePropertyId = selectedPropertyId ?? (properties.length > 0 ? String(properties[0].id) : null);
  const activeProperty = activePropertyId ? properties.find((p) => String(p.id) === activePropertyId) ?? null : null;

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!propLoading && !autoOpenedRef.current && profile && !profile.onboardingComplete && properties.length === 0) {
      autoOpenedRef.current = true;
      openAddProp();
    }
  }, [propLoading, profile, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobSummary = useJobSummary(properties, propLoading);
  const { quoteRequests, bidCountMap, reload: reloadQuotes } = useQuoteSummary();
  const { recurringServices, visitLogMap, systemAges } = useMaintenanceSchedule(properties, propLoading, activePropertyId);
  const loading = propLoading || jobSummary.loading;
  const { allJobs, pendingProposals } = jobSummary;
  const jobs = activePropertyId ? allJobs.filter((j) => j.propertyId === activePropertyId) : allJobs;

  const decayEvents = React.useMemo(() => (!loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : []), [jobs, systemAges, loading]);
  const atRiskWarnings = React.useMemo(() => (!loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : []), [jobs, systemAges, loading]);
  const totalDecay = getTotalDecay(decayEvents);
  const score = activeProperty ? computeScoreWithDecay(jobs, [activeProperty], totalDecay) : 0;
  const grade = getScoreGrade(score);
  const breakdown = React.useMemo(() => computeBreakdown(jobs, activeProperty ? [activeProperty] : []), [jobs, activeProperty]);
  const premium = React.useMemo(() => premiumEstimate(score), [score]);
  const { scoreHistory } = useScoreTracking(activePropertyId, score, loading);
  const pulseTip = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);
  const scoreEvents = React.useMemo(() => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []), [jobs, activeProperty, loading]);
  const certified = isCertified(score, jobs) || activeProperty?.verificationLevel === "Premium";

  const { rooms } = usePropertyRooms(activePropertyId ?? undefined);
  const { userTier } = useSubscription();

  const [sensorDevices, setSensorDevices] = useState<SensorDevice[]>([]);
  const [sensorAlerts, setSensorAlerts] = useState<SensorEvent[]>([]);
  React.useEffect(() => {
    if (!activePropertyId) return;
    sensorService.getDevicesForProperty(activePropertyId).then(setSensorDevices).catch(() => {});
    sensorService.getPendingAlerts(activePropertyId).then(setSensorAlerts).catch(() => {});
  }, [activePropertyId]);

  const voice = useVoiceAgent();

  // ── UI state ────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeKey, setActiveKey] = useState<PanelKey | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [flow, setFlow] = useState<FlowKey | null>(null);
  const [flash, setFlash] = useState<{ key: PanelKey; text: string } | null>(null);
  const [awardRequestId, setAwardRequestId] = useState<string | null>(null);
  const [chaseJobId, setChaseJobId] = useState<string | null>(null);

  const goPanel = (k: PanelKey) => {
    voice.reset();
    setActiveKey(k);
    setQuery("");
  };
  const openFlow = (k: FlowKey) => {
    if (k === "bids") {
      const withBids = quoteRequests.find((r) => (bidCountMap[r.id] ?? 0) > 0);
      setAwardRequestId(withBids?.id ?? null);
      if (!withBids) return;
    }
    if (k === "chase") {
      const unsigned = jobs.find((j) => j.contractorName && !j.contractorSigned);
      setChaseJobId(unsigned?.id ?? null);
      if (!unsigned) return;
    }
    setFlow(k);
  };
  const closeFlow = (result?: { key: PanelKey; text: string }) => {
    setFlow(null);
    setAwardRequestId(null);
    setChaseJobId(null);
    if (result) {
      setFlash(result);
      setActiveKey(result.key);
    }
  };

  const ctx: PanelCtx = {
    score, grade, breakdown, premium, zipCode: activeProperty?.zipCode ?? "",
    activeProperty, properties, jobs, pendingProposals, decayEvents, atRiskWarnings, scoreEvents,
    quoteRequests, bidCountMap, recurringServices, visitLogMap, rooms, sensorDevices, sensorAlerts,
    planTier: userTier, agentCreditsLeft: voice.creditBalance, agentQuotaExhausted: voice.quotaExhausted,
    goPanel, openFlow,
    approveProposal: (id) => jobSummary.approveProposal(id),
    declineProposal: (id) => jobSummary.rejectProposal(id),
    approveAll: () => pendingProposals.forEach((p) => jobSummary.approveProposal(p.id)),
  };
  const panels = useMemo(() => buildPanels(ctx), [
    score, grade, breakdown, premium, activeProperty, properties, jobs, pendingProposals,
    decayEvents, atRiskWarnings, scoreEvents, quoteRequests, bidCountMap, recurringServices,
    visitLogMap, rooms, sensorDevices, sensorAlerts, userTier, voice.creditBalance, voice.quotaExhausted,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePanel: PanelData | null = activeKey ? panels[activeKey] : null;
  const isVoiceActive = voice.state !== "idle" || !!voice.transcript || !!voice.response || !!voice.error;
  const mode: "idle" | "voice" | "panel" = activePanel ? "panel" : isVoiceActive ? "voice" : "idle";

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    goPanel(routeQuery(q));
  };

  const pendingCount = pendingProposals.length;
  const idleTips = useMemo(() => {
    const t: { text: string; go: PanelKey }[] = [];
    if (sensorAlerts.length) t.push({ text: `${sensorAlerts[0].eventType.replace(/([A-Z])/g, " $1").trim()} on a paired sensor.`, go: "sensors" });
    if (jobs.some((j) => j.contractorName && !j.contractorSigned)) t.push({ text: "A contractor hasn't countersigned a logged job — it earns no points until they do.", go: "pros" });
    if (atRiskWarnings.length) t.push({ text: `${atRiskWarnings[0].label} — ${atRiskWarnings[0].daysRemaining} days left before it costs points.`, go: "property" });
    if (voice.quotaExhausted) t.push({ text: "Your AI assistant calls are used up for this period — chat still works.", go: "billing" });
    if (quoteRequests.some((r) => (bidCountMap[r.id] ?? 0) > 0)) t.push({ text: "Bids are waiting on an open job.", go: "jobs" });
    if (!t.length) t.push({ text: "Nothing needs your attention right now.", go: "score" });
    return t;
  }, [sensorAlerts, jobs, atRiskWarnings, voice.quotaExhausted, quoteRequests, bidCountMap]);
  const [tipIdx, setTipIdx] = useState(0);
  const tip = idleTips[tipIdx % idleTips.length];

  // ── Header helpers ────────────────────────────────────────────────────────
  const propertyLabel = activeProperty
    ? `${activeProperty.address} · ${activeProperty.city} ${activeProperty.state} ${activeProperty.zipCode}`.toUpperCase()
    : "NO PROPERTY";

  return (
    <div className="hg-v3" data-theme={theme} style={{ minHeight: 640, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ font: "800 15px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.02em" }}>HomeGentic</div>
          <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>HOME</div>
        </div>
        <div style={{ width: 1, height: 16, background: "var(--hg-line)" }} />

        <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9 }}>
          <div onClick={() => setPropsOpen((o) => !o)} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", borderRadius: 100, padding: "4px 9px 4px 0" }}>
            <div style={{ minWidth: 0, font: "400 13px/1.3 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{propertyLabel}</div>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--hg-muted)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          {certified && (
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 5, background: "var(--hg-good-wash)", border: "1px solid var(--hg-good-edge)", borderRadius: 100, padding: "4px 9px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--hg-good)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4.5 4.5L19 7" /></svg>
              <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-good)" }}>CERTIFIED</div>
            </div>
          )}

          {propsOpen && (
            <div style={{ position: "absolute", top: 34, left: 0, zIndex: 20, width: 300, background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)", borderRadius: 16, padding: 7, boxShadow: "0 24px 60px var(--hg-shadow)" }}>
              {properties.map((p) => (
                <div key={String(p.id)} onClick={() => { setSelectedPropertyId(String(p.id)); setPropsOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 11, background: String(p.id) === activePropertyId ? "var(--hg-blue-wash)" : "transparent", cursor: "pointer" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: String(p.id) === activePropertyId ? "#2B34FF" : "var(--hg-dim)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "600 13px/1.3 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.address}</div>
                    <div style={{ font: "400 9.5px/1 'JetBrains Mono',monospace", letterSpacing: ".1em", color: "var(--hg-muted)", marginTop: 6 }}>
                      {p.city}, {p.state} · {p.verificationLevel.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
              <div onClick={() => { setPropsOpen(false); openAddProp(); }} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", marginTop: 3, borderTop: "1px solid var(--hg-line)", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--hg-blue-soft)" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                <div style={{ font: "600 12.5px/1 'Hanken Grotesk',sans-serif", color: "var(--hg-blue-ink)" }}>Add a property</div>
              </div>
            </div>
          )}
        </div>

        <div onClick={() => goPanel("billing")} title="AI assistant calls" style={{ display: "flex", alignItems: "center", gap: 7, flex: "none", cursor: "pointer" }}>
          <Dot color={voice.quotaExhausted ? "var(--hg-bad)" : "#FFD23F"} />
          <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)", whiteSpace: "nowrap" }}>
            {voice.quotaExhausted ? "AI CALLS USED UP" : voice.creditBalance != null ? `${voice.creditBalance} AI CALLS LEFT` : "…"}
          </div>
        </div>
        <div style={{ width: 1, height: 16, background: "var(--hg-line)", flex: "none" }} />
        <div onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme" style={{ flex: "none", display: "flex", alignItems: "center", gap: 7, border: `1.5px solid ${theme === "light" ? "#2B34FF" : "var(--hg-line-2)"}`, background: theme === "light" ? "var(--hg-blue-fill)" : "transparent", borderRadius: 100, padding: "5px 11px", cursor: "pointer" }}>
          <Dot color={theme === "light" ? "#FFD23F" : "var(--hg-dim)"} />
          <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: theme === "light" ? "var(--hg-blue-ink)" : "var(--hg-muted)" }}>{theme === "light" ? "DARK" : "LIGHT"}</div>
        </div>
        <div style={{ width: 1, height: 16, background: "var(--hg-line)", flex: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2B34FF", animation: "hgBreathe 3.4s ease-in-out infinite" }} />
          <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>WATCHING</div>
        </div>
      </div>

      {/* ── Body: rail + stage ─────────────────────────────────────────── */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: 22, padding: "0 24px" }}>
        <div style={{ flex: "none", width: 158, display: "flex", flexDirection: "column", gap: 3, padding: "4px 8px 4px 0" }}>
          {PANEL_ORDER.map((k) => {
            const p = panels[k];
            const on = activeKey === k;
            const showCount = k === "jobs" || k === "maint" || k === "sensors" || (k === "awaiting" && pendingCount > 0);
            return (
              <div
                key={k}
                onClick={() => goPanel(k)}
                style={{
                  minHeight: 31, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, padding: "0 12px", borderRadius: 100,
                  background: on ? "var(--hg-blue-fill)" : "var(--hg-fill)",
                  border: `1.5px solid ${on ? "#2B34FF" : "var(--hg-line-2)"}`,
                  font: "500 10.5px/1 'JetBrains Mono',monospace", letterSpacing: ".06em",
                  color: on ? "var(--hg-chip-on)" : "var(--hg-ink-3)", cursor: "pointer",
                }}
              >
                {p.chip}
                <span style={{ font: "400 10px/1 'JetBrains Mono',monospace", color: "var(--hg-muted)" }}>{showCount ? p.count : ""}</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", maxWidth: 820, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: "2px 0" }}>

            {mode === "idle" && (
              <div style={{ margin: "auto 0" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 28 }}>
                  <div style={{ flex: "none" }}>
                    <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>HOMEGENTIC SCORE</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
                      <div style={{ font: "800 clamp(34px,5.2vw,52px)/1 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.04em" }}>{loading ? "—" : score}</div>
                      <div style={{ font: "500 14px/1 'JetBrains Mono',monospace", color: "var(--hg-muted)" }}>/ 100</div>
                      <div style={{ font: "500 11px/1 'JetBrains Mono',monospace", letterSpacing: ".08em", background: "var(--hg-blue-fill)", color: "var(--hg-blue-ink)", border: "1px solid var(--hg-blue-edge)", borderRadius: 100, padding: "6px 10px" }}>{grade}</div>
                    </div>
                  </div>
                  {scoreHistory.length > 1 && (
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>SCORE TREND</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 34, marginTop: 11 }}>
                        {scoreHistory.slice(-12).map((h, i, arr) => (
                          <div key={i} style={{ width: 11, flex: "none", borderRadius: 2, height: `${Math.max((h.score / 100) * 100, 16)}%`, background: i === arr.length - 1 ? "var(--hg-trend-last)" : "var(--hg-trend)" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ font: "400 13px/1.5 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", marginTop: 10, maxWidth: 600 }}>
                  {premium ? `${`$${(premium.low).toLocaleString()}–$${premium.high.toLocaleString()}`} above the ZIP median at grade ${grade}.` : "Log jobs to unlock resale value insights."}
                </div>

                <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-blue-ink)", marginTop: 26 }}>
                  HOME PULSE{activeProperty ? ` · ${activeProperty.city?.toUpperCase()}` : ""}
                </div>
                <div style={{ font: "700 clamp(24px,3.6vw,34px)/1.1 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.03em", marginTop: 12 }}>
                  {pendingCount > 0 ? (pendingCount === 1 ? "One job is waiting on your approval." : `${pendingCount} jobs are waiting on your approval.`) : (pulseTip?.headline ?? "Nothing needs you today.")}
                </div>
                <div style={{ font: "400 14px/1.6 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", marginTop: 10, maxWidth: 520 }}>
                  {pulseTip?.detail ?? "Your record is up to date."}
                </div>

                <div onClick={() => { setTipIdx((i) => i + 1); goPanel(tip.go); }} style={{ marginTop: 16, maxWidth: 580, border: "1px solid var(--hg-blue-edge)", background: "var(--hg-blue-wash)", borderRadius: 16, padding: "12px 15px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--hg-blue-soft)", animation: "hgBreathe 3.4s ease-in-out infinite" }} />
                    <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-blue-ink)" }}>HOMEGENTIC SUGGESTS</div>
                  </div>
                  <div style={{ font: "400 13.5px/1.5 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-2)", marginTop: 9 }}>{tip.text}</div>
                </div>
              </div>
            )}

            {mode === "voice" && (
              <div style={{ margin: "auto 0", padding: "6px 0" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>
                      {voice.state === "listening" ? "LISTENING" : "HOMEGENTIC"}
                    </div>
                    {voice.transcript && (
                      <div style={{ font: "600 15px/1.45 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", marginTop: 10 }}>&ldquo;{voice.transcript}&rdquo;</div>
                    )}
                    {voice.state === "processing" && !voice.response && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--hg-blue-soft)", animation: `hgThink 1.2s ease-in-out ${i * 0.18}s infinite` }} />
                        ))}
                      </div>
                    )}
                    {voice.response && (
                      <div style={{ font: "700 clamp(21px,3vw,29px)/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.03em", marginTop: 12 }}>{voice.response}</div>
                    )}
                    {voice.error && (
                      <div style={{ font: "400 13.5px/1.55 'Hanken Grotesk',sans-serif", color: "var(--hg-bad)", marginTop: 9 }}>{voice.error}</div>
                    )}
                    {voice.fallbackNotice && (
                      <div style={{ font: "400 11px/1.4 'JetBrains Mono',monospace", color: "var(--hg-muted)", marginTop: 9 }}>Agent limit reached — answering via chat.</div>
                    )}
                  </div>
                  <div onClick={() => voice.reset()} style={{ flex: "none", width: 36, height: 36, borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--hg-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </div>
                </div>

                {voice.pendingProposal && (
                  <div style={{ marginTop: 18, border: "1px solid var(--hg-good-edge)", background: "var(--hg-good-wash)", borderRadius: 14, padding: "13px 15px" }}>
                    <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-good)" }}>PROPOSED JOB</div>
                    <div style={{ font: "400 13px/1.5 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-2)", marginTop: 8 }}>
                      {voice.pendingProposal.serviceType} · {voice.pendingProposal.propertyAddress} · ${(voice.pendingProposal.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={voice.confirmProposal} style={{ minHeight: 36, padding: "0 16px", borderRadius: 100, background: "#2B34FF", border: "none", color: "#fff", font: "600 12.5px/1 'Hanken Grotesk',sans-serif", cursor: "pointer" }}>Confirm</button>
                      <button onClick={voice.dismissProposal} style={{ minHeight: 36, padding: "0 16px", borderRadius: 100, background: "transparent", border: "1.5px solid var(--hg-line-2)", color: "var(--hg-muted)", font: "600 12.5px/1 'Hanken Grotesk',sans-serif", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === "panel" && activePanel && (
              <div style={{ margin: "auto 0", padding: "6px 0" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>{activePanel.chip}</div>
                    <div style={{ font: "700 clamp(21px,3vw,29px)/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.03em", marginTop: 12 }}>{activePanel.title}</div>
                    <div style={{ font: "400 13.5px/1.55 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", marginTop: 9, maxWidth: 600 }}>{activePanel.sub}</div>
                  </div>
                  <div onClick={() => setActiveKey(null)} style={{ flex: "none", width: 36, height: 36, borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--hg-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </div>
                </div>

                {flash && flash.key === activeKey && (
                  <div onClick={() => setFlash(null)} style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 18, border: "1px solid var(--hg-good-edge)", background: "var(--hg-good-wash)", borderRadius: 14, padding: "11px 15px", cursor: "pointer" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--hg-good)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4.5 4.5L19 7" /></svg>
                    <div style={{ flex: 1, minWidth: 0, font: "400 12.5px/1.45 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-2)" }}>{flash.text}</div>
                    <div style={{ flex: "none", font: "500 9px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)" }}>DISMISS</div>
                  </div>
                )}

                <div style={{ marginTop: 20, borderTop: "1px solid var(--hg-line)" }}>
                  {activePanel.rows.map((r, i) => (
                    <Row key={r.id ?? r.lead + i} index={i} rise="hgRiseA" row={{
                      ...r,
                      onTap: r.onTap ?? (r.flow ? () => openFlow(r.flow!) : r.go ? () => goPanel(r.go!) : undefined),
                    }} />
                  ))}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 20 }}>
                  <div
                    onClick={() => {
                      if (activeKey === "awaiting") { ctx.approveAll(); return; }
                      const f = activePanel.ctaFlow ?? CTA_FLOW[activeKey!];
                      if (f) openFlow(f);
                    }}
                    style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 1.4rem", borderRadius: 100, background: "#2B34FF", border: "1.5px solid #2B34FF", font: "600 .875rem/1 'Hanken Grotesk',sans-serif", color: "#FCFCFD", cursor: "pointer" }}
                  >
                    {activePanel.cta}
                  </div>
                  <div onClick={() => setActiveKey(null)} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 1.2rem", borderRadius: 100, background: "transparent", border: "1.5px solid var(--hg-line-2)", font: "600 .875rem/1 'Hanken Grotesk',sans-serif", color: "var(--hg-ink-3)", cursor: "pointer" }}>
                    Back to quiet
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ask bar ────────────────────────────────────────────────────── */}
      <div style={{ flex: "none", display: "flex", gap: 22, padding: "14px 24px 18px" }}>
        <div style={{ flex: "none", width: 158 }} />
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--hg-fill)", border: `1.5px solid ${focus ? "#2B34FF" : "var(--hg-line-2)"}`, borderRadius: 100, padding: "6px 6px 6px 20px" }}>
            <input
              type="text" value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              placeholder="Ask about your home"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", font: "400 15px/1.4 'Hanken Grotesk',sans-serif", color: "var(--hg-ink)", padding: "8px 0" }}
            />
            <div onClick={() => goPanel("add")} title="Add to the record" style={{ flex: "none", width: 44, height: 44, borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--hg-fill)", border: "1.5px solid var(--hg-line-2)", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--hg-ink-3)" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            {voice.isSupported && (
              <div
                onClick={() => (voice.state === "listening" ? voice.stopListening() : voice.startListening())}
                title="Speak"
                style={{ flex: "none", width: 44, height: 44, borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", background: voice.state === "listening" ? "#2B34FF" : "var(--hg-blue-fill)", border: `1.5px solid ${voice.state === "listening" ? "#2B34FF" : "var(--hg-blue-edge)"}`, cursor: "pointer" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={voice.state === "listening" ? "#FCFCFD" : "var(--hg-blue-ink)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v4" /></svg>
              </div>
            )}
          </div>
          <div style={{ font: "400 11px/1.5 'JetBrains Mono',monospace", color: "var(--hg-muted)", marginTop: 9, textAlign: "center" }}>
            Press the mic, or type a question and hit enter
          </div>
        </div>
      </div>

      {/* ── Reused real modals ─────────────────────────────────────────── */}
      <LogJobModal
        isOpen={flow === "logJob" || flow === "receipt"}
        onClose={() => closeFlow()}
        onSuccess={() => closeFlow({ key: "docs", text: "Job logged. It joins the record once countersigned." })}
        properties={properties}
      />
      <RequestQuoteModal
        isOpen={flow === "quote"}
        onClose={() => closeFlow()}
        onSuccess={() => { reloadQuotes(); closeFlow({ key: "jobs", text: "Quote request posted to verified pros." }); }}
        properties={properties}
      />
      {activePropertyId && (
        <AddRoomModal
          isOpen={flow === "room"}
          onClose={() => closeFlow()}
          onSuccess={() => closeFlow({ key: "rooms", text: "Room added to the record." })}
          propertyId={activePropertyId}
        />
      )}
      <RecurringServiceCreateModal
        open={flow === "recurring"}
        defaultPropertyId={activePropertyId ?? undefined}
        onClose={() => closeFlow()}
        onSuccess={() => closeFlow({ key: "maint", text: "Recurring service added to the schedule." })}
      />
      <UpgradeModal open={flow === "upgrade"} onClose={() => closeFlow()} />
      {activeProperty && (
        <InitListingModal
          open={flow === "listing"}
          onClose={() => closeFlow()}
          property={activeProperty as any}
          jobs={jobs}
          score={score}
        />
      )}
      <AwardBidModal
        requestId={awardRequestId}
        open={flow === "bids"}
        onClose={() => closeFlow()}
        onAwarded={() => { reloadQuotes(); closeFlow({ key: "jobs", text: "Bid awarded. The other bids on this job are closed." }); }}
      />
      <ChaseSignatureModal
        jobId={chaseJobId}
        jobs={jobs}
        open={flow === "chase"}
        onClose={() => closeFlow()}
        onSent={() => closeFlow({ key: "pros", text: "Reminder sent." })}
      />
    </div>
  );
}
