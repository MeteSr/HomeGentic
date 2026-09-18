/**
 * landingStyles — a raw CSS string with no branching logic (and, per a
 * repo-wide import search, not currently referenced by any page — likely
 * leftover from an earlier design). The only real assertion worth making
 * is that it exports a non-trivial, well-formed stylesheet with its
 * documented ".hfl-" class namespace intact, so a typo can't silently
 * corrupt it if it's wired back up later.
 */

import { describe, it, expect } from "vitest";
import { CSS } from "@/pages/landingStyles";

describe("landingStyles.CSS", () => {
  it("exports a non-empty string", () => {
    expect(typeof CSS).toBe("string");
    expect(CSS.length).toBeGreaterThan(1000);
  });

  it("has balanced curly braces (well-formed CSS)", () => {
    const opens = (CSS.match(/{/g) ?? []).length;
    const closes = (CSS.match(/}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });

  it("defines its documented .hfl- design-token and layout classes", () => {
    for (const className of [".hfl {", ".hfl-actions", ".hfl-btn-main", ".hfl-dm-main"]) {
      expect(CSS).toContain(className);
    }
  });
});
