/** ShowingCalendar (10.4.2) — confirmed showings from the requests passed in. */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ShowingCalendar from "@/components/ShowingCalendar";
import type { ShowingRequest } from "@/services/showingRequest";

const base: ShowingRequest = {
  id: "sr-1", propertyId: "p", name: "Alice", contact: "alice@example.com",
  preferredTime: "Saturday 10am", createdAt: 0, status: "Pending",
};

describe("ShowingCalendar", () => {
  it("shows the empty message when nothing is accepted", () => {
    render(<ShowingCalendar requests={[base, { ...base, id: "2", status: "Declined" }]} />);
    expect(screen.getByText(/no confirmed showings yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("lists only accepted showings with the buyer's time and a contact link", () => {
    render(<ShowingCalendar requests={[
      { ...base, id: "1", name: "Bob", status: "Accepted" },
      { ...base, id: "2", name: "Carol", status: "Pending" },
    ]} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Carol")).not.toBeInTheDocument();
    expect(screen.getByText(/Saturday 10am/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "alice@example.com" })).toHaveAttribute("href", "mailto:alice@example.com");
  });

  it("has no calendar export (buyer times are free text)", () => {
    render(<ShowingCalendar requests={[{ ...base, status: "Accepted" }]} />);
    expect(screen.queryByRole("button", { name: /ical/i })).not.toBeInTheDocument();
  });
});
