/**
 * The one review card for a multi-step assistant task (assistantPlan.ts):
 * every write the assistant wants to make, with its real arguments, so a
 * prompt-injected plan can't hide what it does. Each step is ticked by
 * default; nothing is saved until the user presses Save.
 */
import { useState } from "react";
import { describePlanStep, TASK_LABELS, type AssistantPlan } from "@/services/assistantPlan";

/** The address of the home a plan's steps act on, or null when it isn't one of these homes. */
export function planHomeAddress(
  plan: AssistantPlan,
  homes: { id: unknown; address: string; city?: string; state?: string }[],
): string | null {
  const id = String(plan.steps[0]?.input.property_id ?? "");
  const home = homes.find((h) => String(h.id) === id);
  if (!home) return null;
  return [home.address, [home.city, home.state].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

const MONO = "'JetBrains Mono',monospace";
const BODY = "'Hanken Grotesk',sans-serif";

export function PlanReviewCard({
  plan,
  homeAddress,
  onApprove,
  onDismiss,
}: {
  plan: AssistantPlan;
  /** The address of the home the steps name (their property_id), or null if it isn't one of the user's. */
  homeAddress: string | null;
  onApprove: (stepIndexes: number[]) => void;
  onDismiss: () => void;
}) {
  const [ticked, setTicked] = useState<boolean[]>(() => plan.steps.map(() => true));
  const chosen = ticked.flatMap((on, i) => (on ? [i] : []));
  const toggle = (i: number) => setTicked((t) => t.map((on, j) => (j === i ? !on : on)));

  return (
    <div
      style={{
        marginTop: 18,
        border: "1px solid var(--hg-blue-edge)",
        background: "var(--hg-blue-fill)",
        borderRadius: 14,
        padding: "13px 15px",
      }}
    >
      <div
        style={{
          font: `500 9px/1 ${MONO}`,
          letterSpacing: ".14em",
          color: "var(--hg-blue-ink)",
          textTransform: "uppercase",
        }}
      >
        {TASK_LABELS[plan.task]}
      </div>
      <div style={{ font: `700 15px/1.35 ${BODY}`, color: "var(--hg-ink)", marginTop: 8 }}>{plan.title}</div>
      <div
        style={{
          font: `600 12.5px/1.5 ${BODY}`,
          color: homeAddress ? "var(--hg-ink-2)" : "var(--hg-bad)",
          marginTop: 4,
        }}
      >
        {homeAddress
          ? `For ${homeAddress}`
          : "These steps name a home that isn't one of your homes. Cancel unless you're sure."}
      </div>
      <div style={{ font: `400 12.5px/1.5 ${BODY}`, color: "var(--hg-muted)", marginTop: 4 }}>
        Nothing is saved until you approve. Untick anything you don't want.
      </div>

      <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
        {plan.steps.map((step, i) => {
          const d = describePlanStep(step);
          const id = `plan-step-${i}`;
          return (
            <li key={id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid var(--hg-line)" }}>
              <input
                id={id}
                type="checkbox"
                checked={ticked[i]}
                onChange={() => toggle(i)}
                aria-label={`${d.label}: ${d.details[0] ?? ""}`}
                style={{ marginTop: 3, width: 16, height: 16, flex: "none", accentColor: "#2B34FF" }}
              />
              <label htmlFor={id} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ font: `600 13.5px/1.4 ${BODY}`, color: "var(--hg-ink)" }}>{d.label}</div>
                {d.details.map((line, k) => (
                  <div
                    key={k}
                    style={{
                      font: `400 13px/1.45 ${BODY}`,
                      color: "var(--hg-ink-2)",
                      marginTop: 2,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {line}
                  </div>
                ))}
                {step.why && (
                  <div style={{ font: `400 12px/1.45 ${BODY}`, color: "var(--hg-muted)", marginTop: 4 }}>
                    Why: {step.why}
                  </div>
                )}
                <div style={{ font: `400 12px/1.45 ${BODY}`, color: "var(--hg-muted)", marginTop: 2 }}>{d.note}</div>
              </label>
            </li>
          );
        })}
      </ol>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onApprove(chosen)}
          disabled={chosen.length === 0}
          style={{
            minHeight: 36,
            padding: "0 16px",
            borderRadius: 100,
            background: "#2B34FF",
            border: "none",
            color: "#fff",
            font: `600 12.5px/1 ${BODY}`,
            cursor: chosen.length ? "pointer" : "not-allowed",
            opacity: chosen.length ? 1 : 0.5,
          }}
        >
          Save {chosen.length} step{chosen.length === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
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
          Cancel
        </button>
      </div>
    </div>
  );
}
