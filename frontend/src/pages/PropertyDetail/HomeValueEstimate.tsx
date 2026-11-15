/**
 * The index-based home value under the mortgage card: the value when the loan
 * was made, moved by the change in the FHFA House Price Index for the home's
 * state since then. An estimate, not an appraisal; the owner can use it as
 * their home value or keep their own.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { hudButtonStyle } from "@/components/hud";
import { getStateHpi } from "@/services/homeValueIndex";
import {
  HPI_SOURCE,
  indexEstimate,
  loanStartQuarter,
  quarterLabel,
  type IndexEstimate,
} from "@homegentic/shared/homeValueIndex";
import type { MortgageLoan } from "@homegentic/shared/mortgage";

const BODY = "'Hanken Grotesk',sans-serif";
const muted: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

export function HomeValueEstimate({
  loan,
  homeState,
  onUse,
}: {
  loan: MortgageLoan;
  homeState: string;
  onUse: (value: number) => void;
}) {
  const [est, setEst] = useState<IndexEstimate | null>(null);
  const { originalValue, firstPaymentDate } = loan;

  useEffect(() => {
    setEst(null);
    const start = loanStartQuarter(firstPaymentDate);
    if (!homeState || !originalValue || originalValue <= 0 || !start) return;
    let live = true;
    void getStateHpi(homeState).then((series) => {
      if (live && series) setEst(indexEstimate(originalValue, series, start));
    });
    return () => {
      live = false;
    };
  }, [homeState, originalValue, firstPaymentDate]);

  if (!est) return null;
  const state = homeState.trim().toUpperCase();
  const move = est.changePct >= 0 ? `up ${est.changePct}%` : `down ${Math.abs(est.changePct)}%`;
  return (
    <section
      aria-label="Index estimate"
      style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--hg-line)" }}
    >
      <span style={{ ...muted, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Index estimate
      </span>
      <div style={{ fontFamily: BODY, fontSize: "1.125rem", fontWeight: 700, color: "var(--hg-ink)" }}>
        {dollars(est.estimate)}
      </div>
      <p style={muted}>
        Your home value when you took out the loan, moved by home prices {move} in {state} from {quarterLabel(est.from)}{" "}
        to {quarterLabel(est.to)} ({HPI_SOURCE}). It follows prices across the state, not your home, so it's an
        estimate, not an appraisal.
      </p>
      {loan.currentValue !== est.estimate && (
        <div style={{ marginTop: "0.5rem" }}>
          <Button type="button" onClick={() => onUse(est.estimate)} style={hudButtonStyle("outline")}>
            Use {dollars(est.estimate)} as my home value
          </Button>
        </div>
      )}
    </section>
  );
}
