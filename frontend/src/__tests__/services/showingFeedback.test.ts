/**
 * showingFeedbackService — real logic worth locking down:
 *   - sendRequest is idempotent per showing — a second call returns the
 *     same request rather than creating a duplicate
 *   - submitResponse updates the matching request's response
 *   - submitResponse throws for an unknown request id
 *   - getByShowing returns null when no request exists for that showing
 */

import { describe, it, expect, beforeEach } from "vitest";
import { showingFeedbackService } from "@/services/showingFeedback";

beforeEach(() => showingFeedbackService.__reset());

describe("showingFeedbackService.sendRequest", () => {
  it("creates a new request with a null response", async () => {
    const req = await showingFeedbackService.sendRequest("showing-1");
    expect(req.showingId).toBe("showing-1");
    expect(req.response).toBeNull();
  });

  it("is idempotent — a second call for the same showing returns the same request", async () => {
    const first = await showingFeedbackService.sendRequest("showing-1");
    const second = await showingFeedbackService.sendRequest("showing-1");
    expect(second.id).toBe(first.id);
  });
});

describe("showingFeedbackService.submitResponse", () => {
  it("updates the matching request's response", async () => {
    const req = await showingFeedbackService.sendRequest("showing-1");
    const updated = await showingFeedbackService.submitResponse(req.id, "Loved the kitchen!");
    expect(updated.response).toBe("Loved the kitchen!");
  });

  it("throws for an unknown request id", async () => {
    await expect(showingFeedbackService.submitResponse("nonexistent", "resp")).rejects.toThrow("FeedbackRequest nonexistent not found");
  });
});

describe("showingFeedbackService.getByShowing", () => {
  it("returns null when no request exists for that showing", () => {
    expect(showingFeedbackService.getByShowing("showing-nobody")).toBeNull();
  });

  it("returns the request for a showing that has one", async () => {
    await showingFeedbackService.sendRequest("showing-1");
    expect(showingFeedbackService.getByShowing("showing-1")).not.toBeNull();
  });
});
