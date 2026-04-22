/**
 * NeighborhoodHealthPage (4.3.3)
 *
 * Public page at /neighborhood/:zipCode — no auth required.
 * Shows aggregate HomeGentic score data for the zip code:
 *   • Average and median scores
 *   • Score distribution (5-bucket bar chart)
 *   • Year-over-year trend
 *   • Top maintenance categories
 *   • Sample size
 */

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MapPin, TrendingUp, TrendingDown, Minus, ArrowLeft } from "lucide-react";
import { neighborhoodService, type ZipCodeStats } from "@/services/neighborhood";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

export default function NeighborhoodHealthPage() {
  const { zipCode } = useParams<{ zipCode: string }>();
  const [stats, setStats] = useState<ZipCodeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!zipCode) return;
    neighborhoodService
      .getZipStats(zipCode)
      .then(setStats)
      .catch((e) => console.error("[NeighborhoodHealthPage] zip stats load failed:", e))
      .finally(() => setLoading(false));
  }, [zipCode]);

  const maxBucketCount = stats
    ? Math.max(...stats.percentileBuckets.map((b) => b.count), 1)
    : 1;

  const trendIcon =
    stats?.trend.direction === "up"   ? <TrendingUp  size={16} color={COLORS.sage} /> :
    stats?.trend.direction === "down" ? <TrendingDown size={16} color={COLORS.blush} /> :
    <Minus size={16} color={COLORS.plumMid} />;

  const trendColor =
    stats?.trend.direction === "up"   ? COLORS.sage :
    stats?.trend.direction === "down" ? COLORS.blush :
    COLORS.plumMid;

  const trendText =
    stats?.trend.direction === "up"   ? `↑ Avg score up ${stats.trend.changePoints} pts this year` :
    stats?.trend.direction === "down" ? `↓ Avg score down ${Math.abs(stats?.trend.changePoints ?? 0)} pts this year` :
    "Avg score stable this year";

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white, fontFamily: UI.mono }}>
      {/* Top bar */}
      <div
        style={{
          borderBottom: `1px solid ${UI.rule}`,
          padding: "0.875rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          background: COLORS.white,
        }}
      >
        <Link
          to="/"
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: UI.inkLight, textDecoration: "none", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          <ArrowLeft size={12} />
          HomeGentic
        </Link>
        <span style={{ color: UI.rule }}>·</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <MapPin size={12} color={COLORS.plumMid} />
          <span style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
            Neighborhood Health · {zipCode}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        {/* Page title */}
        <h1
          style={{
            fontFamily: UI.serif,
            fontWeight: 900,
            fontSize: "2rem",
            color: UI.ink,
            marginBottom: "0.375rem",
          }}
        >
          {zipCode}
        </h1>
        <p style={{ fontSize: "0.65rem", color: UI.inkLight, letterSpacing: "0.08em", marginBottom: "2.5rem" }}>
          NEIGHBORHOOD HEALTH INDEX — HOMEGENTIC
        </p>

        {loading && (
          <p style={{ fontSize: "0.7rem", color: UI.inkLight }}>Loading…</p>
        )}

        {!loading && !stats && (
          <p style={{ fontSize: "0.7rem", color: UI.inkLight }}>No data available for this zip code.</p>
        )}

        {!loading && stats && (
          <>
            {/* Score summary row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "1px",
                background: UI.rule,
                border: `1px solid ${UI.rule}`,
                borderRadius: RADIUS.card,
                overflow: "hidden",
                marginBottom: "2rem",
                boxShadow: SHADOWS.card,
              }}
            >
              {[
                { label: "Average Score", value: stats.averageScore, sub: "out of 100" },
                { label: "Median Score",  value: stats.medianScore,  sub: "out of 100" },
                { label: "Homes Tracked", value: stats.sampleCount,  sub: "in this zip" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ background: COLORS.white, padding: "1.25rem 1.5rem" }}
                >
                  <div style={{ fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: UI.ink, marginBottom: "0.25rem" }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: "0.55rem", color: UI.inkLight }}>
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Trend */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.875rem 1.25rem",
                border: `1px solid ${UI.rule}`,
                borderRadius: RADIUS.card,
                marginBottom: "2rem",
                background: COLORS.white,
                boxShadow: SHADOWS.card,
              }}
            >
              {trendIcon}
              <span style={{ fontSize: "0.65rem", color: trendColor, letterSpacing: "0.06em" }}>
                {trendText}
              </span>
            </div>

            {/* Score distribution */}
            <div
              style={{
                border: `1px solid ${UI.rule}`,
                borderRadius: RADIUS.card,
                overflow: "hidden",
                marginBottom: "2rem",
                boxShadow: SHADOWS.card,
              }}
            >
              <div
                style={{
                  padding: "0.875rem 1.25rem",
                  borderBottom: `1px solid ${UI.rule}`,
                  background: COLORS.white,
                }}
              >
                <span style={{ fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight }}>
                  Score Distribution
                </span>
              </div>
              <div style={{ padding: "1.25rem 1.5rem", background: COLORS.white }}>
                {stats.percentileBuckets.map((bucket) => {
                  const barPct = (bucket.count / maxBucketCount) * 100;
                  const isMedianBucket =
                    stats.medianScore >= bucket.range[0] &&
                    stats.medianScore < bucket.range[1];
                  return (
                    <div
                      key={bucket.label}
                      style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.625rem" }}
                    >
                      <span
                        style={{
                          fontFamily: UI.mono,
                          fontSize: "0.55rem",
                          color: UI.inkLight,
                          width: "2.75rem",
                          flexShrink: 0,
                        }}
                      >
                        {bucket.label}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: UI.rule,
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${barPct}%`,
                            background: isMedianBucket ? COLORS.plum : COLORS.plumMid,
                            borderRadius: 4,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: UI.mono,
                          fontSize: "0.55rem",
                          color: UI.inkLight,
                          width: "3rem",
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {bucket.pct}%
                      </span>
                    </div>
                  );
                })}
                <p style={{ fontSize: "0.55rem", color: UI.inkLight, marginTop: "0.75rem" }}>
                  Darker bar = contains the median score
                </p>
              </div>
            </div>

            {/* Top maintenance categories */}
            <div
              style={{
                border: `1px solid ${UI.rule}`,
                borderRadius: RADIUS.card,
                overflow: "hidden",
                marginBottom: "2rem",
                boxShadow: SHADOWS.card,
              }}
            >
              <div
                style={{
                  padding: "0.875rem 1.25rem",
                  borderBottom: `1px solid ${UI.rule}`,
                  background: COLORS.white,
                }}
              >
                <span style={{ fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight }}>
                  Top Maintenance Categories
                </span>
              </div>
              <div style={{ background: COLORS.white }}>
                {stats.topMaintenanceSystems.map((sys, i) => (
                  <div
                    key={sys}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "0.875rem 1.25rem",
                      borderBottom: i < stats.topMaintenanceSystems.length - 1 ? `1px solid ${UI.rule}` : "none",
                    }}
                  >
                    <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.inkLight, width: "1.25rem", flexShrink: 0 }}>
                      {i + 1}.
                    </span>
                    <span style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.875rem", color: UI.ink }}>
                      {sys}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <p style={{ fontSize: "0.55rem", color: UI.inkLight, letterSpacing: "0.06em", lineHeight: 1.6 }}>
              Data reflects HomeGentic-tracked homes in {zipCode}.
              Scores are computed from verified maintenance records.
              Updated periodically as homeowners log new jobs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
