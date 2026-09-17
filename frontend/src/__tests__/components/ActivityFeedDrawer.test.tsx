/**
 * ActivityFeedDrawer — real logic worth locking down:
 *   - shows a loading spinner while !feedLoaded, and the empty state
 *     once loaded with zero events (not before)
 *   - an event is "unread" (blue background + dot) exactly when its
 *     timestamp is after lastReadAt
 *   - clicking an event closes the drawer and navigates to its href
 *   - the backdrop and X button both close the drawer
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivityFeedDrawer } from "@/components/ActivityFeedDrawer";
import type { ActivityEvent } from "@/services/activityFeed";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "e-1", type: "recent_job", title: "HVAC service logged",
    detail: "Logged by John's HVAC", href: "/jobs/job-1", timestamp: 1000,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("ActivityFeedDrawer — loading and empty states", () => {
  it("shows a spinner while the feed has not loaded", () => {
    const { container } = render(
      <ActivityFeedDrawer events={[]} feedLoaded={false} lastReadAt={0} onClose={vi.fn()} />
    );
    expect(container.querySelector(".spinner-lg")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to catch up on.")).not.toBeInTheDocument();
  });

  it("shows the empty state once loaded with no events", () => {
    render(<ActivityFeedDrawer events={[]} feedLoaded lastReadAt={0} onClose={vi.fn()} />);
    expect(screen.getByText("Nothing to catch up on.")).toBeInTheDocument();
  });
});

describe("ActivityFeedDrawer — unread indicator", () => {
  it("marks an event as unread when its timestamp is after lastReadAt", () => {
    const events = [makeEvent({ id: "e1", title: "New event", timestamp: 2000 })];
    const { container } = render(
      <ActivityFeedDrawer events={events} feedLoaded lastReadAt={1000} onClose={vi.fn()} />
    );
    const row = screen.getByText("New event").closest("div[style]")!.parentElement!.parentElement!;
    expect(row).toHaveStyle({ background: "rgb(243, 244, 255)" });
    expect(container.querySelector('span[style*="border-radius: 50%"]')).toBeInTheDocument();
  });

  it("does not mark an event as unread when its timestamp is at or before lastReadAt", () => {
    const events = [makeEvent({ id: "e1", title: "Old event", timestamp: 1000 })];
    const { container } = render(
      <ActivityFeedDrawer events={events} feedLoaded lastReadAt={1000} onClose={vi.fn()} />
    );
    const row = screen.getByText("Old event").closest("div[style]")!.parentElement!.parentElement!;
    expect(row).toHaveStyle({ background: "transparent" });
    expect(container.querySelector('span[style*="border-radius: 50%"]')).not.toBeInTheDocument();
  });
});

describe("ActivityFeedDrawer — event click", () => {
  it("closes the drawer and navigates to the event's href", () => {
    const onClose = vi.fn();
    const events = [makeEvent({ href: "/jobs/job-42", title: "Roofing job" })];
    render(<ActivityFeedDrawer events={events} feedLoaded lastReadAt={0} onClose={onClose} />);

    fireEvent.click(screen.getByText("Roofing job"));

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/jobs/job-42");
  });
});

describe("ActivityFeedDrawer — dismissal", () => {
  it("closes via the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(<ActivityFeedDrawer events={[]} feedLoaded lastReadAt={0} onClose={onClose} />);
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the X button", () => {
    const onClose = vi.fn();
    render(<ActivityFeedDrawer events={[]} feedLoaded lastReadAt={0} onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button");
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
