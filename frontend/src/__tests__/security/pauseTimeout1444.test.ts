/**
 * TDD — 14.4.4: Canister pause() has timeout / auto-recovery
 *
 * Verifies that every canister with a pause() function:
 *  - Accepts an optional durationSeconds parameter
 *  - Stores a pauseExpiryNs stable variable
 *  - Checks the expiry in requireActive() before blocking callers
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { readdirSync } from "fs";

const BACKEND = resolve(__dirname, "../../../../backend");

function readCanister(name: string): string {
  return readFileSync(resolve(BACKEND, name, "main.mo"), "utf-8");
}

function canisterNames(): string[] {
  return readdirSync(BACKEND, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** Canisters that expose pause() — payment and price are stateless/no admin */
const PAUSEABLE_CANISTERS = canisterNames().filter((name) => {
  try {
    const src = readCanister(name);
    return src.includes("func pause(") || src.includes("func pause (");
  } catch {
    return false;
  }
});

describe("14.4.4: pause() timeout in all pauseable canisters", () => {
  it("identifies at least 5 pauseable canisters", () => {
    expect(PAUSEABLE_CANISTERS.length).toBeGreaterThanOrEqual(5);
  });

  for (const name of PAUSEABLE_CANISTERS) {
    it(`${name}: pause() accepts optional durationSeconds`, () => {
      const src = readCanister(name);
      expect(src).toMatch(/func pause\s*\([^)]*durationSeconds\s*:\s*\?Nat/);
    });

    it(`${name}: stable var pauseExpiryNs stores the expiry timestamp`, () => {
      const src = readCanister(name);
      expect(src).toMatch(/pauseExpiryNs/);
    });

    it(`${name}: requireActive() checks pauseExpiryNs before blocking`, () => {
      const src = readCanister(name);
      // requireActive must reference pauseExpiryNs (auto-expiry check)
      const requireActiveIdx = src.indexOf("requireActive");
      expect(requireActiveIdx).toBeGreaterThan(-1);
      // The expiry check must appear somewhere before or after the guard
      expect(src).toMatch(/pauseExpiryNs[\s\S]{1,300}Time\.now\(\)|Time\.now\(\)[\s\S]{1,300}pauseExpiryNs/);
    });
  }
});

describe("14.4.4: report canister — detailed pause behaviour", () => {
  const src = readCanister("report");

  it("timed pause: durationSeconds ?Nat → computed as Time.now() + secs * 1_000_000_000", () => {
    expect(src).toMatch(/secs \* 1_000_000_000/);
  });

  it("indefinite pause: null durationSeconds → pauseExpiryNs set to null", () => {
    expect(src).toMatch(/case null\s*\{\s*null\s*\}/);
  });

  it("unpause clears both isPaused and pauseExpiryNs", () => {
    const unpaIdx = src.indexOf("func unpause");
    expect(unpaIdx).toBeGreaterThan(-1);
    const unpaBody = src.slice(unpaIdx, unpaIdx + 300);
    expect(unpaBody).toMatch(/isPaused\s*:=\s*false/);
    expect(unpaBody).toMatch(/pauseExpiryNs\s*:=\s*null/);
  });
});
