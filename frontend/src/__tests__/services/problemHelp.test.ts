/**
 * "Show me the problem": askAboutProblem sends the owner's description (and an
 * optional photo) to the voice Worker's /api/problem-help AI route, and
 * problemQuotePrefill turns the answer into a quote request to edit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: (...a: unknown[]) => fetchMock(...a) }));

import { askAboutProblem, problemQuotePrefill, MAX_PROBLEM_PHOTO_MB, type ProblemHelp } from "@/services/problemHelp";

const ANSWER: ProblemHelp = {
  summary: "Water under the kitchen sink.",
  likelyCauses: ["A loose drain nut"],
  safeToTry: ["Hand-tighten the nut"],
  shutOff: ["The two valves under the sink"],
  danger: false,
  dangerAdvice: "",
  serviceType: "Plumbing",
  urgency: "high",
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete (window as any).__e2e_problem_help;
});

describe("askAboutProblem", () => {
  it("posts the description alone when there's no photo", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(ANSWER), { status: 200 }));
    expect(await askAboutProblem("  Water under the sink  ")).toEqual(ANSWER);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/problem-help$/);
    expect(JSON.parse(init.body)).toEqual({ description: "Water under the sink" });
  });

  it("adds the photo as base64 with its type", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(ANSWER), { status: 200 }));
    await askAboutProblem("Leak", new File(["hi"], "leak.png", { type: "image/png" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      description: "Leak",
      mimeType: "image/png",
      base64Data: "aGk=",
    });
  });

  it("refuses an empty description, a non-image or a big photo without calling the Worker", async () => {
    await expect(askAboutProblem("  ")).rejects.toThrow(/describe/i);
    await expect(askAboutProblem("Leak", new File(["x"], "a.pdf", { type: "application/pdf" }))).rejects.toThrow(
      /photo/i,
    );
    const big = new File([new Uint8Array(MAX_PROBLEM_PHOTO_MB * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(askAboutProblem("Leak", big)).rejects.toThrow(new RegExp(`${MAX_PROBLEM_PHOTO_MB} MB`));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains the daily limit and other failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(askAboutProblem("Leak")).rejects.toThrow(/today's limit/);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(askAboutProblem("Leak")).rejects.toThrow(/try again/i);
  });

  it("uses the e2e answer when one is set", async () => {
    (window as any).__e2e_problem_help = ANSWER;
    expect(await askAboutProblem("Leak")).toEqual(ANSWER);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("problemQuotePrefill", () => {
  it("carries the home, trade, urgency and the owner's own words", () => {
    expect(problemQuotePrefill("p1", " Water under the sink ", ANSWER)).toEqual({
      propertyId: "p1",
      serviceType: "Plumbing",
      urgency: "high",
      description: "Water under the sink",
    });
  });
});
