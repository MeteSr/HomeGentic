import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FloodZone } from "@/services/floodZone";

const { mockGet, mockLookUp } = vi.hoisted(() => ({ mockGet: vi.fn(), mockLookUp: vi.fn() }));
vi.mock("@/services/floodZone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/floodZone")>()),
  floodZoneService: { get: mockGet, lookUp: mockLookUp },
}));

import { FloodZoneCard } from "@/pages/PropertyDetail/FloodZoneCard";

const AE: FloodZone = {
  status: "Mapped",
  zone: "AE",
  zoneSubtype: "",
  specialFloodHazardArea: true,
  baseFloodElevation: "8",
  firmPanel: "12095C0430F",
  firmEffectiveDate: "2009-09-25",
  matchedAddress: "18 PALM CT, ORLANDO, FL, 32801",
  latitude: "28.5",
  longitude: "-81.3",
  checkedAt: Date.UTC(2026, 10, 7, 12),
};
const ADDRESS = "18 Palm Ct, Orlando, FL 32801";

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(null);
  mockLookUp.mockResolvedValue(AE);
});

describe("FloodZoneCard", () => {
  it("offers a lookup when none is saved, and links FEMA's own map", async () => {
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    expect(await screen.findByRole("button", { name: "Look up the FEMA flood zone" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /FEMA's Flood Map Service Center/i })).toHaveAttribute(
      "href",
      "https://msc.fema.gov/portal/search?AddressQuery=18%20Palm%20Ct%2C%20Orlando%2C%20FL%2032801",
    );
  });

  it("shows what FEMA's map shows and when, without promising anything", async () => {
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Look up the FEMA flood zone" }));
    await waitFor(() => expect(mockLookUp).toHaveBeenCalledWith("p1", false));
    expect(await screen.findByText("FEMA's map shows zone AE as of Nov 7, 2026")).toBeInTheDocument();
    expect(screen.getByText(/FEMA calls this a special flood hazard area/i)).toBeInTheDocument();
    expect(screen.getByText(/Base flood elevation 8 ft/)).toBeInTheDocument();
    expect(screen.getByText(/Map panel 12095C0430F, effective Sep 25, 2009/)).toBeInTheDocument();
    expect(screen.getByText(/Matched address: 18 PALM CT/)).toBeInTheDocument();
    expect(screen.getByText(/elevation certificate/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/won't flood|safe from flood|guarantee/i);
  });

  it("looks again on request", async () => {
    mockGet.mockResolvedValue(AE);
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Look again" }));
    await waitFor(() => expect(mockLookUp).toHaveBeenCalledWith("p1", true));
  });

  it("says when FEMA has no digital map at the point", async () => {
    mockGet.mockResolvedValue({
      ...AE,
      status: "NotMapped",
      zone: "",
      firmPanel: "",
      firmEffectiveDate: "",
      baseFloodElevation: "",
    });
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    expect(await screen.findByText(/shows no flood zone at this point as of Nov 7, 2026/i)).toBeInTheDocument();
  });

  it("shows the lookup's error in plain words", async () => {
    mockLookUp.mockRejectedValue(new Error("FEMA's map service didn't answer. Try again in a few minutes."));
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Look up the FEMA flood zone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("FEMA's map service didn't answer");
  });

  it("still offers the lookup when the saved result can't be read", async () => {
    mockGet.mockRejectedValue(new Error("down"));
    render(<FloodZoneCard propertyId="p1" address={ADDRESS} />);
    expect(await screen.findByRole("button", { name: "Look up the FEMA flood zone" })).toBeInTheDocument();
  });
});
