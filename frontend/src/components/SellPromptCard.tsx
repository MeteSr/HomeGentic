/**
 * "Thinking of selling?" on the dashboard: four weeks a year per home (its own
 * weeks, so prompts spread out), and also whenever the HomeGentic score or the
 * index estimate on the mortgage card has risen enough (thresholds in
 * @homegentic/shared/sellPrompt). Only where enough verified agents serve the
 * city for Bid to List to be worth it. "Not now" hides the yearly prompt until
 * next year and a move prompt until the next move.
 * Copy never promises a commission level or a saving.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentService } from "@/services/agent";
import { mortgageLoanService } from "@/services/mortgageLoan";
import { getStateHpi } from "@/services/homeValueIndex";
import {
  bidToListOpen,
  indexValueRise,
  scoreRise,
  sellPromptDismissKey,
  sellPromptMoveKey,
  sellPromptOnDashboard,
} from "@homegentic/shared/sellPrompt";
import { loanStartQuarter, quarterLabel, type HpiPoint } from "@homegentic/shared/homeValueIndex";
import type { MortgageLoan } from "@homegentic/shared/mortgage";

const MONO = "'JetBrains Mono',monospace";
const BODY = "'Hanken Grotesk',sans-serif";
const TEXT: React.CSSProperties = { font: `400 13.5px/1.5 ${BODY}`, color: "var(--hg-ink-2)", margin: "6px 0 0" };

function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

interface MoveSeen {
  score: number | null;
  value: number | null;
}

/** The score and index estimate when the owner last said "Not now". */
function moveSeen(propertyId: string): MoveSeen {
  try {
    const raw = JSON.parse(localStorage.getItem(sellPromptMoveKey(propertyId)) ?? "null");
    return {
      score: typeof raw?.score === "number" ? raw.score : null,
      value: typeof raw?.value === "number" ? raw.value : null,
    };
  } catch {
    return { score: null, value: null };
  }
}

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function SellPromptCard({
  propertyId,
  city,
  state,
  score,
  scoreHistory,
  now = Date.now(),
}: {
  propertyId: string;
  city: string;
  /** The home's state, for the house price index. */
  state: string;
  /** The current HomeGentic score and its weekly snapshots (scoreService). */
  score: number;
  scoreHistory: { score: number; timestamp: number }[];
  now?: number;
}) {
  const navigate = useNavigate();
  const key = sellPromptDismissKey(propertyId, now);
  const yearly = !!city && sellPromptOnDashboard(propertyId, now) && !dismissed(key);
  const seen = moveSeen(propertyId);
  const [valueData, setValueData] = useState<{ loan: MortgageLoan; series: HpiPoint[] } | null>(null);
  const start = valueData ? loanStartQuarter(valueData.loan.firstPaymentDate) : null;
  const scoreMove = city ? scoreRise(scoreHistory, score, now, seen.score) : null;
  const valueMove =
    city && valueData ? indexValueRise(valueData.loan.originalValue, valueData.series, start, seen.value) : null;
  const due = yearly || !!scoreMove || !!valueMove;
  const [agents, setAgents] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  // The index estimate needs the loan's original value and start, and the state's index.
  useEffect(() => {
    setValueData(null);
    if (!city || !state.trim()) return;
    let live = true;
    mortgageLoanService
      .get(propertyId)
      .then(async (loan) => {
        if (!loan?.originalValue || !loanStartQuarter(loan.firstPaymentDate)) return;
        const series = await getStateHpi(state);
        if (live && series) setValueData({ loan, series });
      })
      .catch(() => {
        /* no value check this visit */
      });
    return () => {
      live = false;
    };
  }, [propertyId, city, state]);

  useEffect(() => {
    setAgents(null);
    if (!due) return;
    let live = true;
    agentService
      .countVerifiedAgents([city])
      .then(([n]) => live && setAgents(n ?? 0))
      .catch(() => live && setAgents(0));
    return () => {
      live = false;
    };
  }, [due, city]);

  if (!due || hidden || agents === null || !bidToListOpen(agents)) return null;

  const notNow = () => {
    // Remember where the score and estimate stood, so only a further rise brings it back.
    const estimate =
      valueData && start ? (indexValueRise(valueData.loan.originalValue, valueData.series, start)?.estimate ?? null) : null;
    try {
      if (yearly) localStorage.setItem(key, "1");
      localStorage.setItem(
        sellPromptMoveKey(propertyId),
        JSON.stringify({ score: Math.max(score, seen.score ?? 0), value: estimate ?? seen.value }),
      );
    } catch {
      /* private mode: hide for this visit only */
    }
    setHidden(true);
  };

  return (
    <section
      aria-label="Thinking of selling?"
      style={{
        marginTop: 16,
        maxWidth: 580,
        border: "1px solid var(--hg-line-2)",
        borderRadius: 16,
        padding: "12px 15px",
      }}
    >
      <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".14em", color: "var(--hg-blue-ink)" }}>BID TO LIST</div>
      <div style={{ font: `700 15px/1.35 ${BODY}`, color: "var(--hg-ink)", marginTop: 8 }}>Thinking of selling?</div>
      {scoreMove && (
        <p style={TEXT}>
          Your HomeGentic score went from {scoreMove.from} to {scoreMove.to} since {shortDate(scoreMove.sinceMs)}.
        </p>
      )}
      {valueMove && (
        <p style={TEXT}>
          Home prices in {state.trim().toUpperCase()} rose {valueMove.changePct}% from {quarterLabel(valueMove.from)} to{" "}
          {quarterLabel(valueMove.to)}, which puts the index estimate on your mortgage card at{" "}
          {dollars(valueMove.estimate)}. It follows prices across the state, so it's an estimate, not an appraisal.
        </p>
      )}
      <p style={TEXT}>
        {agents} verified agents serve {city}. Post your home and they bid for the listing with their commission and
        marketing plan. Agents set their own terms, and you choose. HomeGentic charges the winning agent, not you.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => navigate(`/listing/new?propertyId=${encodeURIComponent(propertyId)}`)}
          style={{
            minHeight: 36,
            padding: "0 16px",
            borderRadius: 100,
            background: "#2B34FF",
            border: "none",
            color: "#fff",
            font: `600 12.5px/1 ${BODY}`,
            cursor: "pointer",
          }}
        >
          See how Bid to List works
        </button>
        <button
          type="button"
          onClick={notNow}
          style={{
            minHeight: 36,
            padding: "0 16px",
            borderRadius: 100,
            background: "transparent",
            border: "1.5px solid var(--hg-line-2)",
            color: "var(--hg-muted)",
            font: `600 12.5px/1 ${BODY}`,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
