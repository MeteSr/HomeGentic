import { type Page } from "@playwright/test";

/**
 * Fixed instant used across every visual snapshot so relative-time strings
 * ("3d ago", "2mo ago") and toLocaleDateString() output never drift between
 * the day a baseline was captured and the day CI compares against it.
 */
export const VISUAL_SNAPSHOT_TIME = "2026-06-15T12:00:00.000Z";

/**
 * Freezes Date.now()/new Date() to VISUAL_SNAPSHOT_TIME before navigation.
 * Uses setFixedTime (not pauseAt) so real timers — toasts, retry backoffs,
 * the actor's fetchRootKey timeout — keep running; only the reported wall
 * clock is pinned. Call before page.goto().
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(VISUAL_SNAPSHOT_TIME));
}
