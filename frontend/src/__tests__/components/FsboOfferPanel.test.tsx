/**
 * FsboOfferPanel (10.5) with the real fsboOfferService on its in-memory store:
 * logging offers, comparison figures, counters from either side, accept /
 * reject, and the under-contract state.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FsboOfferPanel from "@/components/FsboOfferPanel";
import { fsboOfferService, type LogFsboOfferInput } from "@/services/fsboOffer";

const INPUT: LogFsboOfferInput = {
  buyerName: "Alice", offerAmountCents: 48_000_000, earnestMoneyCents: 1_000_000,
  contingencies: ["inspection", "financing"], closeDateMs: Date.UTC(2027, 0, 15), hasEscalationClause: false,
};

function renderPanel(onOffersChange = vi.fn()) {
  render(<MemoryRouter><FsboOfferPanel propertyId="prop-1" listPriceCents={50_000_000} onOffersChange={onOffersChange} /></MemoryRouter>);
  return onOffersChange;
}


beforeEach(() => fsboOfferService.__reset());

describe("FsboOfferPanel — logging offers (10.5.1)", () => {
  it("shows an empty state", async () => {
    renderPanel();
    expect(await screen.findByText(/no offers logged yet/i)).toBeInTheDocument();
  });

  it("logs an offer in cents with contingencies and escalation, then clears the form", async () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText(/buyer name/i), { target: { value: " Bob " } });
    fireEvent.change(screen.getByLabelText(/offer amount/i), { target: { value: "475000" } });
    fireEvent.change(screen.getByLabelText(/earnest money/i), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/close date/i), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByLabelText("Inspection"));
    fireEvent.click(screen.getByLabelText(/escalation clause/i));
    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));

    expect(await screen.findByText("Bob")).toBeInTheDocument();
    const [o] = await fsboOfferService.getByProperty("prop-1");
    expect(o).toMatchObject({
      buyerName: "Bob", offerAmountCents: 47_500_000, earnestMoneyCents: 500_000,
      contingencies: ["inspection"], hasEscalationClause: true, closeDateMs: new Date("2027-02-01").getTime(),
    });
    expect(screen.getByLabelText(/buyer name/i)).toHaveValue("");
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ buyerName: "Bob" })]));
  });

  it("needs a buyer name and a positive amount", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText(/offer amount/i), { target: { value: "475000" } });
    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));
    fireEvent.change(screen.getByLabelText(/buyer name/i), { target: { value: "Bob" } });
    fireEvent.change(screen.getByLabelText(/offer amount/i), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(await fsboOfferService.getByProperty("prop-1")).toEqual([]);
  });
});

describe("FsboOfferPanel — comparison (10.5.2 / 10.5.3)", () => {
  it("shows amount, net after 2% closing costs, earnest money and contingency count", async () => {
    await fsboOfferService.logOffer("prop-1", INPUT);
    await fsboOfferService.logOffer("prop-1", { ...INPUT, buyerName: "Bob", contingencies: ["appraisal"], hasEscalationClause: true });
    renderPanel();
    await screen.findByText("Alice");
    expect(screen.getAllByText("$480,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$470,400").length).toBeGreaterThan(0); // 480,000 − 2%
    expect(screen.getAllByText("$10,000").length).toBeGreaterThan(0);
    expect(screen.getByText("2 contingencies")).toBeInTheDocument();
    expect(screen.getByText("1 contingency")).toBeInTheDocument();
    expect(screen.getAllByText("Escalation")).toHaveLength(1);
  });
});

describe("FsboOfferPanel — counters and decisions (10.5.4 / 10.5.5)", () => {
  it("logs counters from either side and keeps the offer open", async () => {
    await fsboOfferService.logOffer("prop-1", INPUT);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /log counter/i }));
    fireEvent.change(screen.getByLabelText(/counter amount/i), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form", { name: /counter offer form/i }));
    expect((await fsboOfferService.getByProperty("prop-1"))[0].counters).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/counter amount/i), { target: { value: "490000" } });
    fireEvent.change(screen.getByLabelText(/counter notes/i), { target: { value: "Split the difference" } });
    fireEvent.submit(screen.getByRole("form", { name: /counter offer form/i }));
    expect(await screen.findByText("$490,000")).toBeInTheDocument();
    expect(screen.getByText(/You:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /log counter/i }));
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: "buyer" } });
    fireEvent.change(screen.getByLabelText(/counter amount/i), { target: { value: "485000" } });
    fireEvent.submit(screen.getByRole("form", { name: /counter offer form/i }));
    expect(await screen.findByText(/Buyer:/)).toBeInTheDocument();

    const [o] = await fsboOfferService.getByProperty("prop-1");
    expect(o.status).toBe("Countered");
    expect(o.counters.map((c) => [c.amountCents, c.fromSeller])).toEqual([[49_000_000, true], [48_500_000, false]]);
    // a countered offer can still be accepted
    expect(screen.getByRole("button", { name: /accept offer/i })).toBeInTheDocument();
  });

  it("rejecting marks only that offer", async () => {
    await fsboOfferService.logOffer("prop-1", INPUT);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /reject offer/i }));
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
  });

  it("accepting puts the home under contract, rejects the other open offers and hides actions", async () => {
    await fsboOfferService.logOffer("prop-1", INPUT);
    await fsboOfferService.logOffer("prop-1", { ...INPUT, buyerName: "Bob" });
    renderPanel();
    await screen.findByText("Bob");
    fireEvent.click(screen.getAllByRole("button", { name: /accept offer/i })[0]);

    expect(await screen.findByText(/under contract — offer accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/listing stays up until you take it down/i)).toBeInTheDocument();
    expect(screen.getByTestId("handoff-prompt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /log offer/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Rejected")).toBeInTheDocument());
    expect((await fsboOfferService.getByProperty("prop-1")).map((o) => o.status)).toEqual(["Accepted", "Rejected"]);
  });

  it("shows the error when a save fails", async () => {
    const o = await fsboOfferService.logOffer("prop-1", INPUT);
    renderPanel();
    await screen.findByText("Alice");
    vi.spyOn(fsboOfferService, "reject").mockRejectedValueOnce(new Error("This offer is closed"));
    fireEvent.click(screen.getByRole("button", { name: /reject offer/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This offer is closed");
    expect((await fsboOfferService.getByProperty("prop-1"))[0].id).toBe(o.id);
  });
});
