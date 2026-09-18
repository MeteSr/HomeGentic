/**
 * winBackService — real logic worth locking down:
 *   - getPendingMessage returns null until enough days have passed, then
 *     the earliest un-sent tier whose window has been reached
 *   - markSent prevents a tier from being returned again
 *   - schedule/__reset manage the persisted cancellation timestamp
 */

import { describe, it, expect, beforeEach } from "vitest";
import { winBackService } from "@/services/winBackService";

const DAY = 86_400_000;

beforeEach(() => winBackService.__reset());

describe("winBackService.getPendingMessage", () => {
  it("returns null when nothing has been scheduled", () => {
    expect(winBackService.getPendingMessage()).toBeNull();
  });

  it("returns null before the first 7-day window is reached", () => {
    winBackService.schedule(Date.now() - 3 * DAY);
    expect(winBackService.getPendingMessage()).toBeNull();
  });

  it("returns the 7-day message once 7 days have passed", () => {
    winBackService.schedule(Date.now() - 8 * DAY);
    const message = winBackService.getPendingMessage();
    expect(message?.days).toBe(7);
  });

  it("returns the 30-day message once 30 days have passed and 7 was already sent", () => {
    winBackService.schedule(Date.now() - 31 * DAY);
    winBackService.markSent(7);
    const message = winBackService.getPendingMessage();
    expect(message?.days).toBe(30);
  });

  it("returns the 90-day message once 90 days have passed and 7/30 were already sent", () => {
    winBackService.schedule(Date.now() - 91 * DAY);
    winBackService.markSent(7);
    winBackService.markSent(30);
    const message = winBackService.getPendingMessage();
    expect(message?.days).toBe(90);
  });

  it("returns null once all three tiers have been sent", () => {
    winBackService.schedule(Date.now() - 200 * DAY);
    winBackService.markSent(7);
    winBackService.markSent(30);
    winBackService.markSent(90);
    expect(winBackService.getPendingMessage()).toBeNull();
  });
});

describe("winBackService.markSent", () => {
  it("does not duplicate an already-sent tier", () => {
    winBackService.schedule(Date.now() - 8 * DAY);
    winBackService.markSent(7);
    winBackService.markSent(7);
    expect(winBackService.getPendingMessage()).toBeNull();
  });
});
