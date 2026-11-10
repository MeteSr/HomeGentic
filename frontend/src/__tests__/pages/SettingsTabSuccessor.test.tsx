/**
 * SettingsTab (#724): the home's settings point the owner to the successor page.
 * Security audit 2026-11-10 (M-1): the handoff copy says which papers go to
 * the buyer and which stay private to the seller.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => ({ userTier: "Pro" }) }));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return {
    ...actual,
    propertyService: {
      getPendingTransfer: vi.fn(async () => null),
      getOwnershipHistory: vi.fn(async () => []),
      getPropertyManagers: vi.fn(async () => []),
    },
  };
});

import { SettingsTab } from "@/pages/PropertyDetail/SettingsTab";

const property = { id: "prop-1", address: "70 Heritage Way", verificationLevel: "Unverified", owner: "me" } as any;

describe("SettingsTab successor section", () => {
  it("links to the successor page with copy that matches what happens", async () => {
    render(
      <MemoryRouter>
        <SettingsTab property={property} currentPrincipal="me" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/if you die or the home passes to a trust or heir/i)).toBeInTheDocument();
    // Mete, 2026-11-10: unlike a buyer, a successor gets the personal papers too.
    expect(
      screen.getByText(
        /your successor gets everything a buyer would, plus your closing, title, insurance, HOA and other personal documents, insurance claims and home inventory/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /successor/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-1/successor");
  });

  it("says the seller's personal papers stay private and work records go to the buyer", () => {
    render(
      <MemoryRouter>
        <SettingsTab property={property} currentPrincipal="me" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        /closing papers, title, deed, insurance, HOA and "Other" documents, and insurance-claim and inventory photos stay private to whoever uploaded them/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/remove any documents you don't want them to have/i)).not.toBeInTheDocument();
  });
});
