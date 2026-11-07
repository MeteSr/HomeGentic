/**
 * #712: the move-in plan a new owner works through in their first weeks. The
 * property canister keeps which steps are done and the tasks the owner added
 * (startMoveInPlan, getMoveInPlan, setMoveInStep, addMoveInTasks,
 * deleteMoveInTask, endMoveInPlan); a buyer gets a fresh plan when they claim
 * a home. The steps themselves come from services/moveInSteps.ts.
 *
 * readInspection() asks the voice Worker (/api/inspection-findings, an AI
 * route) to list what a purchase inspection report says needs attention. The
 * owner reviews every line before any becomes a task.
 *
 * E2E: window.__e2e_move_in_plans = { [propertyId]: MoveInPlan } and
 * window.__e2e_inspection_findings = InspectionReading.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { voiceAgentFetch } from "./voiceAgentHeaders";
import { fileToBase64 } from "./documentOcr";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export type TaskUrgency = "safety" | "repair" | "monitor";

export interface TaskDraft {
  title: string;
  detail: string;
  /** The part of the home ("Electrical", "Roof"); "" when unknown. */
  area: string;
  urgency: TaskUrgency;
}

export interface MoveInTask extends TaskDraft {
  id: string;
  createdAt: number;
}

export interface MoveInPlan {
  startedAt: number;
  /** Finished step ids and finished task ids. */
  doneSteps: string[];
  tasks: MoveInTask[];
  updatedAt: number;
}

export interface InspectionReading {
  isInspectionReport: boolean;
  findings: TaskDraft[];
}

export const URGENCY_LABELS: Record<TaskUrgency, string> = {
  safety: "Safety",
  repair: "Repair",
  monitor: "Monitor",
};

const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);

const URGENCY_TAG = { safety: "Safety", repair: "Repair", monitor: "Monitor" } as const;
function urgencyToCanister(u: TaskUrgency): PropertyTypes.MoveInTaskUrgency {
  return { [URGENCY_TAG[u]]: null } as PropertyTypes.MoveInTaskUrgency;
}
function urgencyFromCanister(u: PropertyTypes.MoveInTaskUrgency): TaskUrgency {
  return "Safety" in u ? "safety" : "Monitor" in u ? "monitor" : "repair";
}

function fromCanister(raw: PropertyTypes.MoveInPlan): MoveInPlan {
  return {
    startedAt: nsToMs(raw.startedAt),
    doneSteps: [...raw.doneSteps],
    tasks: raw.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      area: t.area,
      urgency: urgencyFromCanister(t.urgency),
      createdAt: nsToMs(t.createdAt),
    })),
    updatedAt: nsToMs(raw.updatedAt),
  };
}

function e2e(): Record<string, MoveInPlan> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_move_in_plans : undefined;
}

/** The e2e store's plan for a home, which must exist. */
function e2ePlan(store: Record<string, MoveInPlan>, propertyId: string): MoveInPlan {
  const p = store[propertyId];
  if (!p) throw new Error("This home has no move-in plan");
  return p;
}

function unwrap(res: { ok: PropertyTypes.MoveInPlan } | { err: PropertyTypes.Error }): MoveInPlan {
  if ("err" in res) throw canisterError(res.err);
  return fromCanister(res.ok);
}

export const moveInPlanService = {
  /** The home's plan, or null (none, or the caller has no role on the home). */
  async get(propertyId: string): Promise<MoveInPlan | null> {
    const s = e2e();
    if (s) return s[propertyId] ?? null;
    const res = await (await getActor()).getMoveInPlan(propertyId);
    if ("err" in res) {
      if ("NotAuthorized" in res.err) return null;
      throw canisterError(res.err);
    }
    return res.ok.length ? fromCanister(res.ok[0]) : null;
  },

  /** Start a plan, or get the one the home already has. */
  async start(propertyId: string): Promise<MoveInPlan> {
    const s = e2e();
    if (s) {
      const now = Date.now();
      s[propertyId] ??= { startedAt: now, doneSteps: [], tasks: [], updatedAt: now };
      return s[propertyId];
    }
    return unwrap(await (await getActor()).startMoveInPlan(propertyId));
  },

  async setStep(propertyId: string, stepId: string, done: boolean): Promise<MoveInPlan> {
    const s = e2e();
    if (s) {
      const p = e2ePlan(s, propertyId);
      const rest = p.doneSteps.filter((x) => x !== stepId);
      s[propertyId] = { ...p, doneSteps: done ? [...rest, stepId] : rest, updatedAt: Date.now() };
      return s[propertyId];
    }
    return unwrap(await (await getActor()).setMoveInStep(propertyId, stepId, done));
  },

  async addTasks(propertyId: string, drafts: TaskDraft[]): Promise<MoveInPlan> {
    const s = e2e();
    if (s) {
      const p = e2ePlan(s, propertyId);
      const now = Date.now();
      const added = drafts.map((d, i) => ({ ...d, id: `mt-e2e-${p.tasks.length + i + 1}`, createdAt: now }));
      s[propertyId] = { ...p, tasks: [...p.tasks, ...added], updatedAt: now };
      return s[propertyId];
    }
    const res = await (
      await getActor()
    ).addMoveInTasks(
      propertyId,
      drafts.map((d) => ({ title: d.title, detail: d.detail, area: d.area, urgency: urgencyToCanister(d.urgency) })),
    );
    return unwrap(res);
  },

  async deleteTask(propertyId: string, taskId: string): Promise<MoveInPlan> {
    const s = e2e();
    if (s) {
      const p = e2ePlan(s, propertyId);
      s[propertyId] = {
        ...p,
        tasks: p.tasks.filter((t) => t.id !== taskId),
        doneSteps: p.doneSteps.filter((x) => x !== taskId),
        updatedAt: Date.now(),
      };
      return s[propertyId];
    }
    return unwrap(await (await getActor()).deleteMoveInTask(propertyId, taskId));
  },

  /** Remove the plan. */
  async end(propertyId: string): Promise<void> {
    const s = e2e();
    if (s) {
      delete s[propertyId];
      return;
    }
    const res = await (await getActor()).endMoveInPlan(propertyId);
    if ("err" in res) throw canisterError(res.err);
  },
};

const READABLE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
/** The Worker reads PDFs up to 1.5 MB (each page is billed); photos have no such limit. */
export const MAX_INSPECTION_PDF_MB = 1.5;

/** Ask the Worker what an inspection report (PDF or photo) lists as needing attention. */
export async function readInspection(file: File): Promise<InspectionReading> {
  const fake = typeof window !== "undefined" ? (window as any).__e2e_inspection_findings : undefined;
  if (fake) return fake as InspectionReading;
  if (!READABLE_TYPES.includes(file.type)) {
    throw new Error("Upload the report as a PDF or a photo (JPEG, PNG or WebP).");
  }
  const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/inspection-findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: await fileToBase64(file) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    if (body.error === "pdf_too_large") {
      throw new Error(
        `That PDF is over ${MAX_INSPECTION_PDF_MB} MB. Upload just the summary pages, or photos of them.`,
      );
    }
    if (res.status === 429) throw new Error("You've reached today's limit for reading documents. Try again tomorrow.");
    throw new Error("We couldn't read that report. Please try again.");
  }
  const out = (await res.json()) as InspectionReading;
  return { isInspectionReport: out.isInspectionReport !== false, findings: out.findings ?? [] };
}
