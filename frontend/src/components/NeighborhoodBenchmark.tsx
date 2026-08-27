/**
 * NeighborhoodBenchmark (4.3.2)
 *
 * Shows a homeowner how their HomeGentic score ranks within their zip code.
 * E.g. "Your score is in the top 23% of 78701 — better than 77% of homes."
 *
 * Props:
 *   zipCode  – from the property record
 *   score    – current computed HomeGentic score (0–100)
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { neighborhoodService, getPercentileRank, type ZipCodeStats } from "@/services/neighborhood";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

interface Props {
  zipCode: string;
  score: number;
}

export function NeighborhoodBenchmark({ zipCode, score }: Props) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ZipCodeStats | null>(null);

  useEffect(() => {
    if (!zipCode) return;
    neighborhoodService.getZipStats(zipCode).then(setStats).catch(() => {}); // optional stats widget; no data → widget renders empty, which is acceptable
  }, [zipCode]);

  if (!stats || !zipCode) return null;

  const percentile = getPercentileRank(score, stats);
  const topPct     = 100 - percentile;          // "top X%"
  const barWidth   = Math.max(2, Math.min(100, percentile));

  // Colour the bar by quartile
  const barColor =
    percentile >= 75 ? V2_COLORS.blue :
    percentile >= 50 ? V2_COLORS.ink :
    percentile >= 25 ? V2_COLORS.muted :
    V2_COLORS.attentionBg;

  const label =
    topPct <= 10  ? "Top 10% in your zip" :
    topPct <= 25  ? `Top 25% in ${zipCode}` :
    topPct <= 50  ? `Above average in ${zipCode}` :
    topPct <= 75  ? `Average range in ${zipCode}` :
    `Below average in ${zipCode}`;

  const trendLabel =
    stats.trend.direction === "up"     ? `↑ Avg score up ${stats.trend.changePoints} pts this year` :
    stats.trend.direction === "down"   ? `↓ Avg score down ${Math.abs(stats.trend.changePoints)} pts this year` :
    "Avg score stable this year";

  return (
    <div
      style={{
        background: V2_COLORS.paper,
        border: `1px solid ${V2_COLORS.border}`,
        borderRadius: V2_RADIUS.card,
        padding: "1.25rem 1.5rem",
        boxShadow: V2_SHADOWS.card,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MapPin size={14} color={V2_COLORS.muted} />
          <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.muted }}>
            Neighborhood Rank · {zipCode}
          </span>
        </div>
        <button
          onClick={() => navigate(`/neighborhood/${zipCode}`)}
          style={{
            fontFamily: V2_FONTS.body,
            fontSize: "0.75rem",
            fontWeight: 500,
            color: V2_COLORS.blue,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          View area →
        </button>
      </div>

      {/* Percentile bar */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div
          style={{
            height: 6,
            background: V2_COLORS.border,
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: "0.4rem",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${barWidth}%`,
              background: barColor,
              borderRadius: 3,
              transition: "width 0.5s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.55rem", color: V2_COLORS.muted }}>0</span>
          <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.55rem", color: V2_COLORS.muted }}>100</span>
        </div>
      </div>

      {/* Rank headline */}
      <div style={{ marginBottom: "0.4rem" }}>
        <span
          style={{
            fontFamily: V2_FONTS.display,
            fontWeight: 700,
            fontSize: "1rem",
            color: V2_COLORS.ink,
          }}
        >
          {label}
        </span>
      </div>

      {/* Sub-text */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.muted }}>
          Better than {percentile}% of {stats.sampleCount} homes
        </span>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.muted }}>
          {trendLabel}
        </span>
      </div>
    </div>
  );
}
