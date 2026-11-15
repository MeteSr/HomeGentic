/**
 * "Thinking of selling?": when the yearly prompt shows for a home (one week a
 * year in Home Pulse, a four-week window on the dashboard, both picked from
 * the home's id so they don't all land at once) and whether Bid to List has
 * enough verified agents in the home's city to offer it.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_VERIFIED_AGENTS,
  bidToListOpen,
  isoWeekNumber,
  sellPromptDismissKey,
  sellPromptOnDashboard,
  sellPromptInPulse,
  sellPromptWeek,
} from "../../../../packages/shared/src/sellPrompt";

const WEEK = 7 * 86_400_000;
/** Noon UTC on the Wednesday of ISO week `w` of 2026 (Jan 1 2026 is a Thursday, in week 1). */
const inWeek = (w: number) => Date.UTC(2025, 11, 31, 12) + (w - 1) * WEEK;

describe("isoWeekNumber", () => {
  it("numbers weeks the ISO way", () => {
    expect(isoWeekNumber(Date.UTC(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(Date.UTC(2026, 10, 15))).toBe(46);
    expect(isoWeekNumber(Date.UTC(2027, 0, 1))).toBe(53);
    expect(isoWeekNumber(inWeek(10))).toBe(10);
  });
});

describe("sellPromptWeek", () => {
  it("is a stable week from 1 to 52 per home, spread across homes", () => {
    expect(sellPromptWeek("prop-1")).toBe(sellPromptWeek("prop-1"));
    const weeks = new Set(Array.from({ length: 200 }, (_, i) => sellPromptWeek(`prop-${i}`)));
    for (const w of weeks) expect(w >= 1 && w <= 52).toBe(true);
    expect(weeks.size).toBeGreaterThan(30);
  });
});

describe("when it shows", () => {
  const id = "prop-42";
  const w = sellPromptWeek(id);

  it("appears in Home Pulse in one week of the year only", () => {
    const hits = Array.from({ length: 52 }, (_, i) => i + 1).filter((n) => sellPromptInPulse(id, inWeek(n)));
    expect(hits).toEqual([w]);
  });

  it("appears on the dashboard for four weeks from that week, wrapping at the year end", () => {
    const hits = Array.from({ length: 52 }, (_, i) => i + 1).filter((n) => sellPromptOnDashboard(id, inWeek(n)));
    expect(hits).toHaveLength(4);
    expect(hits).toContain(w);
    expect(hits).toContain(((w + 2) % 52) + 1);
  });

  it("a dismissal lasts for the year's window, even one that runs over New Year", () => {
    const start = inWeek(w);
    const key = sellPromptDismissKey(id, start);
    expect(key).toBe(`hg_sell_prompt_dismissed:prop-42:${new Date(start).getUTCFullYear()}`);
    expect(sellPromptDismissKey(id, start + 3 * WEEK)).toBe(key);
    // Outside the window it's keyed by the current year.
    expect(sellPromptDismissKey("x", Date.UTC(2026, 5, 1))).toMatch(/:x:2026$/);
  });
});

describe("bidToListOpen", () => {
  it("needs at least MIN_VERIFIED_AGENTS verified agents in the city", () => {
    expect(MIN_VERIFIED_AGENTS).toBe(3);
    expect(bidToListOpen(2)).toBe(false);
    expect(bidToListOpen(3)).toBe(true);
  });
});
