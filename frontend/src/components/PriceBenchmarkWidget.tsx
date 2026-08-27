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
import { V2_COLORS, V2_FONTS } from "@/theme";

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
      background: V2_COLORS.lblue,
      border:     `1px solid ${V2_COLORS.cobalTint}`,
      display:    "flex",
      flexDirection: "column",
      gap:        "0.25rem",
    }}>
      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.muted }}>
        Typical cost in {result.zipCode}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
        <span style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.1rem", color: V2_COLORS.ink }}>
          {fmt(result.low)}
        </span>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", color: V2_COLORS.muted }}>–</span>
        <span style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.1rem", color: V2_COLORS.ink }}>
          {fmt(result.high)}
        </span>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", color: V2_COLORS.muted, marginLeft: "0.25rem" }}>
          median {fmt(result.median)}
        </span>
      </div>
      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.muted }}>
        Based on {result.sampleSize} closed bids · {result.lastUpdated}
      </div>
    </div>
  );
}
