/**
 * aiConnectors: the ChatGPT / Claude connector (ICP MCP) helpers behind the
 * Settings "AI assistants" tab and the ask bar links (docs/AI_CONNECTORS.md).
 *
 *  AIC.1 off unless VITE_AI_CONNECTORS is "1" (the connector needs mainnet),
 *        or an e2e test turns it on
 *  AIC.2 askUrl prefills the question for ChatGPT and Claude, naming
 *        homegentic.app so the connector opens the right app
 *  AIC.3 the "I've connected it" mark is kept per browser, and a blocked
 *        storage doesn't throw
 *  AIC.4 sample prompts are short, and none mentions an action
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  connectorsLive,
  askUrl,
  connectorPrompt,
  isConnectorConnected,
  setConnectorConnected,
  SAMPLE_PROMPTS,
  APP_HOST,
} from "@/services/aiConnectors";

describe("aiConnectors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as any).__e2e_ai_connectors;
    localStorage.clear();
  });

  it("AIC.1 is off by default and on with VITE_AI_CONNECTORS=1 or the e2e flag", () => {
    vi.stubEnv("VITE_AI_CONNECTORS", "");
    expect(connectorsLive()).toBe(false);
    vi.stubEnv("VITE_AI_CONNECTORS", "1");
    expect(connectorsLive()).toBe(true);
    vi.stubEnv("VITE_AI_CONNECTORS", "");
    (window as any).__e2e_ai_connectors = true;
    expect(connectorsLive()).toBe(true);
  });

  it("AIC.2 builds prefilled ChatGPT and Claude links that name the app", () => {
    const q = "What maintenance is due this spring?";
    const prompt = connectorPrompt(q);
    expect(prompt).toContain(APP_HOST);
    expect(prompt).toContain(q);
    const gpt = new URL(askUrl("chatgpt", q));
    expect(gpt.origin).toBe("https://chatgpt.com");
    expect(gpt.searchParams.get("q")).toBe(prompt);
    const claude = new URL(askUrl("claude", q));
    expect(claude.origin + claude.pathname).toBe("https://claude.ai/new");
    expect(claude.searchParams.get("q")).toBe(prompt);
  });

  it("AIC.2 an empty question still opens the app with a starter prompt", () => {
    expect(connectorPrompt("   ")).toContain(APP_HOST);
    expect(new URL(askUrl("claude", "")).searchParams.get("q")).toBeTruthy();
  });

  it("AIC.3 remembers the connected mark and survives blocked storage", () => {
    expect(isConnectorConnected()).toBe(false);
    setConnectorConnected(true);
    expect(isConnectorConnected()).toBe(true);
    setConnectorConnected(false);
    expect(isConnectorConnected()).toBe(false);

    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isConnectorConnected()).toBe(false);
    expect(() => setConnectorConnected(true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("AIC.4 sample prompts are questions about the user's own records", () => {
    expect(SAMPLE_PROMPTS.length).toBeGreaterThanOrEqual(5);
    for (const p of SAMPLE_PROMPTS) {
      expect(p.length).toBeLessThan(120);
      expect(p).not.toMatch(/\b(delete|transfer|pay|buy)\b/i);
    }
  });
});
