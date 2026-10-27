/**
 * FsboPanel — the setup wizard on My Listing (10.1.2–10.1.4).
 *
 * Uses the real fsboService on its in-memory store (no LISTING_CANISTER_ID),
 * so each step really saves and the next render reads it back.
 */
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FsboPanel from "@/components/FsboPanel";
import { fsboService, type FsboRecord } from "@/services/fsbo";
import type { Property } from "@/services/property";

const property: Property = {
  id: "prop-1", owner: "2vxsx-fae", address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801",
  propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, verificationLevel: "Basic",
  tier: "Pro", createdAt: 0n, updatedAt: 0n, isActive: true,
};

let latest: FsboRecord | null = null;

function Harness(props: Partial<React.ComponentProps<typeof FsboPanel>> & { initial?: FsboRecord | null }) {
  const [record, setRecord] = useState<FsboRecord | null>(props.initial ?? null);
  return (
    <MemoryRouter>
      <FsboPanel
        propertyId="prop-1"
        score={75}
        verifiedJobCount={3}
        hasReport={false}
        property={property}
        {...props}
        record={record}
        onChange={(r) => { latest = r; setRecord(r); }}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  fsboService.__reset();
  latest = null;
});

describe("FsboPanel — readiness (10.1.4)", () => {
  it.each([
    [75, 3, false, "Ready"],
    [50, 3, false, "Not Ready"],
    [90, 3, true,  "Optimally Ready"],
  ])("score %i, %i verified jobs, report %s → %s", (score, jobs, hasReport, label) => {
    render(<Harness score={score} verifiedJobCount={jobs} hasReport={hasReport} />);
    expect(screen.getByText("Sell This Home Yourself")).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("blocks Get Started and lists what's missing when Not Ready", () => {
    render(<Harness score={50} verifiedJobCount={1} />);
    expect(screen.getByRole("button", { name: /activate fsbo/i })).toBeDisabled();
    expect(screen.getByText(/need 65\+/)).toBeInTheDocument();
    expect(screen.getByText(/at least 2 verified/)).toBeInTheDocument();
  });
});

describe("FsboPanel — wizard (10.1.2 / 10.1.3)", () => {
  it("shows the savings estimate while the price is typed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo/i }));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "500000" } });
    expect(screen.getByText("~$15,000")).toBeInTheDocument();
  });

  it("walks price → report → go live, saving each step", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo/i }));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "485000" } });
    fireEvent.change(screen.getByLabelText(/description for buyers/i), { target: { value: "Corner lot" } });
    fireEvent.submit(screen.getByRole("form", { name: /fsbo price setup/i }));

    expect(await screen.findByText("Step 2 — Review Your HomeGentic Report")).toBeInTheDocument();
    expect(await fsboService.getRecord("prop-1")).toMatchObject({ step: 2, listPriceCents: 48_500_000, description: "Corner lot", isFsbo: false });
    expect(screen.getByRole("link", { name: /create one from your property page/i })).toHaveAttribute("href", "/properties/prop-1");

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    expect(await screen.findByText("Step 3 — Go Live")).toBeInTheDocument();
    expect((await fsboService.getRecord("prop-1"))?.step).toBe(3);

    fireEvent.change(screen.getByLabelText(/bedrooms/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/bathrooms/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /publish fsbo listing/i }));

    await waitFor(() => expect(latest?.step).toBe("done"));
    expect(await fsboService.getPublicListing("prop-1")).toMatchObject({ bedrooms: 3, bathrooms: 2, address: "12 Elm St", listPriceCents: 48_500_000 });
  });

  it("resumes at the saved step", async () => {
    const rec = await fsboService.saveDraft("prop-1", 40_000_000, undefined, 3);
    render(<Harness initial={rec} />);
    expect(screen.getByText("Step 3 — Go Live")).toBeInTheDocument();
  });

  it("asks for bedrooms and bathrooms before publishing", async () => {
    const rec = await fsboService.saveDraft("prop-1", 40_000_000, undefined, 3);
    render(<Harness initial={rec} />);
    fireEvent.click(screen.getByRole("button", { name: /publish fsbo listing/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/bedrooms and bathrooms/i);
    expect(await fsboService.getPublicListing("prop-1")).toBeNull();
  });

  it("can't publish without the property details", async () => {
    const rec = await fsboService.saveDraft("prop-1", 40_000_000, undefined, 3);
    render(<Harness initial={rec} property={null} />);
    expect(screen.getByRole("button", { name: /publish fsbo listing/i })).toBeDisabled();
  });

  it("shows an error for a zero price and stays on step 1", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo/i }));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form", { name: /fsbo price setup/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/above \$0/);
    expect(await fsboService.getRecord("prop-1")).toBeNull();
  });

  it("has no MLS submission (there is no MLS partner)", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /mls/i })).not.toBeInTheDocument();
  });
});
