/**
 * #717 step 2: the private calendar subscribe link (services/calendarFeed.ts).
 *
 *  FD.1 the link is the voice Worker's /calendar/<token>.ics, plus a webcal:// form
 *  FD.2 status, enable, reset and disable map the job canister's results
 *  FD.3 sync publishes only when the feed is on and the events changed
 *  FD.4 canister errors surface as canisterError, not raw objects
 *  FD.5 the e2e mock keeps state in memory
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const NS = 1_000_000n;
const mockActor = {
  getMyCalendarFeed: vi.fn(async (): Promise<any[]> => []),
  enableMyCalendarFeed: vi.fn(async () => ({ ok: "a".repeat(32) })),
  resetMyCalendarFeed: vi.fn(async () => ({ ok: "b".repeat(32) })),
  disableMyCalendarFeed: vi.fn(async (): Promise<any> => ({ ok: null })),
  publishMyCalendarEvents: vi.fn(async (_v: string, evs: unknown[]): Promise<any> => ({ ok: BigInt(evs.length) })),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import { calendarFeedService, CALENDAR_FEED_COPY } from "@/services/calendarFeed";
import { feedVersion } from "@/services/calendarEvents";
import type { IcsEvent } from "@homegentic/shared/ics";

const events: IcsEvent[] = [{ uid: "warranty-J1", date: "2028-01-15", title: "Warranty ends: HVAC" }];

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete (window as any).__e2e_calendar;
});

describe("calendarFeedService", () => {
  it("FD.1 builds the https and webcal links from the Worker URL", () => {
    const url = calendarFeedService.feedUrl("abc");
    expect(url).toMatch(/^https?:\/\/.+\/calendar\/abc\.ics$/);
    expect(calendarFeedService.webcalUrl("abc")).toBe(url.replace(/^https?:\/\//, "webcal://"));
  });

  it("FD.2 maps status, enable, reset and disable", async () => {
    expect(await calendarFeedService.getStatus()).toBeNull();
    mockActor.getMyCalendarFeed.mockResolvedValueOnce([
      { token: "t", version: "v1", eventCount: 3n, updatedAt: 2_000n * NS },
    ]);
    expect(await calendarFeedService.getStatus()).toEqual({
      token: "t",
      version: "v1",
      eventCount: 3,
      updatedAt: 2_000,
    });
    expect(await calendarFeedService.enable()).toBe("a".repeat(32));
    expect(await calendarFeedService.reset()).toBe("b".repeat(32));
    await calendarFeedService.disable();
    expect(mockActor.disableMyCalendarFeed).toHaveBeenCalled();
  });

  it("FD.3 publishes only when the feed is on and the events changed", async () => {
    expect(await calendarFeedService.sync(events, null)).toBe("off");
    expect(mockActor.publishMyCalendarEvents).not.toHaveBeenCalled();

    const status = { token: "t", version: feedVersion(events), eventCount: 1, updatedAt: 1 };
    expect(await calendarFeedService.sync(events, status)).toBe("unchanged");
    expect(mockActor.publishMyCalendarEvents).not.toHaveBeenCalled();

    expect(await calendarFeedService.sync(events, { ...status, version: "old" })).toBe("published");
    const [version, sent] = mockActor.publishMyCalendarEvents.mock.calls[0];
    expect(version).toBe(feedVersion(events));
    expect(sent).toEqual([
      { uid: "warranty-J1", date: "2028-01-15", title: "Warranty ends: HVAC", description: "", rrule: "" },
    ]);
  });

  it("FD.4 throws canisterError on an error result", async () => {
    mockActor.publishMyCalendarEvents.mockResolvedValueOnce({ err: { InvalidInput: "too many events" } });
    await expect(calendarFeedService.publish("v", events)).rejects.toMatchObject({ code: "InvalidInput" });
    mockActor.disableMyCalendarFeed.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(calendarFeedService.disable()).rejects.toMatchObject({ code: "NotFound" });
  });

  it("FD.5 keeps e2e state in memory", async () => {
    (window as any).__e2e_calendar = {};
    expect(await calendarFeedService.getStatus()).toBeNull();
    const token = await calendarFeedService.enable();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await calendarFeedService.sync(events, await calendarFeedService.getStatus())).toBe("published");
    expect((await calendarFeedService.getStatus())!.eventCount).toBe(1);
    await calendarFeedService.disable();
    expect(await calendarFeedService.getStatus()).toBeNull();
    expect(mockActor.enableMyCalendarFeed).not.toHaveBeenCalled();
  });

  it("says what the feed holds and that anyone with the link can read it", () => {
    expect(CALENDAR_FEED_COPY).toMatch(/maintenance/i);
    expect(CALENDAR_FEED_COPY).toMatch(/warrant/i);
    expect(CALENDAR_FEED_COPY).toMatch(/recurring/i);
    expect(CALENDAR_FEED_COPY).toMatch(/anyone with the link/i);
  });
});
