/**
 * "Thinking of selling?" on the dashboard: four weeks a year per home (its own
 * weeks, so prompts spread out), only where enough verified agents serve the
 * city for Bid to List to be worth it, and dismissible until next year.
 * Copy never promises a commission level or a saving.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentService } from "@/services/agent";
import { bidToListOpen, sellPromptDismissKey, sellPromptOnDashboard } from "@homegentic/shared/sellPrompt";

const MONO = "'JetBrains Mono',monospace";
const BODY = "'Hanken Grotesk',sans-serif";

function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function SellPromptCard({
  propertyId,
  city,
  now = Date.now(),
}: {
  propertyId: string;
  city: string;
  now?: number;
}) {
  const navigate = useNavigate();
  const key = sellPromptDismissKey(propertyId, now);
  const due = !!city && sellPromptOnDashboard(propertyId, now) && !dismissed(key);
  const [agents, setAgents] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

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
    try {
      localStorage.setItem(key, "1");
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
      <p style={{ font: `400 13.5px/1.5 ${BODY}`, color: "var(--hg-ink-2)", margin: "6px 0 0" }}>
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
