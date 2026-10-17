/**
 * src/security.ts — Worker hardening helpers.
 */
import { describe, it, expect } from "@jest/globals";
import {
  escapeHtml, isAllowedRedirectUrl, timingSafeEqualStr, sanitiseAgentMessages,
  redactRecord, readJsonBody, HttpError, CHECKOUT_SESSION_RE,
} from "../src/security";

describe("escapeHtml", () => {
  it("escapes markup and strips newlines", () => {
    expect(escapeHtml(`Jane</p><a href='x'>"\n`)).toBe("Jane&lt;/p&gt;&lt;a href=&#39;x&#39;&gt;&quot; ");
  });
  it("bounds length and handles non-strings", () => {
    expect(escapeHtml("x".repeat(500), 10)).toHaveLength(10);
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("isAllowedRedirectUrl", () => {
  const origins = ["https://app.test", undefined];
  it("accepts same-origin URLs only", () => {
    expect(isAllowedRedirectUrl("https://app.test/payment-success?x=1", origins)).toBe(true);
    expect(isAllowedRedirectUrl("https://evil.test/", origins)).toBe(false);
    expect(isAllowedRedirectUrl("https://app.test.evil.test/", origins)).toBe(false);
    expect(isAllowedRedirectUrl("javascript:alert(1)", origins)).toBe(false);
    expect(isAllowedRedirectUrl(42, origins)).toBe(false);
  });
  it("only localhost when no origin is configured", () => {
    expect(isAllowedRedirectUrl("http://localhost:3000/x", [])).toBe(true);
    expect(isAllowedRedirectUrl("https://evil.test/", [])).toBe(false);
  });
});

describe("timingSafeEqualStr", () => {
  it("compares correctly", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abd", "abc")).toBe(false);
    expect(timingSafeEqualStr("ab", "abc")).toBe(false);
    expect(timingSafeEqualStr("", "abc")).toBe(false);
  });
});

describe("sanitiseAgentMessages", () => {
  it("rejects bad roles, empty and over-long arrays", () => {
    expect(sanitiseAgentMessages([])).toBeNull();
    expect(sanitiseAgentMessages([{ role: "system", content: "x" }])).toBeNull();
    expect(sanitiseAgentMessages(Array(25).fill({ role: "user", content: "x" }))).toBeNull();
  });
  it("clamps text", () => {
    const out = sanitiseAgentMessages([{ role: "user", content: "x".repeat(20_000) }])!;
    expect(out[0].content).toHaveLength(8_000);
  });
  it("keeps tool_use / tool_result blocks", () => {
    const out = sanitiseAgentMessages([
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "list_bids", input: { a: 1 } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
    ])!;
    expect(out[1].content[0]).toEqual({ type: "tool_result", tool_use_id: "t1", content: "{}" });
  });
});

describe("redactRecord", () => {
  it("drops sensitive keys and nested values", () => {
    expect(redactRecord({ route: "/x", authToken: "t", password: "p", nested: { a: 1 }, n: 3 }))
      .toEqual({ route: "/x", n: 3 });
  });
});

describe("readJsonBody", () => {
  it("throws 413 over the cap", async () => {
    const r = new Request("https://x.test", { method: "POST", body: "x".repeat(100) });
    await expect(readJsonBody(r, 10)).rejects.toEqual(new HttpError(413, "Request body too large"));
  });
  it("throws 400 on bad JSON", async () => {
    const r = new Request("https://x.test", { method: "POST", body: "{nope" });
    await expect(readJsonBody(r)).rejects.toMatchObject({ status: 400 });
  });
});

describe("CHECKOUT_SESSION_RE", () => {
  it("accepts only cs_test_/cs_live_ + alphanumerics", () => {
    expect(CHECKOUT_SESSION_RE.test("cs_test_a1B2")).toBe(true);
    expect(CHECKOUT_SESSION_RE.test("cs_live_a1B2")).toBe(true);
    expect(CHECKOUT_SESSION_RE.test("x/../../customers")).toBe(false);
    expect(CHECKOUT_SESSION_RE.test("cs_test_a?limit=100")).toBe(false);
  });
});
