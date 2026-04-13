/**
 * MarketTimingAlert — 5.3.3
 *
 * Dashboard banner / card that shows the AI market-timing recommendation:
 *  • Listing score (0–100)
 *  • Estimated price premium range
 *  • List Now / Neutral / Wait badge
 *  • Market condition (hot / balanced / cool)
 *  • Days on market + reasoning points
 */

import React, { useEffect, useState } from "react";
import {
  marketTimingService,
  type ListingRecommendation,
} from "@/services/marketTimingService";
import { COLORS, FONTS } from "@/theme";

// ─── Design tokens ────────────────────────────────────────────────────────────

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.rust,
  green:    COLORS.sage,
  amber:    COLORS.plumMid,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecBadge({ rec }: { rec: string }) {
  const config = {
    list_now: { label: "List Now",  bg: S.green, color: "#fff" },
    wait:     { label: "Wait",      bg: S.rust,  color: "#fff" },
    neutral:  { label: "Neutral",   bg: S.amber, color: "#fff" },
  }[rec] ?? { label: rec, bg: S.inkLight, color: "#fff" };

  return (
    <span style={{
      display:       "inline-block",
      background:    config.bg,
      color:         config.color,
      fontFamily:    S.mono,
      fontSize:      "0.65rem",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      padding:       "3px 10px",
    }}>
      {config.label}
    </span>
  );
}

function MarketBadge({ condition }: { condition: string }) {
  const colors: Record<string, string> = {
    hot:      S.rust,
    balanced: S.amber,
    cool:     "#4A6FA5",
  };
  return (
    <span style={{
      display:       "inline-block",
      border:        `1px solid ${colors[condition] ?? S.inkLight}`,
      color:         colors[condition] ?? S.inkLight,
      fontFamily:    S.mono,
      fontSize:      "0.6rem",
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      padding:       "2px 8px",
      marginLeft:    "8px",
    }}>
      {condition}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  score: number;
  zip:   string;
}

export function MarketTimingAlert({ score, zip }: Props) {
  const [rec, setRec]       = useState<ListingRecommendation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketTimingService.getRecommendation({ score, zip })
      .then(setRec)
      .finally(() => setLoading(false));
  }, [score, zip]);

  if (loading) {
    return (
      <section
        role="region"
        aria-label="Market timing"
        style={{ padding: "24px", border: `1px solid ${S.rule}`, background: S.paper }}
      >
        <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>
          Analysing market conditions…
        </span>
      </section>
    );
  }

  if (!rec) return null;

  const { analysis } = rec;
  const premiumLow  = analysis.estimatedPremium.low;
  const premiumHigh = analysis.estimatedPremium.high;

  return (
    <section
      role="region"
      aria-label="Market timing"
      style={{
        border:     `1px solid ${S.rule}`,
        background: S.paper,
        padding:    "0",
      }}
    >
      {/* Header bar */}
      <div style={{
        borderBottom: `2px solid ${S.ink}`,
        padding:      "16px 24px",
        display:      "flex",
        alignItems:   "center",
        gap:          "12px",
      }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight }}>
          Market Timing
        </span>
        <RecBadge rec={analysis.recommendation} />
        <MarketBadge condition={analysis.marketCondition} />
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Headline */}
        <p style={{ fontFamily: S.serif, fontSize: "1.05rem", fontWeight: 700, color: S.ink, margin: "0 0 16px", lineHeight: 1.4 }}>
          {analysis.headline}
        </p>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "32px", marginBottom: "16px", flexWrap: "wrap" }}>
          <Stat label="Listing Score" value={`${analysis.listingScore}`} />
          {premiumHigh > 0 && (
            <Stat
              label="Est. Premium"
              value={`$${premiumLow.toLocaleString()} – $${premiumHigh.toLocaleString()}`}
            />
          )}
          <Stat label="Days on Market" value={`${analysis.daysOnMarket} days`} />
          <Stat label="Active Listings" value={analysis.activeListings.toLocaleString()} />
        </div>

        {/* Reasoning */}
        <ul style={{ margin: 0, padding: "0 0 0 1.1rem", listStyle: "disc" }}>
          {analysis.reasoning.map((r, i) => (
            <li key={i} style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.inkLight, marginBottom: "4px", lineHeight: 1.5 }}>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.07em", color: S.inkLight, marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontFamily: S.serif, fontSize: "1.1rem", fontWeight: 700, color: S.ink }}>
        {value}
      </div>
    </div>
  );
}
