/**
 * DocumentedValueSection — real logic worth locking down:
 *   - renders nothing when getDocumentedValueEstimate returns null
 *   - otherwise passes score/zip/homeValueDollars through and shows
 *     the formatted value range plus the raw score
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentedValueSection } from "@/components/DocumentedValueSection";

const { mockGetEstimate, mockFormatRange } = vi.hoisted(() => ({
  mockGetEstimate: vi.fn(),
  mockFormatRange: vi.fn(),
}));
vi.mock("@/services/scoreToValue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/scoreToValue")>();
  return { ...actual, getDocumentedValueEstimate: mockGetEstimate, formatValueRange: mockFormatRange };
});

beforeEach(() => vi.clearAllMocks());

describe("DocumentedValueSection — no estimate", () => {
  it("renders nothing when no estimate is available", () => {
    mockGetEstimate.mockReturnValue(null);
    const { container } = render(<DocumentedValueSection score={10} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DocumentedValueSection — with an estimate", () => {
  it("passes score/zip/homeValueDollars through and shows the formatted range and score", () => {
    mockGetEstimate.mockReturnValue({ low: 4000, high: 8000 });
    mockFormatRange.mockReturnValue("$4,000–$8,000");

    render(<DocumentedValueSection score={70} zip="94102" homeValueDollars={600000} />);

    expect(mockGetEstimate).toHaveBeenCalledWith(70, { zip: "94102", homeValueDollars: 600000 });
    expect(screen.getByText("$4,000–$8,000")).toBeInTheDocument();
    expect(screen.getByText(/score 70\/100/)).toBeInTheDocument();
  });
});
