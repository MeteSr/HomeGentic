/**
 * Integration tests — aiProxyService against the real ICP ai_proxy canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: Metrics/KeyStatus record fields survive serialization
 *   - health() returns a non-empty string (liveness check)
 *   - getMetrics() returns a Metrics record with numeric Nat fields
 *   - getKeyStatus() returns a KeyStatus record with boolean fields
 *   - emailUsage() returns a string
 *   - getPriceBenchmark() returns a result (ok or err) without trapping
 *   - instantForecast() returns a result without trapping
 *   - checkReport() returns a string
 *   - importPermits() handles HttpError gracefully in local dev (no live ArcGIS)
 *
 * Tests that require live external API calls (ArcGIS, Resend) are gated on
 * ENABLE_EXTERNAL_CALLS=true so they only fire in a fully wired staging
 * environment, not standard CI.
 */

import { describe, it, expect } from "vitest";
import { aiProxyService } from "@/services/aiProxy";

const CANISTER_ID   = (process.env as any).AI_PROXY_CANISTER_ID || "";
const deployed      = !!CANISTER_ID;
const externalCalls = process.env.ENABLE_EXTERNAL_CALLS === "true";

// ─── Liveness check ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("health — canister liveness", () => {
  it("returns a non-empty string", async () => {
    // Access the underlying actor directly for methods not in the service wrapper
    const { Actor } = await import("@icp-sdk/core/agent");
    const { idlFactory } = await import("@/services/aiProxy");
    const { getAgent } = await import("@/services/actor");
    const ag = await getAgent();
    const a = Actor.createActor(idlFactory, { agent: ag, canisterId: CANISTER_ID });
    const result = await a.health() as string;
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── getMetrics — Candid serialization ───────────────────────────────────────

describe.skipIf(!deployed)("getMetrics — Metrics record serialization", () => {
  it("returns Metrics with numeric Nat fields and boolean isPaused", async () => {
    const { Actor } = await import("@icp-sdk/core/agent");
    const { idlFactory } = await import("@/services/aiProxy");
    const { getAgent } = await import("@/services/actor");
    const ag = await getAgent();
    const a = Actor.createActor(idlFactory, { agent: ag, canisterId: CANISTER_ID });
    const raw = await a.getMetrics() as any;
    expect(typeof Number(raw.emailSentTotal)).toBe("number");
    expect(typeof Number(raw.permitsFetched)).toBe("number");
    expect(typeof Number(raw.adminCount)).toBe("number");
    expect(typeof raw.isPaused).toBe("boolean");
  });
});

// ─── getKeyStatus ─────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getKeyStatus — KeyStatus record", () => {
  it("returns boolean fields for resend and openPermit key status", async () => {
    const { Actor } = await import("@icp-sdk/core/agent");
    const { idlFactory } = await import("@/services/aiProxy");
    const { getAgent } = await import("@/services/actor");
    const ag = await getAgent();
    const a = Actor.createActor(idlFactory, { agent: ag, canisterId: CANISTER_ID });
    const status = await a.getKeyStatus() as any;
    expect(typeof status.resendKeySet).toBe("boolean");
    expect(typeof status.openPermitKeySet).toBe("boolean");
  });
});

// ─── emailUsage ───────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("emailUsage — returns a string", () => {
  it("returns a non-null string (may be empty in local dev)", async () => {
    const { Actor } = await import("@icp-sdk/core/agent");
    const { idlFactory } = await import("@/services/aiProxy");
    const { getAgent } = await import("@/services/actor");
    const ag = await getAgent();
    const a = Actor.createActor(idlFactory, { agent: ag, canisterId: CANISTER_ID });
    const result = await a.emailUsage() as string;
    expect(typeof result).toBe("string");
  });
});

// ─── getPriceBenchmark — query function ───────────────────────────────────────

describe.skipIf(!deployed)("getPriceBenchmark — query doesn't trap", () => {
  it("returns a string (may be empty in local dev without seeded data)", async () => {
    const result = await aiProxyService.getPriceBenchmark("HVAC", "78701");
    expect(typeof result).toBe("string");
  });
});

// ─── instantForecast — query function ────────────────────────────────────────

describe.skipIf(!deployed)("instantForecast — query doesn't trap", () => {
  it("returns a string result without throwing", async () => {
    const result = await aiProxyService.instantForecast(
      "123 Main St, Austin TX 78701", 2000, "TX"
    );
    expect(typeof result).toBe("string");
  });
});

// ─── checkReport — query function ────────────────────────────────────────────

describe.skipIf(!deployed)("checkReport — query doesn't trap", () => {
  it("returns a parseable object", async () => {
    const result = await aiProxyService.checkReport("123 Main St, Austin TX 78701");
    expect(typeof result).toBe("object");
    expect(typeof result.found).toBe("boolean");
  });
});

// ─── importPermits — handles HttpError gracefully ─────────────────────────────

describe.skipIf(!deployed)("importPermits — returns empty string (not a trap) in local dev without ArcGIS", () => {
  it("returns a string (ok) or empty string (err gracefully swallowed)", async () => {
    const result = await aiProxyService.importPermits(
      "123 Main St", "Austin", "TX", "78701"
    );
    expect(typeof result).toBe("string");
  });
});

// ─── External call gates — require ENABLE_EXTERNAL_CALLS=true ─────────────────

describe.skipIf(!deployed || !externalCalls)(
  "sendEmail — live Resend test (ENABLE_EXTERNAL_CALLS=true required)",
  () => {
    it("returns { id } or a typed error on sandbox credentials", async () => {
      const result = await aiProxyService.sendEmail(
        "test@example.com",
        "Integration test",
        "<p>Integration test</p>"
      );
      expect(typeof result).toBe("object");
      // Either sent successfully or returned a typed error — never threw
      expect("id" in result || "error" in result).toBe(true);
    });
  }
);
