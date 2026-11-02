/**
 * TDD — QueueStatusScreen
 *
 * Tests cover:
 *  - Shows "Queue empty" when there are no queued items
 *  - Renders pending items with type and status
 *  - Renders failed items with a Retry and Discard button
 *  - Calling retry on a failed item resets its status
 *  - Calling discard on an item removes it
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import QueueStatusScreen from "../../screens/QueueStatusScreen";
import type { QueuedOperation } from "../../services/offlineQueue";

const NOW = Date.now();

function makePending(id: string): QueuedOperation {
  return {
    id,
    type:        "addBill",
    payload:     { propertyId: "p1" },
    enqueuedAt:  NOW,
    retryCount:  0,
    nextRetryAt: 0,
    status:      "pending",
  };
}

function makeFailed(id: string): QueuedOperation {
  return { ...makePending(id), retryCount: 5, status: "failed", failReason: "network error" };
}

describe("QueueStatusScreen", () => {
  it("shows 'Queue empty' when there are no items", async () => {
    await render(<QueueStatusScreen items={[]} onRetry={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByText(/queue empty|no pending/i)).toBeTruthy();
  });

  it("renders pending item with its type", async () => {
    await render(<QueueStatusScreen items={[makePending("op1")]} onRetry={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByText(/addBill|add bill/i)).toBeTruthy();
    expect(screen.getByText(/pending/i)).toBeTruthy();
  });

  it("shows Retry and Discard buttons for failed items", async () => {
    await render(<QueueStatusScreen items={[makeFailed("op2")]} onRetry={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByText(/retry/i)).toBeTruthy();
    expect(screen.getByText(/discard/i)).toBeTruthy();
  });

  it("calls onRetry with the item id when Retry is pressed", async () => {
    const onRetry = jest.fn();
    await render(<QueueStatusScreen items={[makeFailed("op3")]} onRetry={onRetry} onDiscard={jest.fn()} />);
    await fireEvent.press(screen.getByText(/retry/i));
    expect(onRetry).toHaveBeenCalledWith("op3");
  });

  it("calls onDiscard with the item id when Discard is pressed", async () => {
    const onDiscard = jest.fn();
    await render(<QueueStatusScreen items={[makeFailed("op4")]} onRetry={jest.fn()} onDiscard={onDiscard} />);
    await fireEvent.press(screen.getByText(/discard/i));
    expect(onDiscard).toHaveBeenCalledWith("op4");
  });

  it("shows pending items without Retry/Discard buttons", async () => {
    await render(<QueueStatusScreen items={[makePending("op5")]} onRetry={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.queryByText(/retry/i)).toBeNull();
    expect(screen.queryByText(/discard/i)).toBeNull();
  });

  it("shows failed item count in summary", async () => {
    const items = [makePending("a"), makeFailed("b"), makeFailed("c")];
    await render(<QueueStatusScreen items={items} onRetry={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByText(/2.*failed|failed.*2/i)).toBeTruthy();
  });
});
