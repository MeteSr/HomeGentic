/**
 * ScoreSparkline — real logic worth locking down:
 *   - renders nothing with fewer than 2 history points
 *   - draws one polyline point per entry but marks only the LAST
 *     point with a circle
 *   - onExpand is optional: when given, clicking the container calls
 *     it and the "View history" label shows; when omitted, neither
 *     does
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScoreSparkline } from "@/components/ScoreSparkline";
import type { ScoreSnapshot } from "@/services/scoreService";

function snap(score: number, timestamp = Date.now()): ScoreSnapshot {
  return { score, timestamp };
}

describe("ScoreSparkline — minimum data", () => {
  it("renders nothing with 0 or 1 history points", () => {
    expect(render(<ScoreSparkline history={[]} />).container).toBeEmptyDOMElement();
    expect(render(<ScoreSparkline history={[snap(50)]} />).container).toBeEmptyDOMElement();
  });

  it("renders with 2 or more points", () => {
    const { container } = render(<ScoreSparkline history={[snap(50), snap(60)]} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("ScoreSparkline — points", () => {
  it("marks only the last point with a circle", () => {
    const { container } = render(<ScoreSparkline history={[snap(40), snap(55), snap(70)]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);

    const polyline = container.querySelector("polyline")!;
    const pointCount = polyline.getAttribute("points")!.trim().split(" ").length;
    expect(pointCount).toBe(3);
  });
});

describe("ScoreSparkline — onExpand", () => {
  it("calls onExpand on click and shows the View history label when provided", () => {
    const onExpand = vi.fn();
    const { container } = render(<ScoreSparkline history={[snap(40), snap(60)]} onExpand={onExpand} />);

    expect(screen.getByText("View history ↗")).toBeInTheDocument();
    fireEvent.click(container.firstChild as Element);
    expect(onExpand).toHaveBeenCalled();
  });

  it("hides the label and uses default cursor when onExpand is omitted", () => {
    const { container } = render(<ScoreSparkline history={[snap(40), snap(60)]} />);
    expect(screen.queryByText("View history ↗")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveStyle({ cursor: "default" });
  });
});
