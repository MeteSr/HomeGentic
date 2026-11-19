/**
 * TDD — CSP.1450: Content-Security-Policy hardening
 *
 * Four buyer-blocking issues in the CSP meta tag:
 *
 * CSP.1  script-src must not contain 'unsafe-inline'
 *        (defeats XSS protection entirely)
 * CSP.2  script-src must not contain 'unsafe-eval'
 *        (defeats XSS protection; Wasm needs 'wasm-unsafe-eval' instead)
 * CSP.3  connect-src must not hardcode http://localhost:3001
 *        (leaks dev URL into production bundle)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function cspContent(): string {
  const html = readFileSync(resolve(ROOT, "frontend/index.html"), "utf-8");
  // The content attribute is always in double quotes; single quotes appear *inside*
  // the CSP value (e.g. 'self', 'unsafe-inline'), so we must NOT exclude them from
  // the captured group.  Only stop at the closing double quote.
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i
  );
  if (!match) return ""; // no meta CSP — handled server-side (also acceptable)
  return match[1];
}

function scriptSrc(): string {
  const csp = cspContent();
  const m = csp.match(/(?:^|;)\s*script-src\s+([^;]*)/);
  return m ? m[1] : "";
}

describe("CSP.1 — script-src must not contain 'unsafe-inline'", () => {
  it("'unsafe-inline' is absent from script-src", () => {
    // 'unsafe-inline' makes CSP useless against XSS — any injected script runs.
    // Inline styles still need 'unsafe-inline' in style-src, which is a separate directive.
    expect(scriptSrc()).not.toContain("'unsafe-inline'");
  });
});

describe("CSP.2 — script-src must not contain 'unsafe-eval'", () => {
  it("'unsafe-eval' is absent from script-src", () => {
    // ICP agent Wasm should use 'wasm-unsafe-eval', not the broader 'unsafe-eval'.
    expect(scriptSrc()).not.toContain("'unsafe-eval'");
  });

  it("'wasm-unsafe-eval' is present when Wasm is needed", () => {
    // The ICP agent requires eval for Wasm; the safe narrowing is 'wasm-unsafe-eval'.
    // If there is no script-src at all the CSP is either server-side or default-src
    // catches it — either way 'wasm-unsafe-eval' must appear somewhere.
    const csp = cspContent();
    if (!csp) return; // no meta CSP — server-side header is fine
    expect(csp).toContain("'wasm-unsafe-eval'");
  });
});

describe("CSP.3 — connect-src must not hardcode http://localhost:3001", () => {
  it("http://localhost:3001 is absent from the CSP meta tag", () => {
    // In production the voice agent lives on a real domain.
    // A hardcoded localhost URL leaks the dev topology and is silently ignored by
    // the browser in prod, meaning the CSP no longer covers the real endpoint.
    const csp = cspContent();
    expect(csp).not.toContain("http://localhost:3001");
  });

  it("voice agent URL uses the %VITE_VOICE_AGENT_URL% build-time placeholder", () => {
    // Vite replaces %VITE_VOICE_AGENT_URL% at build time so the prod CSP gets the
    // real domain while dev gets http://localhost:3001 from .env.
    // If the placeholder is absent the prod CSP will block all voice agent requests.
    const html = readFileSync(resolve(ROOT, "frontend/index.html"), "utf-8");
    expect(html).toContain("%VITE_VOICE_AGENT_URL%");
  });
});

// ── CSP.4 — the meta CSP reaches the IC hosts the agent calls ───────────────────
// Browsers enforce the <meta> CSP and the _headers CSP together, so a host
// allowed in only one of them is still blocked. @icp-sdk/auth's sign-in agent
// has no host set on a deployed build (user-sign-in skill: leave it unset), and
// off an icp0.io/ic0.app page its default host is https://icp-api.io.
// Sign-in failed with "Refused to connect … icp-api.io" when only the header
// allowed it.

function connectSrc(csp: string): string[] {
  const m = csp.match(/(?:^|;)\s*connect-src\s+([^;]*)/);
  return m ? m[1].trim().split(/\s+/) : [];
}

describe("CSP.4 — meta connect-src allows the IC boundary-node hosts", () => {
  it("allows https://icp-api.io (the agent's default host for sign-in)", () => {
    expect(connectSrc(cspContent())).toContain("https://icp-api.io");
  });

  it("allows every IC host the generated _headers CSP allows", () => {
    const src = readFileSync(resolve(ROOT, "frontend/scripts/gen-ic-assets.mjs"), "utf-8");
    const headerConnect = src.match(/`connect-src ([^$`]*)/)?.[1] ?? "";
    const icHosts = headerConnect.split(/\s+/).filter((h) => /ic0\.app|icp0\.io|icp-api\.io/.test(h));
    expect(icHosts).toContain("https://icp-api.io");
    const meta = connectSrc(cspContent());
    for (const host of icHosts) expect(meta).toContain(host);
  });
});
