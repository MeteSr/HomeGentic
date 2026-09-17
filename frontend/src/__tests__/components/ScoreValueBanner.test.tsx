/**
 * ScoreValueBanner — real logic worth locking down:
 *   - renders nothing when getDocumentedValueEstimate returns null
 *     (e.g. score too low)
 *   - passes score/zip/homeValueDollars through to
 *     getDocumentedValueEstimate, and renders the formatted range plus
 *     the raw score
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScoreValueBanner } from "@/components/ScoreValueBanner";

const { mockGetEstimate, mockFormatRange } = vi.hoisted(() => ({
  mockGetEstimate: vi.fn(),
  mockFormatRange: vi.fn(),
}));
vi.mock("@/services/scoreToValue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/scoreToValue")>();
  return { ...actual, getDocumentedValueEstimate: mockGetEstimate, formatValueRange: mockFormatRange };
});

beforeEach(() => vi.clearAllMocks());

describe("ScoreValueBanner — no estimate", () => {
  it("renders nothing when no estimate is available", () => {
    mockGetEstimate.mockReturnValue(null);
    const { container } = render(<ScoreValueBanner score={20} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScoreValueBanner — with an estimate", () => {
  it("passes score/zip/homeValueDollars through and shows the formatted range and score", () => {
    mockGetEstimate.mockReturnValue({ low: 5000, high: 9000 });
    mockFormatRange.mockReturnValue("$5,000–$9,000");

    render(<ScoreValueBanner score={82} zip="78701" homeValueDollars={450000} />);

    expect(mockGetEstimate).toHaveBeenCalledWith(82, { zip: "78701", homeValueDollars: 450000 });
    expect(mockFormatRange).toHaveBeenCalledWith({ low: 5000, high: 9000 });
    expect(screen.getByText("$5,000–$9,000")).toBeInTheDocument();
    expect(screen.getByText(/score 82\/100/)).toBeInTheDocument();
  });
});
