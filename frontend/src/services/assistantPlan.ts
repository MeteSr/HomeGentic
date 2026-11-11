/**
 * Multi-step assistant tasks: plan, review, run (audits/icp-aiware-2026-11-10.md,
 * opportunity 3). The assistant first reads (prepare_home_task and the other
 * read-only tools), then calls propose_plan once with every write it wants to
 * make. The browser checks the plan here, shows it on one review card, and
 * runs only the steps the user ticks. Nothing is saved before they approve.
 *
 * Writes stay curated (opportunity 4): a plan step can only be one of
 * PLAN_STEP_TOOLS. Bids, signatures, transfers, payments and account changes
 * are never plan steps; they keep their own confirmation or stay off the
 * assistant entirely.
 */
import type { ToolCallResult } from "./agentTools";

export const TASK_KINDS = ["storm_prep", "insurance_claim", "closing_handoff"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_LABELS: Record<TaskKind, string> = {
  storm_prep: "Storm prep",
  insurance_claim: "Insurance claim packet",
  closing_handoff: "Closing handoff check",
};

/** The writes a plan may contain, each with the fields it can't run without. */
const STEP_REQUIRED = {
  schedule_maintenance_task: ["property_id", "system_name", "task_description", "planned_year"],
  create_quote_request: ["property_id", "service_type", "description", "urgency"],
  create_insurance_claim: ["property_id", "title", "date_of_loss"],
  share_report: ["property_id", "visibility"],
} as const;

export type PlanStepTool = keyof typeof STEP_REQUIRED;
export const PLAN_STEP_TOOLS: ReadonlySet<PlanStepTool> = new Set(Object.keys(STEP_REQUIRED) as PlanStepTool[]);
export const MAX_PLAN_STEPS = 8;
const MAX_TITLE = 120;
const MAX_WHY = 300;

export interface PlanStep {
  tool: PlanStepTool;
  input: Record<string, unknown>;
  /** The assistant's one-line reason, shown on the card. */
  why: string;
}

export interface AssistantPlan {
  task: TaskKind;
  title: string;
  steps: PlanStep[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

/** Checks what the model sent as propose_plan's input. Returns the plan, or what's wrong with it. */
export function validatePlan(input: unknown): { plan: AssistantPlan } | { error: string } {
  if (!isObject(input)) return { error: "propose_plan needs task, title and steps" };
  const { task, title, steps } = input;
  if (!TASK_KINDS.includes(task as TaskKind)) return { error: `Unknown task. Use one of: ${TASK_KINDS.join(", ")}` };
  if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE) {
    return { error: `Give the plan a title of at most ${MAX_TITLE} characters` };
  }
  if (!Array.isArray(steps) || steps.length === 0)
    return { error: "A plan needs at least one step. If nothing needs saving, answer instead." };
  if (steps.length > MAX_PLAN_STEPS) return { error: `A plan can have at most ${MAX_PLAN_STEPS} steps` };

  const homes = new Set<string>();
  const out: PlanStep[] = [];
  for (const [i, raw] of steps.entries()) {
    const n = i + 1;
    if (!isObject(raw)) return { error: `Step ${n} isn't an object` };
    const tool = raw.tool as PlanStepTool;
    if (!PLAN_STEP_TOOLS.has(tool)) {
      return {
        error: `Step ${n}: ${String(raw.tool)} can't be part of a plan. Allowed: ${[...PLAN_STEP_TOOLS].join(", ")}`,
      };
    }
    if (!isObject(raw.input)) return { error: `Step ${n}: input must be an object` };
    const missing = STEP_REQUIRED[tool].filter((f) => !present((raw.input as Record<string, unknown>)[f]));
    if (missing.length) return { error: `Step ${n} (${tool}) is missing ${missing.join(", ")}` };
    if (tool === "share_report" && raw.input.visibility !== "BuyerOnly") {
      return { error: `Step ${n}: a report link in a plan must be BuyerOnly` };
    }
    const why = typeof raw.why === "string" ? raw.why.trim().slice(0, MAX_WHY) : "";
    homes.add(String(raw.input.property_id));
    out.push({ tool, input: raw.input, why });
  }
  if (homes.size > 1) return { error: "A plan covers one home. Propose a separate plan for each home." };
  return { plan: { task: task as TaskKind, title: title.trim(), steps: out } };
}

// ── How a step reads on the review card ──────────────────────────────────────

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MAX_DETAIL = 280;

const text = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v).trim();
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL - 1)}…` : s;
};

export interface StepDescription {
  label: string;
  /** The step's real arguments, in words. */
  details: string[];
  /** What saving it means, in one line. */
  note: string;
}

export function describePlanStep(step: PlanStep): StepDescription {
  const i = step.input;
  switch (step.tool) {
    case "schedule_maintenance_task": {
      const m = Number(i.planned_month);
      const when = m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${text(i.planned_year)}` : text(i.planned_year);
      const cost =
        Number(i.estimated_cost_dollars) > 0
          ? `about $${Math.round(Number(i.estimated_cost_dollars)).toLocaleString("en-US")}`
          : "";
      return {
        label: "Schedule a maintenance task",
        details: [[text(i.system_name), when, cost].filter(Boolean).join(" · "), text(i.task_description)],
        note: "Adds it to your maintenance schedule.",
      };
    }
    case "create_quote_request":
      return {
        label: "Open a quote request",
        details: [`${text(i.service_type)} · ${text(i.urgency).toLowerCase()} urgency`, text(i.description)],
        note: "Contractors who do this work can see it and send bids. It counts toward your open quote requests.",
      };
    case "create_insurance_claim":
      return {
        label: "Start a claim record in your claim kit",
        details: [
          [text(i.title), text(i.cause), `loss on ${text(i.date_of_loss)}`].filter(Boolean).join(" · "),
          text(i.description),
        ].filter(Boolean),
        note: "Your own record of the claim. Nothing is sent to your insurer; you file the claim with them yourself.",
      };
    case "share_report": {
      const days = Number(i.expiry_days);
      return {
        label: "Create a buyer report link",
        details: [`Buyer-only link · ${days > 0 ? `expires in ${days} days` : "no expiry"}`],
        note: "Saves a snapshot of your home's report as it is now and makes a link you can send to the buyer.",
      };
    }
  }
}

// ── Running the approved steps ───────────────────────────────────────────────

export interface PlanRunResult {
  ran: { tool: PlanStepTool; summary: string; data?: Record<string, unknown> }[];
  failed: { tool: PlanStepTool; error: string }[];
  skipped: { tool: PlanStepTool }[];
}

/**
 * Runs the ticked steps one at a time, in plan order. A step that fails is
 * reported and the rest still run: the steps don't depend on each other.
 */
export async function runPlan(
  plan: AssistantPlan,
  approved: number[],
  execute: (tool: PlanStepTool, input: Record<string, unknown>) => Promise<ToolCallResult>,
): Promise<PlanRunResult> {
  const ticked = new Set(approved.filter((n) => Number.isInteger(n) && n >= 0 && n < plan.steps.length));
  const result: PlanRunResult = { ran: [], failed: [], skipped: [] };
  for (const [n, step] of plan.steps.entries()) {
    if (!ticked.has(n)) {
      result.skipped.push({ tool: step.tool });
      continue;
    }
    let r: ToolCallResult;
    try {
      r = await execute(step.tool, step.input);
    } catch (e) {
      r = { success: false, error: e instanceof Error ? e.message : "Failed" };
    }
    if (r.success) {
      result.ran.push({ tool: step.tool, summary: String(r.data?.summary ?? step.tool), data: r.data });
    } else {
      result.failed.push({ tool: step.tool, error: r.error ?? "Failed" });
    }
  }
  return result;
}

// ── Starting a task ──────────────────────────────────────────────────────────

const TASK_WORDS: [TaskKind, RegExp][] = [
  [
    "storm_prep",
    /\b(storm|hurricane|tropical)\b.*\b(prep|ready|readiness|prepare|get ready|checklist)\b|\b(prep|ready|prepare)\b.*\b(storm|hurricane)\b|\bstorm prep\b/i,
  ],
  [
    "insurance_claim",
    /\bclaim (packet|kit)\b|\b(put together|prepare|start|file|build|make)\b.*\b(insurance )?claim\b|\binsurance claim\b(?!.*\b(renew|renewal)\b)/i,
  ],
  [
    "closing_handoff",
    /\bclosing\b(?!\s+(my |the |a )?(quote|request|bid|job))|\bhand ?off to (the )?buyer\b|\bhandoff\b/i,
  ],
];

/** The task a typed request names, or null for an ordinary question. */
export function matchTaskQuery(q: string): TaskKind | null {
  const s = q.trim();
  if (!s) return null;
  for (const [kind, re] of TASK_WORDS) if (re.test(s)) return kind;
  return null;
}

const TASK_ASK: Record<TaskKind, string> = {
  storm_prep: "Run storm prep",
  insurance_claim: "Put together an insurance claim packet",
  closing_handoff: "Run the closing handoff check",
};

/** The user message a task chip or a typed task request sends to the assistant. */
export function taskRequest(kind: TaskKind, home: { id: string; address: string }, said?: string): string {
  const extra = said?.trim() ? ` What I said: "${said.trim().slice(0, 500)}"` : "";
  return `${TASK_ASK[kind]} for my home at ${home.address} (property ID ${home.id}). Gather what you need, then propose one plan for me to review.${extra}`;
}
