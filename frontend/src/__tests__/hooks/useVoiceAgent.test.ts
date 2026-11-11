/**
 * Unit tests — useVoiceAgent
 *
 * VA.1  Initial state: idle, empty transcript/response, null error
 * VA.2  isSupported is false when SpeechRecognition is not available (jsdom)
 * VA.3  reset() returns state to idle and clears transcript/response/error
 * VA.4  clearImage sets pendingImage to null
 * VA.5  dismissProposal sets pendingProposal to null
 * VA.6  sendChat goes through the session-authenticated fetch, and a 429
 *       (Free daily chat limit) shows a friendly message and flags the quota
 * VA.7  F-8: side-effecting tool calls need explicit user confirmation;
 *       read-only tools run without asking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock all heavy service dependencies — useVoiceAgent imports many services
vi.mock("@/services/property",          () => ({ propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/job",               () => ({ jobService: { getAll: vi.fn().mockResolvedValue([]), getByProperty: vi.fn().mockResolvedValue([]), getPendingProposals: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/quote",             () => ({ quoteService: { getRequests: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/agentTools",        () => ({ executeTool: vi.fn(), toolActionLabel: vi.fn().mockReturnValue("") }));
vi.mock("@/services/scoreService",      () => ({ computeScore: vi.fn().mockReturnValue(0), computeBreakdown: vi.fn().mockReturnValue({}), getScoreGrade: vi.fn().mockReturnValue("B"), scoreSuggestions: vi.fn().mockReturnValue([]), loadHistory: vi.fn().mockReturnValue([]), recordSnapshot: vi.fn().mockReturnValue([]) }));
vi.mock("@/services/scoreEventService", () => ({ getRecentScoreEvents: vi.fn().mockReturnValue([]) }));
vi.mock("@/services/market",            () => ({ marketService: { getROIRankings: vi.fn().mockResolvedValue([]) }, jobToSummary: vi.fn() }));
vi.mock("@/services/maintenanceForecast", () => ({ buildMaintenanceForecast: vi.fn().mockReturnValue([]) }));
vi.mock("@/services/scoreTrend",        () => ({ buildScoreTrend: vi.fn().mockReturnValue([]) }));
vi.mock("@/services/imageUtils",        () => ({ buildImageUserMessage: vi.fn(), fileToBase64: vi.fn() }));
vi.mock("@/services/payment",          () => ({ paymentService: { getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }), getMyAgentCredits: vi.fn().mockResolvedValue(10), startCreditPackCheckout: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/services/contractor",       () => ({ contractorService: { getContractors: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/contractorJobProposal", () => ({ proposeJob: vi.fn() }));
vi.mock("@/store/authStore",           () => ({ useAuthStore: Object.assign(() => ({ principal: null, profile: null }), { getState: () => ({ principal: null, profile: null }) }) }));
const mockFetchWithAgentSession = vi.fn();
vi.mock("@/services/agentSession",      () => ({ fetchWithAgentSession: (...a: unknown[]) => mockFetchWithAgentSession(...a), aiRefusalMessage: async () => null }));

import { useVoiceAgent, setToolConfirmationHandler, toolNeedsConfirmation } from "@/hooks/useVoiceAgent";
import { executeTool } from "@/services/agentTools";
import { paymentService } from "@/services/payment";

beforeEach(() => {
  // Ensure SpeechRecognition is undefined in jsdom (it is by default)
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  // Stub speechSynthesis — not available in jsdom
  if (!window.speechSynthesis) {
    Object.defineProperty(window, "speechSynthesis", {
      value: { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn().mockReturnValue([]) },
      configurable: true,
    });
  }
});

// ── VA.1 ─────────────────────────────────────────────────────────────────────

describe("VA.1 — initial state is idle with empty strings", () => {
  it("starts idle with no transcript, response, or error", () => {
    const { result } = renderHook(() => useVoiceAgent());
    expect(result.current.state).toBe("idle");
    expect(result.current.transcript).toBe("");
    expect(result.current.response).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("pendingImage and pendingProposal start null", () => {
    const { result } = renderHook(() => useVoiceAgent());
    expect(result.current.pendingImage).toBeNull();
    expect(result.current.pendingProposal).toBeNull();
  });

  it("quotaExhausted and fallbackNotice start false", () => {
    const { result } = renderHook(() => useVoiceAgent());
    expect(result.current.quotaExhausted).toBe(false);
    expect(result.current.fallbackNotice).toBe(false);
  });
});

// ── VA.2 ─────────────────────────────────────────────────────────────────────

describe("VA.2 — isSupported reflects SpeechRecognition availability", () => {
  it("is false in jsdom (no SpeechRecognition API)", () => {
    const { result } = renderHook(() => useVoiceAgent());
    expect(result.current.isSupported).toBe(false);
  });

  it("is true when SpeechRecognition is stubbed on window", () => {
    (window as any).SpeechRecognition = class {};
    const { result } = renderHook(() => useVoiceAgent());
    expect(result.current.isSupported).toBe(true);
    delete (window as any).SpeechRecognition;
  });
});

// ── VA.3 ─────────────────────────────────────────────────────────────────────

describe("VA.3 — reset() returns to idle state", () => {
  it("clears transcript, response, and error", () => {
    const { result } = renderHook(() => useVoiceAgent());
    act(() => { result.current.reset(); });
    expect(result.current.state).toBe("idle");
    expect(result.current.transcript).toBe("");
    expect(result.current.response).toBe("");
    expect(result.current.error).toBeNull();
  });
});

// ── VA.4 ─────────────────────────────────────────────────────────────────────

describe("VA.4 — clearImage sets pendingImage to null", () => {
  it("nulls out pendingImage when called", () => {
    const { result } = renderHook(() => useVoiceAgent());
    // clearImage starts null so this just verifies the API is callable without error
    act(() => { result.current.clearImage(); });
    expect(result.current.pendingImage).toBeNull();
  });
});

// ── VA.5 ─────────────────────────────────────────────────────────────────────

describe("VA.5 — dismissProposal sets pendingProposal to null", () => {
  it("nulls pendingProposal when called", () => {
    const { result } = renderHook(() => useVoiceAgent());
    act(() => { result.current.dismissProposal(); });
    expect(result.current.pendingProposal).toBeNull();
  });
});

// ── VA.6 ─────────────────────────────────────────────────────────────────────

describe("sendChat", () => {
  it("uses the session-authenticated fetch and explains a Free daily-limit 429", async () => {
    vi.mocked(paymentService.getMySubscription).mockResolvedValueOnce({ tier: "Free" } as any);
    mockFetchWithAgentSession.mockResolvedValue(new Response(JSON.stringify({ error: "daily_chat_limit_reached" }), { status: 429 }));
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.sendChat("Is my roof okay?"); });
    expect(mockFetchWithAgentSession).toHaveBeenCalledWith(expect.stringMatching(/\/api\/chat$/), expect.objectContaining({ method: "POST" }));
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/free questions/i);
    expect(result.current.error).not.toMatch(/unlimited/i);
    expect(result.current.error).toMatch(/200 a day/);
    expect(result.current.quotaExhausted).toBe(true);
  });

  it("tells a paid user they've reached today's limit, not to upgrade", async () => {
    vi.mocked(paymentService.getMySubscription).mockResolvedValueOnce({ tier: "Pro" } as any);
    mockFetchWithAgentSession.mockResolvedValue(new Response(JSON.stringify({ error: "daily_chat_limit_reached" }), { status: 429 }));
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.sendChat("Is my roof okay?"); });
    expect(result.current.error).toMatch(/today's limit/i);
    expect(result.current.error).not.toMatch(/upgrade|unlimited/i);
  });
});

// ── VA.7 ─────────────────────────────────────────────────────────────────────

describe("VA.7 — side-effecting tools need confirmation (F-8)", () => {
  const toolCallsResponse = {
    status: 200, ok: true,
    json: async () => ({
      type: "tool_calls",
      assistantMessage: { role: "assistant", content: [] },
      toolCalls: [
        { id: "t1", name: "accept_bid", input: { quote_id: "Q-ATTACKER" } },
        { id: "t2", name: "list_bids",  input: {} },
      ],
    }),
  };
  const answerResponse = { status: 200, ok: true, json: async () => ({ type: "answer", text: "ok" }) };

  async function runLoop() {
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.attachImage(new File(["x"], "x.png", { type: "image/png" })); });
    await act(async () => { result.current.sendImageToAgent("show my bids"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }

  beforeEach(() => {
    vi.mocked(executeTool).mockReset().mockResolvedValue({ success: true, data: {} });
    mockFetchWithAgentSession.mockReset()
      .mockResolvedValueOnce(toolCallsResponse)
      .mockResolvedValueOnce(answerResponse);
  });

  it("classifies tools: writes need confirmation, reads don't, unknown tools do", () => {
    expect(toolNeedsConfirmation("accept_bid")).toBe(true);
    expect(toolNeedsConfirmation("share_report")).toBe(true);
    expect(toolNeedsConfirmation("propose_job")).toBe(true);
    expect(toolNeedsConfirmation("list_bids")).toBe(false);
    // the generic OQL read tool only reads, so it runs without a prompt
    expect(toolNeedsConfirmation("query_home_records")).toBe(false);
    expect(toolNeedsConfirmation("some_future_tool")).toBe(true);
  });

  it("a declined write is not executed and the model is told so", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    setToolConfirmationHandler(confirm);
    try {
      await runLoop();
    } finally {
      setToolConfirmationHandler(null);
    }
    expect(confirm).toHaveBeenCalledWith("accept_bid", { quote_id: "Q-ATTACKER" }, "");
    expect(confirm).toHaveBeenCalledTimes(1);   // list_bids is read-only
    expect(vi.mocked(executeTool).mock.calls.map((c) => c[0])).toEqual(["list_bids"]);
    const secondBody = JSON.parse(mockFetchWithAgentSession.mock.calls[1][1].body);
    const results = secondBody.messages.at(-1).content;
    expect(JSON.parse(results[0].content).error).toMatch(/declined/);
  });

  it("an approved write runs", async () => {
    setToolConfirmationHandler(() => true);
    try {
      await runLoop();
    } finally {
      setToolConfirmationHandler(null);
    }
    expect(vi.mocked(executeTool).mock.calls.map((c) => c[0])).toEqual(["accept_bid", "list_bids"]);
  });
});

// ── VA.8 ─────────────────────────────────────────────────────────────────────
// Multi-step tasks: the model proposes one plan; the user reviews every write
// on one card, and only ticked steps run. No per-step window.confirm.

describe("VA.8 — multi-step task plans run only from the review card", () => {
  const gutters = {
    tool: "schedule_maintenance_task",
    input: { property_id: "P1", system_name: "Gutters", task_description: "Clean gutters", planned_year: 2026, planned_month: 6 },
    why: "No gutter cleaning on record",
  };
  const roof = {
    tool: "create_quote_request",
    input: { property_id: "P1", service_type: "Roofing", description: "Roof inspection", urgency: "Medium" },
    why: "Roof is near the end of its life",
  };
  const planCall = (steps: unknown[]) => ({
    status: 200, ok: true,
    json: async () => ({
      type: "tool_calls",
      assistantMessage: { role: "assistant", content: [] },
      toolCalls: [{ id: "p1", name: "propose_plan", input: { task: "storm_prep", title: "Storm prep for 12 Oak St", steps } }],
    }),
  });
  const answer = { status: 200, ok: true, json: async () => ({ type: "answer", text: "Done." }) };
  const confirm = vi.fn();

  beforeEach(() => {
    confirm.mockReset().mockReturnValue(true);
    setToolConfirmationHandler(confirm);
    vi.mocked(executeTool).mockReset().mockResolvedValue({ success: true, data: { summary: "saved" } });
    mockFetchWithAgentSession.mockReset();
  });
  afterEach(() => setToolConfirmationHandler(null));

  const lastToolResult = (call: number) =>
    JSON.parse(JSON.parse(mockFetchWithAgentSession.mock.calls[call][1].body).messages.at(-1).content[0].content);

  it("prepare_home_task reads without asking; the task writes and plans need the user", () => {
    expect(toolNeedsConfirmation("prepare_home_task")).toBe(false);
    expect(toolNeedsConfirmation("create_insurance_claim")).toBe(true);
    expect(toolNeedsConfirmation("propose_plan")).toBe(true);
  });

  it("a task chip sends the task request to the agent", async () => {
    mockFetchWithAgentSession.mockResolvedValueOnce(answer);
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.runTask("storm_prep", { id: "P1", address: "12 Oak St" }); });
    const body = JSON.parse(mockFetchWithAgentSession.mock.calls[0][1].body);
    expect(mockFetchWithAgentSession.mock.calls[0][0]).toMatch(/\/api\/agent$/);
    expect(body.messages[0].content).toMatch(/storm prep.*12 Oak St.*P1/i);
  });

  it("shows the plan, runs only the ticked steps, and tells the model what ran", async () => {
    mockFetchWithAgentSession.mockResolvedValueOnce(planCall([gutters, roof])).mockResolvedValueOnce(answer);
    const { result } = renderHook(() => useVoiceAgent());
    let run!: Promise<void>;
    act(() => { run = result.current.runTask("storm_prep", { id: "P1", address: "12 Oak St" }); });
    await waitFor(() => expect(result.current.pendingPlan).not.toBeNull());
    expect(result.current.pendingPlan!.steps).toHaveLength(2);
    expect(executeTool).not.toHaveBeenCalled();
    await act(async () => { result.current.approvePlan([1]); await run; });
    expect(confirm).not.toHaveBeenCalled();
    expect(vi.mocked(executeTool).mock.calls).toEqual([["create_quote_request", roof.input]]);
    const sent = lastToolResult(1);
    expect(sent.success).toBe(true);
    expect(sent.data.ran).toHaveLength(1);
    expect(sent.data.skipped).toEqual([{ tool: "schedule_maintenance_task" }]);
    expect(result.current.pendingPlan).toBeNull();
    expect(result.current.response).toBe("Done.");
  });

  it("a dismissed plan saves nothing and the model is told", async () => {
    mockFetchWithAgentSession.mockResolvedValueOnce(planCall([gutters])).mockResolvedValueOnce(answer);
    const { result } = renderHook(() => useVoiceAgent());
    let run!: Promise<void>;
    act(() => { run = result.current.runTask("storm_prep", { id: "P1", address: "12 Oak St" }); });
    await waitFor(() => expect(result.current.pendingPlan).not.toBeNull());
    await act(async () => { result.current.dismissPlan(); await run; });
    expect(executeTool).not.toHaveBeenCalled();
    expect(lastToolResult(1)).toMatchObject({ success: false, error: expect.stringMatching(/declined/) });
  });

  it("a plan with a step outside the curated list never reaches the card", async () => {
    const bad = { tool: "accept_bid", input: { property_id: "P1", quote_id: "Q-ATTACKER" }, why: "cheapest" };
    mockFetchWithAgentSession.mockResolvedValueOnce(planCall([gutters, bad])).mockResolvedValueOnce(answer);
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.runTask("storm_prep", { id: "P1", address: "12 Oak St" }); });
    expect(result.current.pendingPlan).toBeNull();
    expect(executeTool).not.toHaveBeenCalled();
    expect(lastToolResult(1)).toMatchObject({ success: false, error: expect.stringMatching(/accept_bid/) });
  });

  it("reset() while a plan is waiting declines it", async () => {
    mockFetchWithAgentSession.mockResolvedValueOnce(planCall([gutters])).mockResolvedValueOnce(answer);
    const { result } = renderHook(() => useVoiceAgent());
    let run!: Promise<void>;
    act(() => { run = result.current.runTask("storm_prep", { id: "P1", address: "12 Oak St" }); });
    await waitFor(() => expect(result.current.pendingPlan).not.toBeNull());
    await act(async () => { result.current.reset(); await run; });
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.current.pendingPlan).toBeNull();
  });
});
