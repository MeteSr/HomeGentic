/**
 * Lead-form email relay (src/index.ts): routing by Origin, abuse controls,
 * validation, Turnstile and the Resend call it makes.
 *
 * Run: cd agents/email && npm test  (Node's test runner, no dependencies)
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import relay, { type Env } from "../src/index.ts";

const ORIGIN = "https://homegentic.app";
const ROUTE = { origin: ORIGIN, toEmail: "leads@homegentic.app", fromEmail: "noreply@homegentic.app", fromName: "HomeGentic" };

let ip = 0;
const env = (over: Partial<Env> = {}): Env =>
  ({ RESEND_API_KEY: "re_test", ROUTE_CONFIG: JSON.stringify([ROUTE]), ...over }) as Env;

/** A POST /send from a fresh IP (so the per-IP limit doesn't carry over). */
function send(body: unknown, init: { origin?: string; ip?: string; headers?: Record<string, string> } = {}) {
  return new Request("https://relay.example/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: init.origin ?? ORIGIN,
      "CF-Connecting-IP": init.ip ?? `10.0.0.${++ip}`,
      ...init.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const LEAD = { name: "Pat Buyer", email: "pat@example.com", message: "Interested in 12 Elm St" };

type Call = { url: string; init: RequestInit };
let calls: Call[];
let resendStatus: number;
let turnstileOk: boolean;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = []; resendStatus = 200; turnstileOk = true;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("turnstile")) return new Response(JSON.stringify({ success: turnstileOk }));
    return new Response(resendStatus === 200 ? "{}" : "boom", { status: resendStatus });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const resendBody = () => JSON.parse(String(calls.find((c) => c.url.includes("resend"))!.init.body));

describe("routing", () => {
  it("sends a lead to the route for its Origin, replying to the lead", async () => {
    const res = await relay.fetch(send(LEAD), env());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    const body = resendBody();
    assert.deepEqual(body.to, [ROUTE.toEmail]);
    assert.equal(body.from, "HomeGentic <noreply@homegentic.app>");
    assert.equal(body.reply_to, LEAD.email);
    assert.match(body.text, /Message: Interested in 12 Elm St/);
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer re_test");
  });

  it("refuses an Origin with no route, and sends nothing", async () => {
    const res = await relay.fetch(send(LEAD, { origin: "https://evil.example" }), env());
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });

  it("answers CORS preflight only for a known Origin", async () => {
    const pre = (origin: string) => new Request("https://relay.example/send", { method: "OPTIONS", headers: { Origin: origin } });
    assert.equal((await relay.fetch(pre(ORIGIN), env())).status, 204);
    assert.equal((await relay.fetch(pre("https://evil.example"), env())).status, 403);
  });

  it("404s other paths and methods", async () => {
    assert.equal((await relay.fetch(new Request("https://relay.example/send", { headers: { Origin: ORIGIN } }), env())).status, 404);
    assert.equal((await relay.fetch(new Request("https://relay.example/other", { method: "POST", headers: { Origin: ORIGIN } }), env())).status, 404);
  });

  it("500s on a broken ROUTE_CONFIG instead of sending anywhere", async () => {
    assert.equal((await relay.fetch(send(LEAD), env({ ROUTE_CONFIG: "not json" }))).status, 500);
    assert.equal(calls.length, 0);
  });
});

describe("validation", () => {
  it("needs a name and an email", async () => {
    assert.equal((await relay.fetch(send({ email: "a@b.co" }), env())).status, 422);
    assert.equal((await relay.fetch(send({ name: "  ", email: "a@b.co" }), env())).status, 422);
  });

  it("refuses header injection and malformed addresses", async () => {
    for (const lead of [
      { name: "Pat\r\nBcc: x@y.z", email: "pat@example.com" },
      { name: "Pat", email: "pat@example.com>, x@y.z" },
      { name: "Pat", email: "no-at-sign" },
      { name: "Pat", email: "a@@b.co" },
    ]) assert.equal((await relay.fetch(send(lead), env())).status, 422, JSON.stringify(lead));
    assert.equal(calls.length, 0);
  });

  it("caps field lengths and types", async () => {
    assert.equal((await relay.fetch(send({ ...LEAD, message: "x".repeat(5001) }), env())).status, 422);
    assert.equal((await relay.fetch(send({ ...LEAD, phone: 5551234 }), env())).status, 422);
    assert.equal((await relay.fetch(send({ ...LEAD, estimatedPrice: "lots" }), env())).status, 422);
  });

  it("refuses bodies over 16 KiB, declared or actual", async () => {
    assert.equal((await relay.fetch(send(LEAD, { headers: { "Content-Length": "20000" } }), env())).status, 413);
    assert.equal((await relay.fetch(send({ ...LEAD, pad: "x".repeat(17_000) }), env())).status, 413);
  });

  it("400s invalid JSON", async () => {
    assert.equal((await relay.fetch(send("{nope"), env())).status, 400);
    assert.equal((await relay.fetch(send("null"), env())).status, 400);
  });

  it("escapes lead text in the HTML email", async () => {
    await relay.fetch(send({ ...LEAD, message: `<img src=x onerror="alert(1)">` }), env());
    const html = resendBody().html as string;
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  });
});

describe("abuse controls", () => {
  it("drops honeypot submissions silently", async () => {
    const res = await relay.fetch(send({ ...LEAD, website: "http://spam" }), env());
    assert.equal(res.status, 200);
    assert.equal(calls.length, 0);
  });

  it("allows 5 sends per IP per window, then 429s", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await relay.fetch(send(LEAD, { ip: "192.0.2.1" }), env())).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  });

  it("keeps the limit in KV when bound", async () => {
    const store = new Map<string, string>();
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v); } };
    const e = env({ RATE_LIMIT_KV: kv as unknown as KVNamespace });
    for (let i = 0; i < 5; i++) assert.equal((await relay.fetch(send(LEAD, { ip: "192.0.2.2" }), e)).status, 200);
    assert.equal((await relay.fetch(send(LEAD, { ip: "192.0.2.2" }), e)).status, 429);
    assert.equal(JSON.parse(store.get("email-rl:192.0.2.2")!).count, 5);
  });

  it("requires a valid Turnstile token when configured", async () => {
    const e = env({ TURNSTILE_SECRET_KEY: "ts_secret" });
    assert.equal((await relay.fetch(send(LEAD), e)).status, 403);
    turnstileOk = false;
    assert.equal((await relay.fetch(send({ ...LEAD, turnstileToken: "bad" }), e)).status, 403);
    turnstileOk = true;
    assert.equal((await relay.fetch(send({ ...LEAD, "cf-turnstile-response": "good" }), e)).status, 200);
    assert.equal(calls.filter((c) => c.url.includes("resend")).length, 1);
  });
});

it("502s when Resend refuses the email", async () => {
  resendStatus = 422;
  const origError = console.error; console.error = () => {};
  try {
    assert.equal((await relay.fetch(send(LEAD), env())).status, 502);
  } finally { console.error = origError; }
});
