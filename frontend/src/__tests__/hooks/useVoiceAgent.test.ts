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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock all heavy service dependencies — useVoiceAgent imports many services
vi.mock("@/services/property",          () => ({ propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/job",               () => ({ jobService: { getAll: vi.fn().mockResolvedValue([]), getByProperty: vi.fn().mockResolvedValue([]), getPendingProposals: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/quote",             () => ({ quoteService: { getRequests: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/agentTools",        () => ({ executeTool: vi.fn(), toolActionLabel: vi.fn().mockReturnValue("") }));
vi.mock("@/services/scoreService",      () => ({ computeScore: vi.fn().mockReturnValue(0), computeBreakdown: vi.fn().mockReturnValue({}), getScoreGrade: vi.fn().mockReturnValue("B"), loadHistory: vi.fn().mockReturnValue([]), recordSnapshot: vi.fn().mockReturnValue([]) }));
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
vi.mock("@/services/agentSession",      () => ({ fetchWithAgentSession: (...a: unknown[]) => mockFetchWithAgentSession(...a) }));

import { useVoiceAgent } from "@/hooks/useVoiceAgent";

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
    mockFetchWithAgentSession.mockResolvedValue(new Response(JSON.stringify({ error: "daily_chat_limit_reached" }), { status: 429 }));
    const { result } = renderHook(() => useVoiceAgent());
    await act(async () => { await result.current.sendChat("Is my roof okay?"); });
    expect(mockFetchWithAgentSession).toHaveBeenCalledWith(expect.stringMatching(/\/api\/chat$/), expect.objectContaining({ method: "POST" }));
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/free questions/i);
    expect(result.current.quotaExhausted).toBe(true);
  });
});
