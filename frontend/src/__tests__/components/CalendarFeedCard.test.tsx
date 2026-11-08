/**
 * #717: the calendar card on the Maintenance page.
 *
 *  CC.1 off: says what the link holds and who can read it, and offers to turn it on
 *  CC.2 turning it on publishes the owner's events and shows the link
 *  CC.3 on: refreshes the published events when the page opens
 *  CC.4 a new link and turning off both ask first
 *  CC.5 a failure says so instead of pretending it worked
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { svc, collect, toast } = vi.hoisted(() => ({
  svc: {
    getStatus: vi.fn(),
    enable: vi.fn(),
    reset: vi.fn(),
    disable: vi.fn(),
    sync: vi.fn(),
    feedUrl: (t: string) => `https://worker.test/calendar/${t}.ics`,
    webcalUrl: (t: string) => `webcal://worker.test/calendar/${t}.ics`,
  },
  collect: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/calendarFeed", async (orig) => {
  const actual = await orig<typeof import("@/services/calendarFeed")>();
  return { ...actual, calendarFeedService: svc, collectMyCalendarEvents: collect };
});
vi.mock("react-hot-toast", () => ({ default: toast }));

import { CalendarFeedCard } from "@/components/CalendarFeedCard";

const EVENTS = [{ uid: "warranty-J1", date: "2028-01-15", title: "Warranty ends: HVAC" }];
const STATUS = { token: "t".repeat(32), version: "v", eventCount: 1, updatedAt: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  collect.mockResolvedValue(EVENTS);
  (svc as any).available = () => true;
  svc.sync.mockResolvedValue("published");
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("CalendarFeedCard", () => {
  it("CC.1 explains the link and offers to turn it on", async () => {
    svc.getStatus.mockResolvedValue(null);
    render(<CalendarFeedCard />);
    expect(await screen.findByRole("button", { name: /turn on calendar link/i })).toBeInTheDocument();
    expect(screen.getByTestId("calendar-feed").textContent).toMatch(/anyone with the link/i);
    expect(collect).not.toHaveBeenCalled();
  });

  it("CC.2 turns the link on, publishes the events and shows the link", async () => {
    svc.getStatus.mockResolvedValueOnce(null).mockResolvedValue(STATUS);
    svc.enable.mockResolvedValue(STATUS.token);
    render(<CalendarFeedCard />);
    fireEvent.click(await screen.findByRole("button", { name: /turn on calendar link/i }));
    expect(await screen.findByTestId("calendar-feed-url")).toHaveTextContent(
      `https://worker.test/calendar/${STATUS.token}.ics`,
    );
    expect(svc.enable).toHaveBeenCalled();
    expect(svc.sync).toHaveBeenCalledWith(EVENTS, expect.objectContaining({ token: STATUS.token }));
    expect(screen.getByRole("link", { name: /open in calendar app/i })).toHaveAttribute(
      "href",
      `webcal://worker.test/calendar/${STATUS.token}.ics`,
    );
  });

  it("CC.3 refreshes the events when the page opens with the link on", async () => {
    svc.getStatus.mockResolvedValue(STATUS);
    render(<CalendarFeedCard />);
    await screen.findByTestId("calendar-feed-url");
    await waitFor(() => expect(svc.sync).toHaveBeenCalledWith(EVENTS, STATUS));
  });

  it("CC.4 asks before making a new link or turning it off", async () => {
    svc.getStatus.mockResolvedValue(STATUS);
    svc.reset.mockResolvedValue("n".repeat(32));
    render(<CalendarFeedCard />);
    await screen.findByTestId("calendar-feed-url");

    (window.confirm as any).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: /new link/i }));
    expect(svc.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /new link/i }));
    expect(await screen.findByTestId("calendar-feed-url")).toHaveTextContent("n".repeat(32));

    svc.disable.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: /turn off/i }));
    expect(await screen.findByRole("button", { name: /turn on calendar link/i })).toBeInTheDocument();
    expect(svc.disable).toHaveBeenCalled();
  });

  it("CC.5 says so when turning it on fails", async () => {
    svc.getStatus.mockResolvedValue(null);
    svc.enable.mockRejectedValue(new Error("down"));
    render(<CalendarFeedCard />);
    fireEvent.click(await screen.findByRole("button", { name: /turn on calendar link/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId("calendar-feed-url")).toBeNull();
  });
});
