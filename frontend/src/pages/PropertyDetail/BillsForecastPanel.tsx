import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Sparkles, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { Panel } from "@/components/hud";
import type { BillRecord, RecurringExpense } from "@/services/billService";
import { buildBillsForecast, SERIES_LABELS, type Insight, type SeriesForecast } from "@/services/billsForecast";
import { getBillsNarrative, type BillsNarrative } from "@/services/billsIntelligence";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY    = "'Hanken Grotesk',sans-serif";
const MONTHS  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function compactUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars < 1000 ? `$${Math.round(dollars)}` : `$${+(dollars / 1000).toFixed(1)}k`;
}

const monthLong  = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3);

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

const caption: React.CSSProperties = {
  fontFamily: BODY, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--hg-muted)",
};

// ─── Chart ─────────────────────────────────────────────────────────────────────

const DEFAULT_W = 720, PLOT_H = 170, AXIS_L = 44, AXIS_B = 26, TOP = 8, BAR_W = 24, GAP = 2, R = 4;

/** Column segment with a rounded data-end at the top and a square base. */
function topRoundedPath(x: number, yTop: number, yBottom: number, w: number): string {
  const r = Math.min(R, (yBottom - yTop) / 2, w / 2);
  return `M${x},${yBottom}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBottom}Z`;
}

type Totals = { month: string; housingCents: number; utilityCents: number };

function ForecastChart({ totals }: { totals: Totals[] }) {
  const [active, setActive] = useState<number | null>(null);
  // Draw at the container's real pixel width so text and bar sizes stay constant.
  const boxRef = useRef<HTMLDivElement>(null);
  const [VIEW_W, setViewW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setViewW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max  = Math.max(1, ...totals.map((t) => t.housingCents + t.utilityCents));
  const step = niceStep(max);
  const top  = Math.ceil(max / step) * step;
  const y    = (cents: number) => TOP + PLOT_H - (cents / top) * PLOT_H;
  const slot = (VIEW_W - AXIS_L) / totals.length;
  const baseline = y(0);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const hovered = active != null ? totals[active] : null;
  const hoveredX = active != null ? AXIS_L + slot * active + slot / 2 : 0;
  // Sit beside the hovered column, never on top of it.
  const onLeftHalf = hoveredX < VIEW_W / 2;
  const tipLeft = onLeftHalf ? hoveredX + BAR_W / 2 + 10 : hoveredX - BAR_W / 2 - 10;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${TOP + PLOT_H + AXIS_B}`}
        width="100%"
        role="group"
        aria-label="Projected monthly housing and utility costs for the next 12 months"
        style={{ display: "block", overflow: "visible" }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={AXIS_L} x2={VIEW_W} y1={y(t)} y2={y(t)} stroke="var(--hg-line)" strokeWidth={1} />
            <text x={AXIS_L - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--hg-muted)"
              style={{ fontFamily: BODY, fontVariantNumeric: "tabular-nums" }}>
              {compactUsd(t)}
            </text>
          </g>
        ))}
        {totals.map((t, i) => {
          const x      = AXIS_L + slot * i + (slot - BAR_W) / 2;
          const hTop   = y(t.housingCents);
          const both   = t.housingCents > 0 && t.utilityCents > 0;
          const uBase  = both ? hTop - GAP : hTop;
          const uTop   = uBase - (t.utilityCents / top) * PLOT_H;
          const dim    = active != null && active !== i;
          const total  = t.housingCents + t.utilityCents;
          return (
            <g
              key={t.month}
              tabIndex={0}
              aria-label={`${monthLong(t.month)}: ${usd(total)} total — housing ${usd(t.housingCents)}, utilities ${usd(t.utilityCents)}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              style={{ outline: "none", cursor: "default", opacity: dim ? 0.45 : 1, transition: "opacity 120ms" }}
            >
              <rect x={AXIS_L + slot * i} y={TOP} width={slot} height={PLOT_H + AXIS_B} fill="transparent" />
              {t.housingCents > 0 && (
                t.utilityCents > 0
                  ? <rect x={x} y={hTop} width={BAR_W} height={baseline - hTop} fill="var(--hg-viz-1)" />
                  : <path d={topRoundedPath(x, hTop, baseline, BAR_W)} fill="var(--hg-viz-1)" />
              )}
              {t.utilityCents > 0 && (
                <path d={topRoundedPath(x, uTop, uBase, BAR_W)} fill="var(--hg-viz-2)" />
              )}
              <text x={AXIS_L + slot * i + slot / 2} y={baseline + 17} textAnchor="middle" fontSize={11}
                fill={active === i ? "var(--hg-ink)" : "var(--hg-muted)"} style={{ fontFamily: BODY }}>
                {monthShort(t.month)}{t.month.endsWith("-01") || i === 0 ? ` ’${t.month.slice(2, 4)}` : ""}
              </text>
            </g>
          );
        })}
        <line x1={AXIS_L} x2={VIEW_W} y1={baseline} y2={baseline} stroke="var(--hg-line-2)" strokeWidth={1} />
      </svg>

      {hovered && (
        <div
          role="tooltip"
          style={{
            position: "absolute", top: 0, left: tipLeft, transform: onLeftHalf ? "none" : "translateX(-100%)",
            pointerEvents: "none", background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)",
            borderRadius: 10, boxShadow: "0 6px 20px var(--hg-shadow)", padding: "0.6rem 0.75rem", minWidth: 170,
            fontFamily: BODY, zIndex: 2,
          }}
        >
          <div style={{ fontSize: "0.7rem", color: "var(--hg-muted)", marginBottom: "0.25rem" }}>{monthLong(hovered.month)}</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--hg-ink)", marginBottom: "0.35rem" }}>
            {usd(hovered.housingCents + hovered.utilityCents)}
          </div>
          {([["Housing", hovered.housingCents, "var(--hg-viz-1)"], ["Utilities", hovered.utilityCents, "var(--hg-viz-2)"]] as const).map(([name, cents, color]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--hg-ink-3)" }}>
              <span aria-hidden style={{ width: 12, height: 2, borderRadius: 1, background: color }} />
              <span style={{ fontWeight: 600, color: "var(--hg-ink)", fontVariantNumeric: "tabular-nums" }}>{usd(cents)}</span>
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Insights ──────────────────────────────────────────────────────────────────

function insightView(i: Insight): { icon: React.ReactNode; title: string; detail: string } {
  const label = SERIES_LABELS[i.key];
  switch (i.type) {
    case "upcoming":
      return { icon: <CalendarClock size={16} />, title: `${label} · ${usd(i.amountCents)} due`, detail: `Scheduled for ${monthLong(i.month)}.` };
    case "yoy":
      return {
        icon: i.changePct > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
        title: `${label} ${i.changePct > 0 ? "up" : "down"} ${Math.abs(i.changePct)}% vs last year`,
        detail: `${usd(i.recentCents)} over the last ${i.months} months with bills, against ${usd(i.priorCents)} the year before.`,
      };
    case "seasonal":
      return {
        icon: <Waves size={16} />,
        title: `${label} peaks in ${MONTHS[i.peakMonth - 1]}`,
        detail: `About ${usd(i.peakCents)} in ${MONTHS[i.peakMonth - 1]} vs ${usd(i.troughCents)} in ${MONTHS[i.troughMonth - 1]}.`,
      };
  }
}

const METHOD_TEXT: Record<SeriesForecast["method"], string> = {
  schedule: "Scheduled", seasonal: "Seasonal pattern", average: "Recent average",
};

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function BillsForecastPanel({ bills, expenses }: { bills: BillRecord[]; expenses: RecurringExpense[] }) {
  const forecast = useMemo(() => buildBillsForecast(bills, expenses), [bills, expenses]);
  const [narrative, setNarrative] = useState<BillsNarrative | null>(null);
  const [narrativeState, setNarrativeState] = useState<"loading" | "done" | "failed">("loading");
  const [showTable, setShowTable] = useState(false);

  const hasData = forecast.series.length > 0;
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    setNarrativeState("loading");
    // Debounce so a burst of edits to housing costs makes one request.
    const timer = setTimeout(() => {
      getBillsNarrative(forecast)
        .then((n) => { if (!cancelled) { setNarrative(n); setNarrativeState("done"); } })
        .catch(() => { if (!cancelled) setNarrativeState("failed"); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [forecast, hasData]);

  if (!hasData) return null;

  const peak = forecast.monthlyTotals.reduce((a, b) =>
    b.housingCents + b.utilityCents > a.housingCents + a.utilityCents ? b : a);
  const lowConfidence = forecast.series.some((s) => s.confidence === "low");

  return (
    <section aria-label="Forecast and patterns" style={{ marginBottom: "2.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ fontFamily: DISPLAY, fontSize: "1.25rem", fontWeight: 700, color: "var(--hg-ink)", margin: 0 }}>
          Forecast &amp; Patterns
        </h3>
        <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", margin: "0.25rem 0 0" }}>
          The next 12 months, projected from your housing schedules and bill history.
        </p>
      </div>

      <Panel style={{ padding: "1.25rem 1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem 2.5rem", alignItems: "flex-end", marginBottom: "1.25rem" }}>
          <div>
            <div style={caption}>Next 12 months</div>
            <div data-testid="forecast-total" style={{ fontFamily: BODY, fontSize: "2rem", fontWeight: 700, color: "var(--hg-ink)", lineHeight: 1.1 }}>
              {usd(forecast.next12TotalCents)}
            </div>
          </div>
          <div>
            <div style={caption}>Average month</div>
            <div data-testid="forecast-avg" style={{ fontFamily: BODY, fontSize: "1.25rem", fontWeight: 600, color: "var(--hg-ink)" }}>
              {usd(forecast.avgMonthlyCents)}
            </div>
          </div>
          <div>
            <div style={caption}>Heaviest month</div>
            <div style={{ fontFamily: BODY, fontSize: "1.25rem", fontWeight: 600, color: "var(--hg-ink)" }}>
              {monthLong(peak.month)} · {usd(peak.housingCents + peak.utilityCents)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "1rem", fontFamily: BODY, fontSize: "0.8rem", color: "var(--hg-ink-3)" }}>
            {([["Housing", "var(--hg-viz-1)"], ["Utilities", "var(--hg-viz-2)"]] as const).map(([name, color]) => (
              <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                {name}
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-blue-ink)", padding: 0 }}
          >
            {showTable ? "Show chart" : "Show as table"}
          </button>
        </div>

        {showTable ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: BODY, fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                {["Month", "Housing", "Utilities", "Total"].map((h) => (
                  <th key={h} style={{ ...caption, textAlign: h === "Month" ? "left" : "right", padding: "0.4rem 0.5rem", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.monthlyTotals.map((t) => (
                <tr key={t.month} style={{ borderTop: "1px solid var(--hg-line)" }}>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--hg-ink)" }}>{monthLong(t.month)}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--hg-ink-3)" }}>{usd(t.housingCents)}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--hg-ink-3)" }}>{usd(t.utilityCents)}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--hg-ink)", fontWeight: 600 }}>{usd(t.housingCents + t.utilityCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ForecastChart totals={forecast.monthlyTotals} />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.5rem 1.5rem", marginTop: "1.25rem", borderTop: "1px solid var(--hg-line)", paddingTop: "1rem" }}>
          {forecast.series.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontFamily: BODY, fontSize: "0.85rem" }}>
              <span style={{ color: "var(--hg-ink)" }}>
                {s.label}
                <span style={{ color: "var(--hg-muted)", fontSize: "0.75rem" }}>
                  {" · "}{METHOD_TEXT[s.method]}{s.method !== "schedule" && `, ${s.confidence} confidence`}
                </span>
              </span>
              <span style={{ color: "var(--hg-ink)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{usd(s.next12Cents)}</span>
            </div>
          ))}
        </div>
        {lowConfidence && (
          <p style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", margin: "0.75rem 0 0" }}>
            Some utilities have only a few months of bills — their forecast will sharpen as you add more.
          </p>
        )}
      </Panel>

      {forecast.insights.length > 0 && (
        <ul aria-label="Patterns" style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
          {forecast.insights.map((i, idx) => {
            const v = insightView(i);
            return (
              <li key={idx} style={{ display: "flex", gap: "0.75rem", padding: "0.9rem 1rem", border: "1px solid var(--hg-line)", borderRadius: 12, background: "var(--hg-surface)" }}>
                <span aria-hidden style={{ color: "var(--hg-blue-ink)", marginTop: "0.1rem" }}>{v.icon}</span>
                <div>
                  <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: "0.875rem", color: "var(--hg-ink)" }}>{v.title}</div>
                  <div style={{ fontFamily: BODY, fontSize: "0.8rem", color: "var(--hg-muted)", marginTop: "0.15rem", lineHeight: 1.5 }}>{v.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {narrativeState !== "failed" && (
        <div aria-live="polite" style={{ marginTop: "1rem", padding: "1rem 1.25rem", borderRadius: 12, background: "var(--hg-blue-wash)", border: "1px solid var(--hg-blue-edge)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", ...caption, color: "var(--hg-blue-ink)", marginBottom: "0.4rem" }}>
            <Sparkles size={12} /> What this means
          </div>
          {narrativeState === "loading" || !narrative ? (
            <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-muted)", margin: 0 }}>Analyzing your costs…</p>
          ) : (
            <>
              <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-ink)", margin: 0, lineHeight: 1.6 }}>{narrative.summary}</p>
              {narrative.tips.length > 0 && (
                <ul style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-ink-3)", margin: "0.5rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.6 }}>
                  {narrative.tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
              {narrative.source === "ai" && (
                <p style={{ fontFamily: BODY, fontSize: "0.7rem", color: "var(--hg-muted)", margin: "0.5rem 0 0" }}>
                  Written by AI from the figures above.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
