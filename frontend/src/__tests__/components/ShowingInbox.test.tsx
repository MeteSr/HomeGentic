/**
 * ShowingInbox — real logic worth locking down (against the real
 * in-memory showingRequestService/showingFeedbackService, not mocks):
 *   - Accept/Decline update the request's status and badge in place
 *   - Propose Alternate Time only submits a non-blank value, and shows
 *     the pending alternate time once proposed
 *   - Request Feedback is only offered once Accepted, and once sent
 *     shows "Feedback Requested" (or the response, once submitted)
 *     instead of the button again
 *   - the empty state shows when a property has no showing requests
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import ShowingInbox from "@/components/ShowingInbox";
import { showingRequestService } from "@/services/showingRequest";
import { showingFeedbackService } from "@/services/showingFeedback";

beforeEach(() => {
  (showingRequestService as any).__reset();
  (showingFeedbackService as any).__reset();
});

function seedRequest(overrides: Partial<Parameters<typeof showingRequestService.create>[0]> = {}) {
  return showingRequestService.create({
    propertyId: "prop-1", name: "Jamie Rivera", contact: "jamie@example.com",
    preferredTime: "Saturday 10am", ...overrides,
  });
}

describe("ShowingInbox — empty state", () => {
  it("shows a message when there are no requests", () => {
    render(<ShowingInbox propertyId="prop-1" />);
    expect(screen.getByText("No showing requests yet.")).toBeInTheDocument();
  });
});

describe("ShowingInbox — accept / decline", () => {
  it("accepts a request and updates the badge", () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Accept"));
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByLabelText("Accept")).not.toBeInTheDocument();
  });

  it("declines a request and updates the badge", () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);

    fireEvent.click(screen.getByLabelText("Decline"));
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });
});

describe("ShowingInbox — propose alternate time", () => {
  it("ignores a blank alternate time", () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);

    fireEvent.click(screen.getByText("Propose Alternate Time"));
    fireEvent.click(screen.getByText("Send Alternate"));

    expect(screen.queryByText("Alternate Proposed")).not.toBeInTheDocument();
    // the form stays open since a blank submission is a no-op, not a cancel
    expect(screen.getByText("Send Alternate")).toBeInTheDocument();
  });

  it("submits an alternate time and shows the AlternatePending badge and time", () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);

    fireEvent.click(screen.getByText("Propose Alternate Time"));
    fireEvent.change(screen.getByLabelText("Alternate Time"), { target: { value: "Sunday 2pm" } });
    fireEvent.click(screen.getByText("Send Alternate"));

    expect(screen.getByText("Alternate Proposed")).toBeInTheDocument();
    expect(screen.getByText("Alternate: Sunday 2pm")).toBeInTheDocument();
  });
});

describe("ShowingInbox — feedback", () => {
  it("offers Request Feedback only once accepted", () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);
    expect(screen.queryByLabelText("Request Feedback")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Accept"));
    expect(screen.getByLabelText("Request Feedback")).toBeInTheDocument();
  });

  it("shows Feedback Requested after sending, instead of the button", async () => {
    seedRequest();
    render(<ShowingInbox propertyId="prop-1" />);
    fireEvent.click(screen.getByLabelText("Accept"));

    fireEvent.click(screen.getByLabelText("Request Feedback"));

    expect(await screen.findByText("Feedback Requested")).toBeInTheDocument();
    expect(screen.queryByLabelText("Request Feedback")).not.toBeInTheDocument();
  });
});

describe("ShowingInbox — multiple requests", () => {
  it("only scopes property requests and each row acts independently", () => {
    seedRequest({ name: "Jamie Rivera" });
    seedRequest({ name: "Sam Lee" });
    seedRequest({ propertyId: "prop-2", name: "Other Property Buyer" });

    render(<ShowingInbox propertyId="prop-1" />);
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.queryByText("Other Property Buyer")).not.toBeInTheDocument();

    const acceptButtons = screen.getAllByLabelText("Accept");
    fireEvent.click(acceptButtons[0]);

    const jamieRow = screen.getByText("Jamie Rivera").closest("div")!.parentElement!.parentElement!;
    const samRow = screen.getByText("Sam Lee").closest("div")!.parentElement!.parentElement!;
    expect(within(jamieRow).getByText("Accepted")).toBeInTheDocument();
    expect(within(samRow).getByText("Pending")).toBeInTheDocument();
  });
});
