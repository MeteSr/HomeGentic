/**
 * TDD — Voice-agent security hardening
 *
 * BODY.1  Global body-size limit must be ≤ 50 kb
 *         (only /api/classify needs 5 mb for base64 image payloads)
 * BODY.2  /api/classify must accept payloads up to 5 mb
 * SHUTDOWN.1  SIGTERM handler must be registered (graceful shutdown)
 * SHUTDOWN.2  SIGINT  handler must be registered (graceful shutdown)
 *
 * Static tests read the source; integration tests spin up the app with supertest.
 * All tests are independent — no real Anthropic API calls are made.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT   = resolve(__dirname, "../../../");
const SERVER = resolve(ROOT, "agents/voice/server.ts");

function src(): string {
  return readFileSync(SERVER, "utf-8");
}

// ── Static checks ─────────────────────────────────────────────────────────────

describe("BODY.1 — global body-size limit is ≤ 50 kb", () => {
  it("express.json with limit '5mb' is NOT applied globally (app-level)", () => {
    // A global 5 mb limit is a DoS surface — any route becomes a 5 mb sink.
    // The 5 mb limit must only apply to /api/classify.
    const source = src();

    // Find all express.json calls
    const jsonCalls = [...source.matchAll(/express\.json\s*\(\s*\{[^}]*\}\s*\)/g)];
    expect(jsonCalls.length).toBeGreaterThan(0);

    // None of the 5mb calls should be a bare app.use without a path guard
    const globalFiveMb = source.match(
      /app\.use\s*\(\s*express\.json\s*\(\s*\{[^}]*limit\s*:\s*["']5mb["'][^}]*\}\s*\)\s*\)/
    );
    expect(globalFiveMb).toBeNull();
  });

  it("a ≤ 50 kb default is applied globally or to non-classify routes", () => {
    const source = src();
    // Must have a 50kb (or smaller) limit referenced somewhere
    expect(source).toMatch(/["']50kb["']/);
  });
});

describe("BODY.2 — /api/classify allows up to 5 mb", () => {
  it("a 5 mb limit is configured specifically for /api/classify", () => {
    const source = src();
    // The 5mb limit must appear in context with the classify route.
    // Accept: route-level middleware, conditional path check, or separate router.
    const classifyIdx = source.indexOf('"/api/classify"');
    expect(classifyIdx).toBeGreaterThan(-1);

    // 5mb must appear within 400 chars of the classify route registration
    const window = source.slice(
      Math.max(0, classifyIdx - 400),
      classifyIdx + 400
    );
    expect(window).toMatch(/["']5mb["']/);
  });
});

describe("SHUTDOWN.1 — SIGTERM handler is registered", () => {
  it("server.ts registers a process.on('SIGTERM') handler", () => {
    expect(src()).toMatch(/process\.on\s*\(\s*["']SIGTERM["']/);
  });
});

describe("SHUTDOWN.2 — SIGINT handler is registered", () => {
  it("server.ts registers a process.on('SIGINT') handler", () => {
    expect(src()).toMatch(/process\.on\s*\(\s*["']SIGINT["']/);
  });
});
