/**
 * ScoreHistoryChart — real geometry logic worth locking down:
 *   - one circle point per history entry
 *   - y-axis gridlines are limited to the [minS-5, maxS+5] window
 *     around the actual score range (not always all of 0/25/50/75/100)
 *   - x-axis date labels are sampled every `step` points (plus always
 *     the last point), not one per data point, once history is long
 *   - date labels are formatted as M/DD
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScoreHistoryChart } from "@/components/ScoreHistoryChart";
import type { ScoreSnapshot } from "@/services/scoreService";

function snapshot(score: number, timestamp: number): ScoreSnapshot {
  return { score, timestamp };
}

describe("ScoreHistoryChart — points", () => {
  it("renders one circle per history entry", () => {
    const history = [snapshot(40, 1), snapshot(55, 2), snapshot(60, 3)];
    const { container } = render(<ScoreHistoryChart history={history} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });
});

describe("ScoreHistoryChart — y-axis gridlines", () => {
  it("only shows gridlines within [minS-5, maxS+5] of the score range", () => {
    // scores 40..60 -> minS=30, maxS=70 -> window [25,75] -> only 25/50/75 qualify
    const history = [snapshot(40, 1), snapshot(50, 2), snapshot(60, 3)];
    const { container } = render(<ScoreHistoryChart history={history} />);
    const gridLabels = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent)
      .filter((t) => /^\d+$/.test(t ?? "") && ["0", "25", "50", "75", "100"].includes(t ?? ""));
    expect(gridLabels.sort()).toEqual(["25", "50", "75"]);
  });

  it("includes 0 and 100 when the score range spans near the edges", () => {
    const history = [snapshot(2, 1), snapshot(98, 2)];
    const { container } = render(<ScoreHistoryChart history={history} />);
    const gridLabels = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent)
      .filter((t) => ["0", "25", "50", "75", "100"].includes(t ?? ""));
    expect(gridLabels).toContain("0");
    expect(gridLabels).toContain("100");
  });
});

describe("ScoreHistoryChart — x-axis date labels", () => {
  it("formats a date label as M/DD", () => {
    const ts = new Date(2024, 0, 5).getTime(); // Jan 5, 2024
    const history = [snapshot(50, ts)];
    const { container } = render(<ScoreHistoryChart history={history} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("1/05");
  });

  it("samples date labels every `step` points plus the final point, not every point", () => {
    // 12 points -> step = floor(12/5) = 2 -> labels at i=0,2,4,6,8,10 plus forced last (11) = 7 labels
    const history = Array.from({ length: 12 }, (_, i) =>
      snapshot(50 + i, new Date(2024, 0, i + 1).getTime())
    );
    const { container } = render(<ScoreHistoryChart history={history} />);
    const dateLabels = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent)
      .filter((t) => /^\d+\/\d{2}$/.test(t ?? ""));
    expect(dateLabels).toHaveLength(7);
    expect(dateLabels[dateLabels.length - 1]).toBe("1/12"); // last point always included
  });
});
