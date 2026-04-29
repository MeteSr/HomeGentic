/**
 * server.ts HTTP endpoint tests
 *
 * CHAT.1  POST /api/chat — rejects empty message with 400
 * CHAT.2  POST /api/chat — streams SSE chunks and [DONE] terminator
 * CHAT.3  POST /api/chat — writes SSE error event when provider throws
 *
 * AGENT.1  POST /api/agent — rejects empty messages array with 400
 * AGENT.2  POST /api/agent — Free tier returns 429 daily_agent_limit_reached
 * AGENT.3  POST /api/agent — Pro tier returns 200 answer with quota headers
 * AGENT.4  POST /api/agent — Pro tier returns 200 tool_calls response
 * AGENT.5  POST /api/agent — unknown tier falls back to Free (blocked)
 * AGENT.6  POST /api/agent — daily limit is enforced at tier cap (Pro=10, Premium=20)
 *
 * HEALTH.1  GET /health — returns { ok: true }
 *
 * The Anthropic provider is fully mocked — no real API calls are made.
 * Each test that exercises rate-limiting uses a unique principal so the
 * in-memory agentLimiter counter never bleeds between tests (same isolation
 * pattern as agentLimiter.test.ts).
 *
 * Key setup detail: createAnthropicProvider() is called at server.ts
 * module-load time, before any beforeEach runs.  The mock factory must
 * therefore return the mock provider immediately so that the `provider`
 * variable inside server.ts is never undefined.
 */

// jest.mock calls are hoisted above all imports by babel-jest.
// The factories run before server.ts is evaluated so every module-level
// variable inside server.ts gets the mock at load time.
jest.mock("../anthropicProvider", () => ({
  createAnthropicProvider: jest.fn().mockReturnValue({
    stream: jest.fn(),
    complete: jest.fn(),
    completeWithTools: jest.fn(),
  }),
}));

// Mock both prompt builders so tests never need a fully-populated context object.
jest.mock("../prompts", () => ({
  buildSystemPrompt: jest.fn().mockReturnValue("test system prompt"),
}));
jest.mock("../../maintenance/prompts", () => ({
  buildMaintenanceSystemPrompt: jest.fn().mockReturnValue("test maintenance prompt"),
}));

import { describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import supertest from "supertest";
import { createAnthropicProvider } from "../anthropicProvider";
// Import app after the mock is in place — server.ts is evaluated here and
// creates `provider` by calling the (already-mocked) createAnthropicProvider.
import { app } from "../server";

// ── types ─────────────────────────────────────────────────────────────────────

type MockProvider = {
  stream:              jest.Mock;
  complete:            jest.Mock;
  completeWithTools:   jest.Mock;
};

// ── shared state ──────────────────────────────────────────────────────────────

// Grab the exact mock object that server.ts received when it imported the provider.
let mockProvider: MockProvider;

beforeAll(() => {
  mockProvider = (createAnthropicProvider as jest.Mock).mock.results[0]!.value;
});

// Clear call counts and queued return values between tests.
// Does NOT clear implementations, but every test that needs specific behaviour
// sets it up explicitly, so there is no unintended bleed.
beforeEach(() => {
  jest.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

let seq = 0;
function uid(): string {
  return `srv-test-${seq++}-${Date.now()}`;
}

async function* fakeStream(chunks: string[]) {
  for (const text of chunks) yield { text };
}

// ── HEALTH ────────────────────────────────────────────────────────────────────

describe("HEALTH.1 — GET /health", () => {
  const ENV_KEYS = [
    "ANTHROPIC_API_KEY", "VOICE_AGENT_API_KEY",
    "FRONTEND_ORIGIN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  ];
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    process.env.ANTHROPIC_API_KEY     = "sk-ant-test";
    process.env.VOICE_AGENT_API_KEY   = "test-key";
    process.env.FRONTEND_ORIGIN       = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY     = "sk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
    }
  });

  it("returns 200 ok: true when all required env vars are set", async () => {
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.checks).toEqual({
      anthropic_key: true, api_key: true, frontend_origin: true,
      stripe_key: true, stripe_webhook: true,
    });
  });

  it("returns 503 ok: false when a required env var is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.stripe_key).toBe(false);
  });
});

// ── /api/chat ─────────────────────────────────────────────────────────────────

describe("CHAT.1 — empty message rejected", () => {
  it("returns 400 when message is an empty string", async () => {
    const res = await supertest(app)
      .post("/api/chat")
      .send({ message: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("message is required");
  });

  it("returns 400 when body has no message field", async () => {
    const res = await supertest(app)
      .post("/api/chat")
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("CHAT.2 — SSE stream emits chunks and [DONE]", () => {
  it("streams data events then terminates with [DONE]", async () => {
    mockProvider.stream.mockReturnValue(fakeStream(["Hello", " world"]));

    const res = await supertest(app)
      .post("/api/chat")
      .send({ message: "test" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain('data: {"text":"Hello"}');
    expect(res.text).toContain('data: {"text":" world"}');
    expect(res.text).toContain("data: [DONE]");
  });

  it("trims leading/trailing whitespace from the message", async () => {
    mockProvider.stream.mockReturnValue(fakeStream(["ok"]));

    await supertest(app)
      .post("/api/chat")
      .send({ message: "  ping  " });

    expect(mockProvider.stream).toHaveBeenCalledTimes(1);
    const params = mockProvider.stream.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(params.messages[0].content).toBe("ping");
  });
});

describe("CHAT.3 — SSE error event on provider failure", () => {
  it("writes an error data event when provider.stream throws", async () => {
    async function* failStream() {
      throw new Error("provider down");
      yield { text: "" }; // satisfies the return type; unreachable
    }
    mockProvider.stream.mockReturnValue(failStream());

    const res = await supertest(app)
      .post("/api/chat")
      .send({ message: "hi" });

    // Headers are already flushed as SSE, so status is 200 even on error.
    expect(res.status).toBe(200);
    expect(res.text).toContain('"error":"provider down"');
  });
});

// ── /api/agent ────────────────────────────────────────────────────────────────

describe("AGENT.1 — empty messages rejected", () => {
  it("returns 400 when messages is absent", async () => {
    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Pro")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("messages array is required");
  });

  it("returns 400 when messages is an empty array", async () => {
    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Pro")
      .send({ messages: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("messages array is required");
  });
});

describe("AGENT.2 — Free tier blocked", () => {
  it("returns 429 with limit=0 for Free tier", async () => {
    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Free")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_agent_limit_reached");
    expect(res.body.limit).toBe(0);
  });

  it("returns 429 with limit=0 for ContractorFree tier", async () => {
    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "ContractorFree")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(429);
    expect(res.body.limit).toBe(0);
  });
});

describe("AGENT.3 — Pro tier returns answer with quota headers", () => {
  it("returns 200 with answer and X-Agent-Calls quota headers", async () => {
    mockProvider.completeWithTools.mockResolvedValue({
      type: "answer",
      text: "Your home score is 82.",
    });

    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Pro")
      .send({ messages: [{ role: "user", content: "What is my score?" }] });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("answer");
    expect(res.body.text).toBe("Your home score is 82.");
    expect(res.headers["x-agent-calls-used"]).toBe("1");
    expect(res.headers["x-agent-calls-limit"]).toBe("10");
  });
});

describe("AGENT.4 — tool_calls response", () => {
  it("returns the full tool_calls payload from the provider", async () => {
    mockProvider.completeWithTools.mockResolvedValue({
      type:             "tool_calls",
      assistantMessage: { role: "assistant", content: [] },
      toolCalls:        [{ id: "tc_1", name: "get_property_score", input: { propertyId: "p1" } }],
    });

    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Pro")
      .send({ messages: [{ role: "user", content: "What is my score?" }] });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("tool_calls");
    expect(res.body.toolCalls).toHaveLength(1);
    expect(res.body.toolCalls[0].name).toBe("get_property_score");
  });
});

describe("AGENT.5 — unknown tier falls back to Free", () => {
  it("blocks a request with an unrecognised tier string", async () => {
    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", uid())
      .set("x-subscription-tier", "Enterprise")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(429);
    expect(res.body.limit).toBe(0);
  });
});

describe("AGENT.6 — daily limit enforced at tier cap", () => {
  it("Pro: blocks the 11th call (limit = 10)", async () => {
    mockProvider.completeWithTools.mockResolvedValue({ type: "answer", text: "ok" });
    const principal = uid();

    for (let i = 0; i < 10; i++) {
      await supertest(app)
        .post("/api/agent")
        .set("x-icp-principal", principal)
        .set("x-subscription-tier", "Pro")
        .send({ messages: [{ role: "user", content: "ping" }] });
    }

    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", principal)
      .set("x-subscription-tier", "Pro")
      .send({ messages: [{ role: "user", content: "ping" }] });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_agent_limit_reached");
    expect(res.body.limit).toBe(10);
  });

  it("Premium: blocks the 21st call (limit = 20)", async () => {
    mockProvider.completeWithTools.mockResolvedValue({ type: "answer", text: "ok" });
    const principal = uid();

    for (let i = 0; i < 20; i++) {
      await supertest(app)
        .post("/api/agent")
        .set("x-icp-principal", principal)
        .set("x-subscription-tier", "Premium")
        .send({ messages: [{ role: "user", content: "ping" }] });
    }

    const res = await supertest(app)
      .post("/api/agent")
      .set("x-icp-principal", principal)
      .set("x-subscription-tier", "Premium")
      .send({ messages: [{ role: "user", content: "ping" }] });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_agent_limit_reached");
    expect(res.body.limit).toBe(20);
  });
});
