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

function connectSrc(): string {
  const csp = cspContent();
  const m = csp.match(/(?:^|;)\s*connect-src\s+([^;]*)/);
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
