/**
 * NegotiationPanel — 5.2.3
 *
 * Renders the "Let HomeGentic negotiate" opt-in toggle and per-quote analysis
 * inside QuoteDetailPage. Users must explicitly opt-in before any analysis runs.
 * HomeGentic never contacts contractors — analysis is for the homeowner only.
 */

import React, { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import { createNegotiationAgentService, type NegotiationAnalysis } from "@/services/negotiationAgentService";
import type { Quote, QuoteRequest } from "@/services/quote";
import { COLORS, FONTS } from "@/theme";

const UI = {
  mono:     FONTS.mono,
  serif:    FONTS.serif,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  plum:     COLORS.plum,
};

interface Props {
  request: QuoteRequest;
  quotes:  Quote[];
  zip:     string;
}

type AnalysisMap = Record<string, NegotiationAnalysis | "loading" | "error">;

export function NegotiationPanel({ request, quotes, zip }: Props) {
  const [svc]      = useState(() => createNegotiationAgentService());
  const [opted,    setOpted]    = useState(() => svc.hasConsent(request.id));
  const [analyses, setAnalyses] = useState<AnalysisMap>({});

  // When opting in, run analysis for all pending quotes
  useEffect(() => {
    if (!opted) {
      setAnalyses({});
      return;
    }

    const pendingQuotes = quotes.filter((q) => q.status === "pending");
    const next: AnalysisMap = {};
    for (const q of pendingQuotes) next[q.id] = "loading";
    setAnalyses(next);

    for (const q of pendingQuotes) {
      svc.analyzeQuote(q, request, zip)
        .then((result) =>
          setAnalyses((prev) => ({ ...prev, [q.id]: result }))
        )
        .catch(() =>
          setAnalyses((prev) => ({ ...prev, [q.id]: "error" }))
        );
    }
  }, [opted]);

  function handleToggle() {
    if (opted) {
      svc.revokeConsent(request.id);
      setOpted(false);
    } else {
      svc.grantConsent(request.id);
      setOpted(true);
    }
  }

  const pendingCount = quotes.filter((q) => q.status === "pending").length;
  if (pendingCount === 0) return null;

  return (
    <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, marginBottom: "1.5rem" }}>
      {/* Header row */}
      <label
        style={{
          display:     "flex",
          alignItems:  "center",
          justifyContent: "space-between",
          gap:         "1rem",
          padding:     "1rem 1.25rem",
          cursor:      "pointer",
          userSelect:  "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <Sparkles size={14} color={UI.plum} />
          <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
            HomeGentic Negotiation Analysis
          </span>
        </div>
        <input
          type="checkbox"
          checked={opted}
          onChange={handleToggle}
          style={{ width: "1rem", height: "1rem", cursor: "pointer", accentColor: UI.plum }}
        />
      </label>

      {/* Consent copy — always visible before opt-in */}
      {!opted && (
        <div style={{ padding: "0 1.25rem 1rem", borderTop: `1px solid ${UI.rule}` }}>
          <p style={{
            fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.04em",
            color: UI.inkLight, lineHeight: 1.6, marginTop: "0.75rem",
          }}>
            HomeGentic will compare these quotes against network-wide pricing data for {request.serviceType} work in your zip code.
            <strong style={{ color: UI.plum }}> HomeGentic never contacts contractors directly</strong> —
            the analysis is yours to act on. Enable the toggle above to opt in.
          </p>
        </div>
      )}

      {/* Per-quote analysis */}
      {opted && quotes.filter((q) => q.status === "pending").map((quote) => {
        const entry = analyses[quote.id];
        return (
          <QuoteAnalysisRow key={quote.id} quote={quote} entry={entry} />
        );
      })}
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function QuoteAnalysisRow({
  quote,
  entry,
}: {
  quote: Quote;
  entry: AnalysisMap[string] | undefined;
}) {
  const fmtK = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div
      style={{
        borderTop:  `1px solid ${UI.rule}`,
        padding:    "0.875rem 1.25rem",
        background: COLORS.white,
      }}
    >
      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.5rem" }}>
        Quote {quote.id.slice(-6)} · {fmtK(quote.amount)}
      </p>

      {!entry || entry === "loading" ? (
        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.06em" }}>
          Analyzing…
        </p>
      ) : entry === "error" ? (
        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: "#C94C2E" }}>
          Analysis unavailable — please try again.
        </p>
      ) : (
        <AnalysisDetail analysis={entry} />
      )}
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: NegotiationAnalysis }) {
  const fmtK = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const { verdict, percentile, rationale, benchmarkUsed, suggestedCounterCents } = analysis;

  const verdictColor =
    verdict === "fair"  ? COLORS.sage :
    verdict === "high"  ? "#C94C2E" :
    COLORS.plumMid;

  const VerdictIcon =
    verdict === "high" ? TrendingUp :
    verdict === "low"  ? TrendingDown :
    Minus;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Verdict badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <VerdictIcon size={13} color={verdictColor} />
        <span style={{
          fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          textTransform: "uppercase", color: verdictColor, fontWeight: 600,
        }}>
          {verdict} · {percentile}th percentile
        </span>
      </div>

      {/* Benchmark context */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: `1px solid ${UI.rule}`, borderLeft: `1px solid ${UI.rule}`,
        fontSize: "0.75rem",
      }}>
        {[
          { label: "Market p25",  value: fmtK(benchmarkUsed.p25) },
          { label: "Median",      value: fmtK(benchmarkUsed.median) },
          { label: "Market p75",  value: fmtK(benchmarkUsed.p75) },
        ].map((c) => (
          <div key={c.label} style={{ padding: "0.5rem 0.75rem", borderRight: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}`, background: COLORS.white }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>{c.label}</div>
            <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "0.875rem", lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Rationale */}
      <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.03em", color: UI.inkLight, lineHeight: 1.6 }}>
        {rationale}
      </p>

      {/* Suggested counter */}
      {suggestedCounterCents !== undefined && (
        <div style={{
          background: "#FFF5F3", border: "1px solid #F2C4BB",
          padding: "0.625rem 0.875rem",
        }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#C94C2E", marginBottom: "0.2rem" }}>
            Suggested counter offer
          </p>
          <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", lineHeight: 1, color: "#C94C2E" }}>
            {fmtK(suggestedCounterCents)}
          </p>
        </div>
      )}
    </div>
  );
}
