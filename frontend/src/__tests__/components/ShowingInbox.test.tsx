/**
 * ShowingInbox (10.4.1) — the seller's showing requests, loaded by the
 * manager page and passed in. Answers go to the listing canister through
 * showingRequestService (its in-memory store here).
 */
import { useState } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import ShowingInbox from "@/components/ShowingInbox";
import { showingRequestService, type ShowingRequest } from "@/services/showingRequest";

function Harness({ initial }: { initial: ShowingRequest[] }) {
  const [requests, setRequests] = useState(initial);
  return <ShowingInbox requests={requests} onUpdate={(u) => setRequests((xs) => xs.map((r) => (r.id === u.id ? u : r)))} />;
}

async function seed(n = 1): Promise<ShowingRequest[]> {
  const out: ShowingRequest[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await showingRequestService.create({
      propertyId: "prop-1", name: `Buyer ${i + 1}`, contact: i === 0 ? "b1@example.com" : "(407) 555-0100", preferredTime: "Saturday 10am",
    }));
  }
  return out;
}

beforeEach(() => showingRequestService.__reset());

describe("ShowingInbox", () => {
  it("shows an empty state and explains that buyers aren't messaged", () => {
    render(<ShowingInbox requests={[]} onUpdate={() => {}} />);
    expect(screen.getByText(/no showing requests yet/i)).toBeInTheDocument();
    expect(screen.getByText(/buyers aren't told when you accept/i)).toBeInTheDocument();
  });

  it("shows name, preferred time and a mailto/tel link to the buyer", async () => {
    render(<Harness initial={await seed(2)} />);
    expect(screen.getByText("Buyer 1")).toBeInTheDocument();
    expect(screen.getAllByText("Saturday 10am")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Contact Buyer 1" })).toHaveAttribute("href", "mailto:b1@example.com");
    expect(screen.getByRole("link", { name: "Contact Buyer 2" })).toHaveAttribute("href", "tel:4075550100");
  });

  it("Accept and Decline save the answer and update only that row", async () => {
    const [a, b] = await seed(2);
    render(<Harness initial={[a, b]} />);
    const rows = () => screen.getAllByTestId("showing-row");

    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(within(rows()[0]).getByText("Accepted")).toBeInTheDocument());
    expect(within(rows()[1]).getByText("Pending")).toBeInTheDocument();

    fireEvent.click(within(rows()[1]).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(within(rows()[1]).getByText("Declined")).toBeInTheDocument());
    expect((await showingRequestService.getByProperty("prop-1")).map((r) => r.status).sort()).toEqual(["Accepted", "Declined"]);
  });

  it("Propose Alternate Time ignores a blank time and saves a real one", async () => {
    render(<Harness initial={await seed(1)} />);
    fireEvent.click(screen.getByRole("button", { name: /propose alternate time/i }));
    fireEvent.click(screen.getByRole("button", { name: /save alternate/i }));
    expect(screen.getByText("Pending")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/alternate time/i), { target: { value: "Sunday 2pm" } });
    fireEvent.click(screen.getByRole("button", { name: /save alternate/i }));
    await waitFor(() => expect(screen.getByText("Alternate Proposed")).toBeInTheDocument());
    expect(screen.getByText(/Alternate: Sunday 2pm/)).toBeInTheDocument();
  });

  it("shows the error when saving fails", async () => {
    const [a] = await seed(1);
    showingRequestService.__reset(); // the request is gone from the store
    render(<Harness initial={[a]} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
  });
});
