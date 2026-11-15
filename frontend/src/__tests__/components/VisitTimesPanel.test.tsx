/**
 * VisitTimesPanel: the visit on an accepted quote. The contractor offers up
 * to five times; the homeowner books one, asks for others or cancels. Copy
 * says what actually happens (the other side is notified; a reminder goes out
 * the day before a booked visit).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisitTimesPanel } from "@/components/VisitTimesPanel";
import { canisterError } from "@/services/candid";
import type { VisitBooking } from "@/services/visitBooking";

const m = vi.hoisted(() => ({
  getVisitBookings: vi.fn(),
  offerVisitTimes: vi.fn(),
  bookVisitTime: vi.fn(),
  askForNewVisitTimes: vi.fn(),
  cancelVisit: vi.fn(),
}));
vi.mock("@/services/visitBooking", async (orig) => ({ ...(await orig<any>()), ...m }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
const slotA = { startsAt: at(2, 9), endsAt: at(2, 11) };
const slotB = { startsAt: at(3, 13), endsAt: at(3, 15) };
const booking = (over: Partial<VisitBooking> = {}): VisitBooking => ({
  quoteId: "q1",
  requestId: "r1",
  status: "timesOffered",
  offered: [slotA, slotB],
  booked: null,
  note: "I'll call 30 minutes ahead",
  updatedAt: Date.now(),
  ...over,
});
const withBooking = (b: VisitBooking | null) =>
  m.getVisitBookings.mockResolvedValue(new Map(b ? [[b.quoteId, b]] : []));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("homeowner", () => {
  it("says times will come from the contractor when none are offered yet", async () => {
    withBooking(null);
    render(<VisitTimesPanel quoteId="q1" role="homeowner" otherName="Cool Air Co" />);
    expect(await screen.findByText(/when cool air co offers visit times/i)).toBeInTheDocument();
  });

  it("books one of the offered times", async () => {
    withBooking(booking());
    m.bookVisitTime.mockResolvedValue(booking({ status: "booked", booked: slotB }));
    render(<VisitTimesPanel quoteId="q1" role="homeowner" otherName="Cool Air Co" />);
    expect(await screen.findByText("I'll call 30 minutes ahead")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /^book /i });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(m.bookVisitTime).toHaveBeenCalledWith("q1", 1));
    expect(await screen.findByText(/visit booked/i)).toBeInTheDocument();
    expect(screen.getByText(/reminder the day before/i)).toBeInTheDocument();
  });

  it("asks for other times when none work", async () => {
    withBooking(booking());
    m.askForNewVisitTimes.mockResolvedValue(booking({ status: "newTimesRequested" }));
    render(<VisitTimesPanel quoteId="q1" role="homeowner" otherName="Cool Air Co" />);
    fireEvent.click(await screen.findByRole("button", { name: /none of these work/i }));
    await waitFor(() => expect(m.askForNewVisitTimes).toHaveBeenCalledWith("q1"));
    expect(await screen.findByText(/you asked cool air co for other times/i)).toBeInTheDocument();
  });

  it("cancels a booked visit", async () => {
    withBooking(booking({ status: "booked", booked: slotA }));
    m.cancelVisit.mockResolvedValue(booking({ status: "cancelled" }));
    render(<VisitTimesPanel quoteId="q1" role="homeowner" otherName="Cool Air Co" />);
    fireEvent.click(await screen.findByRole("button", { name: /cancel visit/i }));
    await waitFor(() => expect(m.cancelVisit).toHaveBeenCalledWith("q1"));
    expect(await screen.findByText(/visit cancelled/i)).toBeInTheDocument();
  });

  it("shows the canister's reason when booking fails", async () => {
    withBooking(booking());
    m.bookVisitTime.mockRejectedValue(canisterError({ InvalidInput: "That time has passed; ask for other times" }));
    render(<VisitTimesPanel quoteId="q1" role="homeowner" />);
    fireEvent.click((await screen.findAllByRole("button", { name: /^book /i }))[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("That time has passed; ask for other times");
  });
});

describe("contractor", () => {
  const fillTime = (i: number, value: string, hours = "2") => {
    fireEvent.change(screen.getByLabelText(`Time ${i} starts`), { target: { value } });
    fireEvent.change(screen.getByLabelText(`Time ${i} length`), { target: { value: hours } });
  };
  const local = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  it("offers times with a note and tells the homeowner", async () => {
    withBooking(null);
    m.offerVisitTimes.mockResolvedValue(booking());
    render(<VisitTimesPanel quoteId="q1" role="contractor" />);
    await screen.findByLabelText("Time 1 starts");
    fillTime(1, local(slotA.startsAt));
    fireEvent.click(await screen.findByRole("button", { name: /add another time/i }));
    fillTime(2, local(slotB.startsAt), "3");
    fireEvent.change(screen.getByLabelText(/note for the homeowner/i), { target: { value: "Gate code please" } });
    fireEvent.click(screen.getByRole("button", { name: /send times/i }));
    await waitFor(() =>
      expect(m.offerVisitTimes).toHaveBeenCalledWith(
        "q1",
        [slotA, { startsAt: slotB.startsAt, endsAt: slotB.startsAt + 3 * HOUR }],
        "Gate code please",
      ),
    );
    expect(await screen.findByText(/waiting for the homeowner to pick/i)).toBeInTheDocument();
  });

  it("checks the times before sending", async () => {
    withBooking(null);
    render(<VisitTimesPanel quoteId="q1" role="contractor" />);
    fireEvent.click(await screen.findByRole("button", { name: /send times/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /each time must be in the future|offer at least one time/i,
    );
    fillTime(1, local(Date.now() + 200 * DAY));
    fireEvent.click(screen.getByRole("button", { name: /send times/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offer times within the next 180 days");
    expect(m.offerVisitTimes).not.toHaveBeenCalled();
  });

  it("allows at most five times", async () => {
    withBooking(null);
    render(<VisitTimesPanel quoteId="q1" role="contractor" />);
    const add = await screen.findByRole("button", { name: /add another time/i });
    for (let i = 0; i < 4; i++) fireEvent.click(add);
    expect(screen.getByLabelText("Time 5 starts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add another time/i })).toBeNull();
  });

  it("shows the booked time, and offering new times replaces it", async () => {
    withBooking(booking({ status: "booked", booked: slotA }));
    render(<VisitTimesPanel quoteId="q1" role="contractor" />);
    expect(await screen.findByText(/the homeowner booked/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /offer new times/i }));
    expect(screen.getByLabelText("Time 1 starts")).toBeInTheDocument();
    expect(screen.getByText(/replaces the booked time/i)).toBeInTheDocument();
  });

  it("opens the form when the homeowner asked for other times", async () => {
    withBooking(booking({ status: "newTimesRequested" }));
    render(<VisitTimesPanel quoteId="q1" role="contractor" />);
    expect(await screen.findByText(/the homeowner asked for other times/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Time 1 starts")).toBeInTheDocument();
  });
});
