/**
 * #721: what a homeowner is told when they ask for quotes on work HomeGentic
 * has no contractor trade for (a subtype of Other, or Other itself).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OtherWorkNote, isOtherWork } from "@/components/OtherWorkNote";

describe("OtherWorkNote", () => {
  it("names the subtype and says where contractors find it", () => {
    render(<OtherWorkNote serviceType="Mold & Radon" />);
    expect(screen.getByTestId("other-work-note")).toHaveTextContent(
      "HomeGentic doesn't list contractors for Mold & Radon yet. Your request is posted as Other work, which contractors can find and bid on among open requests.",
    );
  });

  it("words plain Other on its own", () => {
    render(<OtherWorkNote serviceType="Other" />);
    expect(screen.getByTestId("other-work-note")).toHaveTextContent(
      "Other work isn't a trade contractors list on HomeGentic. Contractors can find your request and bid on it among open requests.",
    );
  });

  it("renders nothing for a named trade", () => {
    const { container } = render(<OtherWorkNote serviceType="HVAC" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("isOtherWork is true for Other and its subtypes only", () => {
    expect(isOtherWork("Other")).toBe(true);
    expect(isOtherWork("Septic")).toBe(true);
    expect(isOtherWork("Kitchen Remodel")).toBe(false);
  });
});
