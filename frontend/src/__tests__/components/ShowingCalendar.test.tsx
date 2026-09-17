/**
 * ShowingCalendar — real logic worth locking down (against the real
 * in-memory showingRequestService, not mocks):
 *   - only Accepted requests are shown as confirmed showings; Pending/
 *     Declined/AlternatePending are excluded
 *   - the empty state and Export iCal button are mutually exclusive on
 *     whether there are any confirmed showings
 *   - exporting builds an .ics Blob download containing only the
 *     confirmed showings
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ShowingCalendar from "@/components/ShowingCalendar";
import { showingRequestService } from "@/services/showingRequest";

beforeEach(() => {
  (showingRequestService as any).__reset();
});

function seed(overrides: Partial<Parameters<typeof showingRequestService.create>[0]> = {}) {
  return showingRequestService.create({
    propertyId: "prop-1", name: "Jamie Rivera", contact: "jamie@example.com",
    preferredTime: "Saturday 10am", ...overrides,
  });
}

describe("ShowingCalendar — empty state", () => {
  it("shows the empty message and no export button with no confirmed showings", () => {
    render(<ShowingCalendar propertyId="prop-1" />);
    expect(screen.getByText("No confirmed showings yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Export iCal")).not.toBeInTheDocument();
  });

  it("stays empty when requests exist but none are Accepted", () => {
    const req = seed();
    showingRequestService.decline(req.id);
    render(<ShowingCalendar propertyId="prop-1" />);
    expect(screen.getByText("No confirmed showings yet.")).toBeInTheDocument();
  });
});

describe("ShowingCalendar — confirmed showings", () => {
  it("lists only Accepted requests", () => {
    const accepted = seed({ name: "Jamie Rivera" });
    seed({ name: "Sam Lee" });
    showingRequestService.accept(accepted.id);

    render(<ShowingCalendar propertyId="prop-1" />);

    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Sam Lee")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Export iCal")).toBeInTheDocument();
  });
});

describe("ShowingCalendar — iCal export", () => {
  it("builds a calendar Blob download for the confirmed showings only", () => {
    const accepted = seed({ name: "Jamie Rivera" });
    seed({ name: "Sam Lee" });
    showingRequestService.accept(accepted.id);

    const createObjectURL = vi.fn().mockReturnValue("blob:showings");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<ShowingCalendar propertyId="prop-1" />);
    fireEvent.click(screen.getByLabelText("Export iCal"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:showings");

    clickSpy.mockRestore();
  });
});
