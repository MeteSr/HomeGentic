/**
 * Request shape sent to Anthropic: prompt caching, the Sonnet 5.5 settings
 * (thinking, effort, refusal fallback) and the default model.
 *
 * AR.1  agent requests cache the tool list and system prompt
 * AR.2  chat and plain completions don't pay cache writes
 * AR.3  claude-sonnet-5-5 gets thinking between_tools, an explicit effort,
 *       and server-side refusal fallback; other models get none of these
 * AR.4  the default model is claude-sonnet-5-5 (code and wrangler.toml)
 * AR.5  refusals become a short, plain answer instead of empty text
 * AR.6  agent history keeps the thinking blocks Sonnet 5.5 returns
 * AR.7  the free AI budget counts cached tokens at their discounted weight
 */
import { readFileSync } from "fs";
import path from "path";
import { AnthropicProvider, REFUSAL_TEXT } from "../anthropicProvider";
import { resolveModel, type ToolDefinition } from "../provider";
import { sanitiseAgentMessages } from "../src/security";
import { weightedTokens } from "../src/aiGuard";

const tool = (name: string): ToolDefinition => ({
  name,
  description: `${name} tool`,
  parameters: { type: "object", properties: {}, required: [] },
});
const messages = [{ role: "user" as const, content: "When was the roof replaced?" }];

describe("AR.1 — agent requests cache the tool list and system prompt", () => {
  const body: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "tools", {
    system: "You are HomeGentic.",
    messages,
    tools: [tool("a"), tool("b"), tool("c")],
    maxTokens: 1024,
  });

  it("marks only the last tool, so the whole list is one cached prefix", () => {
    expect(body.tools.map((t: any) => t.cache_control)).toEqual([undefined, undefined, { type: "ephemeral" }]);
  });

  it("sends the system prompt as a cached text block", () => {
    expect(body.system).toEqual([{ type: "text", text: "You are HomeGentic.", cache_control: { type: "ephemeral" } }]);
  });
});

describe("AR.2 — chat and completions don't write to the cache", () => {
  it("keeps the chat system prompt a plain string", () => {
    const body: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "chat", {
      system: "Be brief.",
      messages,
      maxTokens: 200,
    });
    expect(body.system).toBe("Be brief.");
    expect(body.cache_control).toBeUndefined();
  });

  it("omits system when a completion has none", () => {
    const body: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "complete", { messages, maxTokens: 512 });
    expect("system" in body).toBe(false);
  });
});

describe("AR.3 — Sonnet 5.5 settings", () => {
  it("turns extended thinking off and sets effort per route", () => {
    const chat: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "chat", {
      system: "s",
      messages,
      maxTokens: 200,
    });
    const agent: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "tools", {
      system: "s",
      messages,
      tools: [tool("a")],
      maxTokens: 1024,
    });
    const doc: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "complete", { messages, maxTokens: 512 });
    for (const b of [chat, agent, doc]) expect(b.thinking).toEqual({ type: "between_tools" });
    expect(chat.output_config).toEqual({ effort: "low" });
    expect(doc.output_config).toEqual({ effort: "low" });
    expect(agent.output_config).toEqual({ effort: "medium" });
  });

  it("asks for server-side fallback on refusals", () => {
    const body: any = AnthropicProvider.requestBody("claude-sonnet-5-5", "chat", {
      system: "s",
      messages,
      maxTokens: 200,
    });
    expect(body.fallbacks).toBe("default");
    expect(AnthropicProvider.requestHeaders("claude-sonnet-5-5")).toEqual({
      "anthropic-beta": "server-side-fallback-2026-07-01",
    });
  });

  it("sends none of them to a model that would reject them", () => {
    const body: any = AnthropicProvider.requestBody("claude-sonnet-4-6", "tools", {
      system: "s",
      messages,
      tools: [tool("a")],
      maxTokens: 1024,
    });
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(AnthropicProvider.requestHeaders("claude-sonnet-4-6")).toEqual({});
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("AR.4 — default model", () => {
  const saved = process.env.AI_MODEL;
  afterEach(() => {
    if (saved === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = saved;
  });

  it("falls back to claude-sonnet-5-5", () => {
    delete process.env.AI_MODEL;
    expect(resolveModel()).toBe("claude-sonnet-5-5");
  });

  it("is set in wrangler.toml for production and testnet", () => {
    const toml = readFileSync(path.join(__dirname, "../wrangler.toml"), "utf8");
    const models = [...toml.matchAll(/^AI_MODEL\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(models).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5"]);
  });
});

describe("AR.5 — refusals", () => {
  it("answers with a plain sentence instead of empty text", () => {
    expect(AnthropicProvider.answerText([], "refusal")).toBe(REFUSAL_TEXT);
    expect(AnthropicProvider.answerText([{ type: "text", text: "Hi", citations: null } as any], "end_turn")).toBe("Hi");
  });
});

describe("AR.6 — agent history keeps thinking blocks", () => {
  const assistant = {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "Checking the roof job.", signature: "sig123" },
      { type: "redacted_thinking", data: "opaque" },
      { type: "tool_use", id: "t1", name: "get_jobs", input: {} },
    ],
  };
  const result = { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] };

  it("passes thinking and redacted_thinking blocks back unchanged", () => {
    const out = sanitiseAgentMessages([messages[0], assistant, result])!;
    expect(out).not.toBeNull();
    expect(out[1].content.slice(0, 2)).toEqual(assistant.content.slice(0, 2));
  });

  it("refuses a thinking block without a signature", () => {
    const bad = { role: "assistant", content: [{ type: "thinking", thinking: "x" }] };
    expect(sanitiseAgentMessages([messages[0], bad])).toBeNull();
  });
});

describe("AR.7 — free budget weighting with cached tokens", () => {
  it("counts cache writes at 1.25× and cache reads at 0.1×", () => {
    expect(
      weightedTokens({ inputTokens: 1_000, outputTokens: 0, cacheCreationTokens: 800, cacheReadTokens: 10_000 }),
    ).toBe(1_000 + 1_000 + 1_000);
  });
});
