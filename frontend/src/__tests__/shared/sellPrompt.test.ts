/**
 * "Thinking of selling?": when the yearly prompt shows for a home (one week a
 * year in Home Pulse, a four-week window on the dashboard, both picked from
 * the home's id so they don't all land at once) and whether Bid to List has
 * enough verified agents in the home's city to offer it.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_VERIFIED_AGENTS,
  SCORE_MOVE_POINTS,
  SCORE_MOVE_DAYS,
  VALUE_MOVE_PCT,
  bidToListOpen,
  indexValueRise,
  isoWeekNumber,
  sellPromptDismissKey,
  sellPromptOnDashboard,
  sellPromptInPulse,
  sellPromptMoveKey,
  sellPromptWeek,
  scoreRise,
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

describe("scoreRise: the score moved enough to prompt", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 10, 16);
  const snap = (score: number, daysAgo: number) => ({ score, timestamp: now - daysAgo * DAY });

  it("needs a rise of SCORE_MOVE_POINTS over the earliest snapshot in the last SCORE_MOVE_DAYS days", () => {
    expect(SCORE_MOVE_POINTS).toBe(10);
    expect(SCORE_MOVE_DAYS).toBe(90);
    const history = [snap(50, 120), snap(62, 80), snap(66, 40), snap(72, 0)];
    // 120 days ago is outside the window, so the rise is counted from 62.
    expect(scoreRise(history, 72, now)).toEqual({ from: 62, to: 72, sinceMs: now - 80 * DAY });
    expect(scoreRise(history, 71, now)).toBeNull();
  });

  it("never prompts on a drop, a flat score, or without history", () => {
    expect(scoreRise([snap(80, 60), snap(60, 0)], 60, now)).toBeNull();
    expect(scoreRise([snap(70, 0)], 70, now)).toBeNull();
    expect(scoreRise([], 90, now)).toBeNull();
  });

  it("after 'Not now' it needs another full rise above the score the owner dismissed at", () => {
    const history = [snap(50, 60), snap(65, 0)];
    expect(scoreRise(history, 65, now, 60)).toBeNull();
    expect(scoreRise(history, 70, now, 60)).toEqual({ from: 50, to: 70, sinceMs: now - 60 * DAY });
  });
});

describe("indexValueRise: the index estimate moved enough to prompt", () => {
  // Index 100 a year before the latest quarter, then up.
  const series: [number, number, number][] = [
    [2024, 1, 90],
    [2024, 2, 95],
    [2025, 3, 100],
    [2025, 4, 101],
    [2026, 1, 102],
    [2026, 2, 104],
    [2026, 3, 106],
  ];

  it("needs the state index up VALUE_MOVE_PCT over the last four quarters, and gives the estimate since the loan", () => {
    expect(VALUE_MOVE_PCT).toBe(5);
    const rise = indexValueRise(300_000, series, { year: 2024, quarter: 1 });
    expect(rise).toEqual({
      changePct: 6,
      from: { year: 2025, quarter: 3 },
      to: { year: 2026, quarter: 3 },
      // 300,000 × 106 / 90, rounded to $1,000.
      estimate: 353_000,
    });
  });

  it("counts from the loan's quarter when the loan is under a year old", () => {
    const rise = indexValueRise(300_000, series, { year: 2025, quarter: 4 });
    expect(rise).toBeNull(); // 106 / 101 is under 5%
    const steep: [number, number, number][] = [...series.slice(0, -1), [2026, 3, 108]];
    expect(indexValueRise(300_000, steep, { year: 2025, quarter: 4 })).toMatchObject({
      changePct: 7,
      from: { year: 2025, quarter: 4 },
      estimate: 321_000,
    });
  });

  it("never prompts on a fall, a small rise, or missing data", () => {
    const flat: [number, number, number][] = [...series.slice(0, -1), [2026, 3, 104]];
    expect(indexValueRise(300_000, flat, { year: 2024, quarter: 1 })).toBeNull();
    const down: [number, number, number][] = [...series.slice(0, -1), [2026, 3, 90]];
    expect(indexValueRise(300_000, down, { year: 2024, quarter: 1 })).toBeNull();
    expect(indexValueRise(null, series, { year: 2024, quarter: 1 })).toBeNull();
    expect(indexValueRise(300_000, series, null)).toBeNull();
    expect(indexValueRise(300_000, [], { year: 2024, quarter: 1 })).toBeNull();
    // The quarter a year back isn't in the series.
    expect(indexValueRise(300_000, series.slice(3), { year: 2024, quarter: 1 })).toBeNull();
  });

  it("after 'Not now' it needs the estimate another VALUE_MOVE_PCT above the value the owner dismissed at", () => {
    expect(indexValueRise(300_000, series, { year: 2024, quarter: 1 }, 340_000)).toBeNull();
    expect(indexValueRise(300_000, series, { year: 2024, quarter: 1 }, 336_000)).not.toBeNull();
  });
});

describe("sellPromptMoveKey", () => {
  it("is one key per home", () => {
    expect(sellPromptMoveKey("prop-9")).toBe("hg_sell_prompt_move:prop-9");
  });
});
