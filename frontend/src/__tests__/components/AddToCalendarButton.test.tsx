/**
 * #717 step 1: "Add to calendar" downloads a .ics file for one item.
 *
 *  AC.1 clicking downloads <name>.ics holding the event
 *  AC.2 the button names what it adds, for screen readers
 *  AC.3 nothing to add renders nothing
 *  AC.4 a list of events goes into one file
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";

let blobs: Blob[] = [];
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  blobs = [];
  clicked = [];
  (URL as any).createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return "blob:x";
  });
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("AddToCalendarButton", () => {
  it("AC.1 downloads an .ics file with the event", async () => {
    render(
      <AddToCalendarButton
        event={{ uid: "warranty-J1", date: "2028-01-15", title: "Warranty ends: HVAC" }}
        filename="warranty-hvac"
        label="HVAC warranty end"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add hvac warranty end to calendar/i }));
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("warranty-hvac.ics");
    expect(blobs[0].type).toBe("text/calendar;charset=utf-8");
    const text = await blobs[0].text();
    expect(text).toContain("SUMMARY:Warranty ends: HVAC");
    expect(text).toContain("DTSTART;VALUE=DATE:20280115");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("AC.2 shows short visible text", () => {
    render(<AddToCalendarButton event={{ uid: "a", date: "2028-01-15", title: "x" }} filename="a" label="x" />);
    expect(screen.getByRole("button")).toHaveTextContent("Add to calendar");
  });

  it("AC.3 renders nothing without an event", () => {
    const { container } = render(<AddToCalendarButton event={null} filename="a" label="x" />);
    expect(container).toBeEmptyDOMElement();
    const empty = render(<AddToCalendarButton event={[]} filename="a" label="x" />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("AC.4 puts a list of events in one file", async () => {
    render(
      <AddToCalendarButton
        event={[
          { uid: "tax-P1-homestead-2027", date: "2027-03-01", title: "Homestead exemption deadline" },
          { uid: "tax-P1-trim-2027", date: "2027-08-01", title: "TRIM notice" },
        ]}
        filename="tax-dates"
        label="tax dates"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add tax dates to calendar" }));
    const text = await blobs[0].text();
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(clicked[0].download).toBe("tax-dates.ics");
  });
});
