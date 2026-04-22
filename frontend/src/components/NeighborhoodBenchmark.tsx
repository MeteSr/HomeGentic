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
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

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
    percentile >= 75 ? COLORS.sage :
    percentile >= 50 ? COLORS.plum :
    percentile >= 25 ? COLORS.plumMid :
    COLORS.blush;

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
        background: COLORS.white,
        border: `1px solid ${COLORS.rule}`,
        borderRadius: RADIUS.card,
        padding: "1.25rem 1.5rem",
        boxShadow: SHADOWS.card,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MapPin size={14} color={COLORS.plumMid} />
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", fontWeight: 600, color: COLORS.plumMid }}>
            Neighborhood Rank · {zipCode}
          </span>
        </div>
        <button
          onClick={() => navigate(`/neighborhood/${zipCode}`)}
          style={{
            fontFamily: FONTS.sans,
            fontSize: "0.75rem",
            fontWeight: 500,
            color: COLORS.sage,
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
            background: COLORS.rule,
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
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", color: COLORS.plumMid }}>0</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", color: COLORS.plumMid }}>100</span>
        </div>
      </div>

      {/* Rank headline */}
      <div style={{ marginBottom: "0.4rem" }}>
        <span
          style={{
            fontFamily: FONTS.serif,
            fontWeight: 700,
            fontSize: "1rem",
            color: COLORS.plum,
          }}
        >
          {label}
        </span>
      </div>

      {/* Sub-text */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 300, color: COLORS.plumMid }}>
          Better than {percentile}% of {stats.sampleCount} homes
        </span>
        <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 300, color: COLORS.plumMid }}>
          {trendLabel}
        </span>
      </div>
    </div>
  );
}
