/**
 * #712 move-in plan service: the plan on the property canister, and the
 * Worker call that reads findings from a purchase inspection report.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const plans = new Map<string, any>();
let counter = 0;
const rawPlan = (pid: string) => plans.get(pid);
const mockActor = {
  getMoveInPlan: vi.fn(async (pid: string) =>
    pid === "theirs" ? { err: { NotAuthorized: null } } : { ok: plans.has(pid) ? [rawPlan(pid)] : [] },
  ),
  startMoveInPlan: vi.fn(async (pid: string) => {
    if (!plans.has(pid))
      plans.set(pid, {
        startedAt: 1_762_000_000_000_000_000n,
        doneSteps: [],
        tasks: [],
        updatedAt: 1_762_000_000_000_000_000n,
      });
    return { ok: rawPlan(pid) };
  }),
  setMoveInStep: vi.fn(async (pid: string, step: string, done: boolean) => {
    const p = rawPlan(pid);
    if (!p) return { err: { NotFound: null } };
    p.doneSteps = p.doneSteps.filter((s: string) => s !== step).concat(done ? [step] : []);
    return { ok: p };
  }),
  addMoveInTasks: vi.fn(async (pid: string, tasks: any[]) => {
    const p = rawPlan(pid);
    if (tasks.some((t) => !t.title.trim())) return { err: { InvalidInput: "Give each task a title" } };
    p.tasks = p.tasks.concat(
      tasks.map((t) => ({ ...t, id: `mt-${++counter}`, createdAt: 1_762_000_100_000_000_000n })),
    );
    return { ok: p };
  }),
  deleteMoveInTask: vi.fn(async (pid: string, id: string) => {
    const p = rawPlan(pid);
    p.tasks = p.tasks.filter((t: any) => t.id !== id);
    return { ok: p };
  }),
  endMoveInPlan: vi.fn(async (pid: string) => {
    plans.delete(pid);
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));
const fetchMock = vi.fn();
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: (...a: unknown[]) => fetchMock(...a) }));

import { moveInPlanService, readInspection } from "@/services/moveInPlan";

beforeEach(() => {
  plans.clear();
  counter = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_move_in_plans;
  delete (window as any).__e2e_inspection_findings;
});

describe("moveInPlanService", () => {
  it("returns null when the home has no plan, or the caller can't see it", async () => {
    expect(await moveInPlanService.get("p1")).toBeNull();
    expect(await moveInPlanService.get("theirs")).toBeNull();
  });

  it("starts a plan and reads it back in milliseconds", async () => {
    const plan = await moveInPlanService.start("p1");
    expect(plan).toEqual({ startedAt: 1_762_000_000_000, doneSteps: [], tasks: [], updatedAt: 1_762_000_000_000 });
    expect(await moveInPlanService.get("p1")).toEqual(plan);
  });

  it("ticks steps and keeps tasks with lower-case urgency", async () => {
    await moveInPlanService.start("p1");
    expect((await moveInPlanService.setStep("p1", "locks", true)).doneSteps).toEqual(["locks"]);
    expect(mockActor.setMoveInStep).toHaveBeenCalledWith("p1", "locks", true);

    const plan = await moveInPlanService.addTasks("p1", [
      { title: "Fix GFCI", detail: "Kitchen", area: "Electrical", urgency: "safety" },
      { title: "Watch ceiling stain", detail: "", area: "Roof", urgency: "monitor" },
    ]);
    expect(mockActor.addMoveInTasks).toHaveBeenCalledWith("p1", [
      { title: "Fix GFCI", detail: "Kitchen", area: "Electrical", urgency: { Safety: null } },
      { title: "Watch ceiling stain", detail: "", area: "Roof", urgency: { Monitor: null } },
    ]);
    expect(plan.tasks).toEqual([
      {
        id: "mt-1",
        title: "Fix GFCI",
        detail: "Kitchen",
        area: "Electrical",
        urgency: "safety",
        createdAt: 1_762_000_100_000,
      },
      {
        id: "mt-2",
        title: "Watch ceiling stain",
        detail: "",
        area: "Roof",
        urgency: "monitor",
        createdAt: 1_762_000_100_000,
      },
    ]);

    expect((await moveInPlanService.deleteTask("p1", "mt-1")).tasks.map((t) => t.id)).toEqual(["mt-2"]);
    await moveInPlanService.end("p1");
    expect(await moveInPlanService.get("p1")).toBeNull();
  });

  it("throws the canister's message on a refusal", async () => {
    await moveInPlanService.start("p1");
    await expect(
      moveInPlanService.addTasks("p1", [{ title: " ", detail: "", area: "", urgency: "repair" }]),
    ).rejects.toThrow("Give each task a title");
  });

  it("uses window.__e2e_move_in_plans when set", async () => {
    (window as any).__e2e_move_in_plans = {};
    expect(await moveInPlanService.get("p1")).toBeNull();
    await moveInPlanService.start("p1");
    await moveInPlanService.setStep("p1", "alarms", true);
    const withTasks = await moveInPlanService.addTasks("p1", [
      { title: "Clean dryer vent", detail: "", area: "Appliances", urgency: "repair" },
    ]);
    expect(withTasks.doneSteps).toEqual(["alarms"]);
    expect(withTasks.tasks[0]).toMatchObject({ title: "Clean dryer vent", urgency: "repair" });
    expect((await moveInPlanService.deleteTask("p1", withTasks.tasks[0].id)).tasks).toEqual([]);
    await moveInPlanService.end("p1");
    expect(await moveInPlanService.get("p1")).toBeNull();
    expect(mockActor.getMoveInPlan).not.toHaveBeenCalled();
  });
});

describe("readInspection", () => {
  const file = new File(["%PDF-1.4"], "inspection.pdf", { type: "application/pdf" });

  it("posts the file to the Worker and returns the findings as drafts", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          isInspectionReport: true,
          findings: [{ title: "Fix GFCI", detail: "Kitchen", area: "Electrical", urgency: "safety" }],
        }),
        { status: 200 },
      ),
    );
    const out = await readInspection(file);
    expect(out).toEqual({
      isInspectionReport: true,
      findings: [{ title: "Fix GFCI", detail: "Kitchen", area: "Electrical", urgency: "safety" }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/inspection-findings$/);
    expect(JSON.parse(init.body)).toMatchObject({ fileName: "inspection.pdf", mimeType: "application/pdf" });
  });

  it("explains a PDF that is too big to read", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "pdf_too_large", maxBytes: 1_500_000 }), { status: 413 }),
    );
    await expect(readInspection(file)).rejects.toThrow(/1\.5 MB/);
  });

  it("refuses a file type the reader can't open without calling the Worker", async () => {
    await expect(readInspection(new File(["x"], "report.docx", { type: "application/msword" }))).rejects.toThrow(
      /PDF or a photo/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the daily AI limit is used up", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "daily_ai_limit_reached" }), { status: 429 }));
    await expect(readInspection(file)).rejects.toThrow(/limit/i);
  });

  it("uses window.__e2e_inspection_findings when set", async () => {
    (window as any).__e2e_inspection_findings = {
      isInspectionReport: true,
      findings: [{ title: "Seal attic gap", detail: "", area: "Attic", urgency: "repair" }],
    };
    expect((await readInspection(file)).findings[0].title).toBe("Seal attic gap");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
