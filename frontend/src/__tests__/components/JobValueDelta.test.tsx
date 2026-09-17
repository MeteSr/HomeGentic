/**
 * JobValueDelta — real logic worth locking down:
 *   - renders nothing when estimateJobValueDelta returns a falsy delta
 *   - otherwise passes serviceType/currentScore through and shows the
 *     formatted, "+"-prefixed dollar delta
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobValueDelta } from "@/components/JobValueDelta";

const { mockEstimateDelta } = vi.hoisted(() => ({ mockEstimateDelta: vi.fn() }));
vi.mock("@/services/scoreToValue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/scoreToValue")>();
  return { ...actual, estimateJobValueDelta: mockEstimateDelta };
});

beforeEach(() => vi.clearAllMocks());

describe("JobValueDelta — no delta", () => {
  it("renders nothing when the delta is 0 or null", () => {
    mockEstimateDelta.mockReturnValue(0);
    expect(render(<JobValueDelta serviceType="HVAC" currentScore={95} />).container).toBeEmptyDOMElement();

    mockEstimateDelta.mockReturnValue(null);
    expect(render(<JobValueDelta serviceType="HVAC" currentScore={95} />).container).toBeEmptyDOMElement();
  });
});

describe("JobValueDelta — with a delta", () => {
  it("passes serviceType/currentScore through and shows the formatted dollar delta", () => {
    mockEstimateDelta.mockReturnValue(3500);
    render(<JobValueDelta serviceType="Roofing" currentScore={62} />);

    expect(mockEstimateDelta).toHaveBeenCalledWith("Roofing", 62);
    expect(screen.getByText("+$3,500")).toBeInTheDocument();
  });
});
