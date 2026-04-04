/**
 * §17.1.3 — Inline price benchmark widget for quote request page.
 * §17.1.5 — Hidden when sampleSize < 5.
 */

import React, { useEffect, useState } from "react";
import {
  getPriceBenchmark,
  hasSufficientSamples,
  type PriceBenchmarkResult,
} from "@/services/priceBenchmark";
import { COLORS, FONTS } from "@/theme";

interface PriceBenchmarkWidgetProps {
  serviceType: string;
  zipCode:     string;
}

export function PriceBenchmarkWidget({ serviceType, zipCode }: PriceBenchmarkWidgetProps) {
  const [result, setResult] = useState<PriceBenchmarkResult | null>(null);

  useEffect(() => {
    if (!serviceType || !zipCode) return;
    getPriceBenchmark(serviceType, zipCode).then(setResult);
  }, [serviceType, zipCode]);

  if (!result || !hasSufficientSamples(result)) return null;

  const fmt = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");

  return (
    <div style={{
      padding:    "0.75rem 1rem",
      background: COLORS.sageLight,
      border:     `1px solid ${COLORS.sageMid}`,
      display:    "flex",
      flexDirection: "column",
      gap:        "0.25rem",
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.plumMid }}>
        Typical cost in {result.zipCode}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
        <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.1rem", color: COLORS.plum }}>
          {fmt(result.low)}
        </span>
        <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: COLORS.plumMid }}>–</span>
        <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.1rem", color: COLORS.plum }}>
          {fmt(result.high)}
        </span>
        <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.plumMid, marginLeft: "0.25rem" }}>
          median {fmt(result.median)}
        </span>
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: "0.55rem", color: COLORS.plumMid }}>
        Based on {result.sampleSize} closed bids · {result.lastUpdated}
      </div>
    </div>
  );
}
