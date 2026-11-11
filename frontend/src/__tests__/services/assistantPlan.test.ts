/**
 * Multi-step assistant tasks (audits/icp-aiware-2026-11-10.md, opportunity 3):
 * the assistant gathers what it needs with read-only tools, then proposes ONE
 * plan listing every write. The user reviews it on one card and nothing is
 * saved until they approve. This module is the plan's pure half: what a plan
 * may contain, how each step reads on the card, and how approved steps run.
 *
 *  AP.1 only the curated write tools can be plan steps (no bids, signatures,
 *       transfers, payments or account changes), and each needs its fields
 *  AP.2 a plan has a known task, a title and 1 to 8 steps
 *  AP.3 every step reads on the card with its real arguments
 *  AP.4 only the steps the user ticked run, in order; one failure doesn't stop the rest
 *  AP.5 typed requests that name a task start it
 *  AP.6 the request a task chip sends names the task and the home
 */
import { describe, it, expect, vi } from "vitest";
import {
  validatePlan,
  describePlanStep,
  runPlan,
  matchTaskQuery,
  taskRequest,
  PLAN_STEP_TOOLS,
  MAX_PLAN_STEPS,
  TASK_KINDS,
  type PlanStep,
} from "@/services/assistantPlan";

const gutters: PlanStep = {
  tool: "schedule_maintenance_task",
  input: {
    property_id: "P1",
    system_name: "Gutters",
    task_description: "Clean gutters and downspouts",
    planned_year: 2027,
    planned_month: 5,
  },
  why: "No gutter cleaning on record in the last year",
};
const roofQuote: PlanStep = {
  tool: "create_quote_request",
  input: {
    property_id: "P1",
    service_type: "Roofing",
    description: "Roof inspection before storm season",
    urgency: "Medium",
  },
  why: "Roof is near the end of its expected life",
};
const claim: PlanStep = {
  tool: "create_insurance_claim",
  input: {
    property_id: "P1",
    title: "Hurricane roof damage",
    date_of_loss: "2026-09-28",
    cause: "Wind or hurricane",
    description: "Shingles missing on the west side",
  },
  why: "No claim record yet",
};
const share: PlanStep = {
  tool: "share_report",
  input: { property_id: "P1", visibility: "BuyerOnly", expiry_days: 90 },
  why: "The last report link predates three jobs",
};

const plan = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
  task: "storm_prep",
  title: "Storm prep for 12 Oak St",
  steps,
  ...extra,
});

describe("AP.1 — only curated writes can be plan steps", () => {
  it("allows exactly the four task writes", () => {
    expect([...PLAN_STEP_TOOLS].sort()).toEqual([
      "create_insurance_claim",
      "create_quote_request",
      "schedule_maintenance_task",
      "share_report",
    ]);
  });

  it.each([
    "accept_bid",
    "sign_job_verification",
    "submit_bid",
    "add_property",
    "decline_quote",
    "propose_plan",
    "revoke_report_link",
  ])("refuses %s as a step", (tool) => {
    const r = validatePlan(plan([{ tool, input: { property_id: "P1" }, why: "x" }]));
    expect(r).toEqual({ error: expect.stringMatching(new RegExp(tool)) });
  });

  it("refuses a step missing a required field, naming it", () => {
    const r = validatePlan(
      plan([{ ...roofQuote, input: { property_id: "P1", service_type: "Roofing", urgency: "Medium" } }]),
    );
    expect("error" in r && r.error).toMatch(/description/);
  });

  it("refuses a step whose input isn't an object", () => {
    expect("error" in validatePlan(plan([{ tool: "share_report", input: "P1", why: "x" }]))).toBe(true);
  });

  it("refuses a public report link: closing hands the buyer a buyer-only one", () => {
    const r = validatePlan(
      plan([{ ...share, input: { property_id: "P1", visibility: "Public" } }], { task: "closing_handoff" }),
    );
    expect("error" in r && r.error).toMatch(/BuyerOnly/);
  });

  it("accepts a well-formed plan and keeps the steps as given", () => {
    const r = validatePlan(plan([gutters, roofQuote]));
    expect(r).toEqual({ plan: { task: "storm_prep", title: "Storm prep for 12 Oak St", steps: [gutters, roofQuote] } });
  });
});

describe("AP.2 — plan shape", () => {
  it("knows the three tasks", () => {
    expect(TASK_KINDS).toEqual(["storm_prep", "insurance_claim", "closing_handoff"]);
  });

  it("refuses an unknown task, a missing title, no steps, or too many", () => {
    expect("error" in validatePlan(plan([gutters], { task: "sell_house" }))).toBe(true);
    expect("error" in validatePlan(plan([gutters], { title: "  " }))).toBe(true);
    expect("error" in validatePlan(plan([]))).toBe(true);
    expect("error" in validatePlan(plan(Array(MAX_PLAN_STEPS + 1).fill(gutters)))).toBe(true);
    expect("error" in validatePlan(null)).toBe(true);
  });

  it("refuses steps for more than one home", () => {
    const other = { ...roofQuote, input: { ...roofQuote.input, property_id: "P2" } };
    expect("error" in validatePlan(plan([gutters, other]))).toBe(true);
  });
});

describe("AP.3 — each step reads on the card with its real arguments", () => {
  it("scheduling names the system, month and task", () => {
    const d = describePlanStep(gutters);
    expect(d.label).toBe("Schedule a maintenance task");
    expect(d.details.join(" ")).toMatch(/Gutters/);
    expect(d.details.join(" ")).toMatch(/May 2027/);
    expect(d.details.join(" ")).toMatch(/Clean gutters and downspouts/);
  });

  it("a quote request says contractors will see it", () => {
    const d = describePlanStep(roofQuote);
    expect(d.label).toBe("Open a quote request");
    expect(d.details.join(" ")).toMatch(/Roofing/);
    expect(d.details.join(" ")).toMatch(/Roof inspection before storm season/);
    expect(d.note).toMatch(/contractors/i);
  });

  it("a claim record says nothing is sent to the insurer", () => {
    const d = describePlanStep(claim);
    expect(d.label).toBe("Start a claim record in your claim kit");
    expect(d.details.join(" ")).toMatch(/Hurricane roof damage/);
    expect(d.details.join(" ")).toMatch(/2026-09-28|Sep/);
    expect(d.note).toMatch(/not sent to your insurer|nothing is sent/i);
  });

  it("a report link names who can open it and when it expires", () => {
    const d = describePlanStep(share);
    expect(d.label).toBe("Create a buyer report link");
    expect(d.details.join(" ")).toMatch(/90 days/);
    expect(d.note).toMatch(/snapshot/i);
  });

  it("keeps long text whole enough to judge, but bounded", () => {
    const long = { ...roofQuote, input: { ...roofQuote.input, description: "x".repeat(2000) } };
    const text = describePlanStep(long).details.join(" ");
    expect(text.length).toBeLessThan(700);
    expect(text).toMatch(/…$/);
  });
});

describe("AP.4 — only ticked steps run, in order", () => {
  it("runs the approved steps and reports the rest as skipped", async () => {
    const exec = vi.fn(async (tool: string) => ({ success: true, data: { summary: `${tool} done` } }));
    const r = await runPlan({ task: "storm_prep", title: "t", steps: [gutters, roofQuote, claim] }, [2, 0], exec);
    expect(exec.mock.calls.map((c) => c[0])).toEqual(["schedule_maintenance_task", "create_insurance_claim"]);
    expect(r.ran.map((s) => s.summary)).toEqual(["schedule_maintenance_task done", "create_insurance_claim done"]);
    expect(r.skipped.map((s) => s.tool)).toEqual(["create_quote_request"]);
    expect(r.failed).toEqual([]);
  });

  it("a failed step is reported and the next still runs", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: "You have 3 open quote requests" })
      .mockResolvedValueOnce({ success: true, data: { summary: "scheduled" } });
    const r = await runPlan({ task: "storm_prep", title: "t", steps: [roofQuote, gutters] }, [0, 1], exec);
    expect(r.failed).toEqual([{ tool: "create_quote_request", error: "You have 3 open quote requests" }]);
    expect(r.ran.map((s) => s.summary)).toEqual(["scheduled"]);
  });

  it("ignores indexes that aren't steps", async () => {
    const exec = vi.fn(async () => ({ success: true, data: {} }));
    await runPlan({ task: "storm_prep", title: "t", steps: [gutters] }, [5, -1, 0, 0], exec);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe("AP.5 — typed requests that name a task", () => {
  it.each([
    ["help me get ready for the hurricane", "storm_prep"],
    ["storm prep", "storm_prep"],
    ["put together my insurance claim", "insurance_claim"],
    ["claim packet for the roof damage", "insurance_claim"],
    ["closing handoff check", "closing_handoff"],
    ["am I ready for closing?", "closing_handoff"],
  ])("%s → %s", (q, kind) => {
    expect(matchTaskQuery(q)).toBe(kind);
  });

  it.each(["what's my score", "roof age", "insurance renewal date", "show my claims"])("%s is not a task", (q) => {
    expect(matchTaskQuery(q)).toBeNull();
  });
});

describe("AP.6 — the request a task sends", () => {
  it("names the task, the home and its id, and asks for one plan", () => {
    const msg = taskRequest("closing_handoff", { id: "P1", address: "12 Oak St" });
    expect(msg).toMatch(/closing handoff/i);
    expect(msg).toMatch(/12 Oak St/);
    expect(msg).toMatch(/P1/);
  });

  it("passes on what the user typed for a claim", () => {
    expect(taskRequest("insurance_claim", { id: "P1", address: "12 Oak St" }, "hail broke two skylights")).toMatch(
      /hail broke two skylights/,
    );
  });
});
