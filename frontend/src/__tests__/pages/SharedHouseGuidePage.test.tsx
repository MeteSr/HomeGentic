import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetShared, mockPhotoUrl } = vi.hoisted(() => ({ mockGetShared: vi.fn(), mockPhotoUrl: vi.fn() }));
vi.mock("@/services/houseGuide", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/houseGuide")>()),
  houseGuideService: { getShared: mockGetShared, sharedPhotoUrl: mockPhotoUrl },
}));
vi.mock("@/components/PublicNav", () => ({ PublicNav: () => <nav /> }));
vi.mock("@/components/PublicFooter", () => ({ PublicFooter: () => <footer /> }));

import SharedHouseGuidePage from "@/pages/SharedHouseGuidePage";
import { EMPTY_GUIDE } from "@/services/houseGuide";

const TOKEN = "c".repeat(64);
const SHARED = {
  address: "12 Guide Lane",
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  expiresAt: Date.UTC(2026, 10, 14, 12),
  guide: {
    ...EMPTY_GUIDE,
    wifiName: "Lake House",
    wifiPassword: "correct horse",
    trashDay: "Tuesday night",
    contacts: [{ name: "Ana", role: "Spare key", phone: "(407) 555-0142" }],
    photoIds: ["ph-shutoff", "ph-gone"],
  },
};

const renderAt = (token = TOKEN) =>
  render(
    <MemoryRouter initialEntries={[`/guide/${token}`]}>
      <Routes>
        <Route path="/guide/:token" element={<SharedHouseGuidePage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockPhotoUrl.mockImplementation(async (_t: string, id: string) => (id === "ph-shutoff" ? "blob:shutoff" : ""));
});

describe("SharedHouseGuidePage", () => {
  it("shows the guide, the address and when the link stops working", async () => {
    mockGetShared.mockResolvedValue(SHARED);
    renderAt();
    expect(await screen.findByRole("heading", { name: /12 Guide Lane/ })).toBeInTheDocument();
    expect(mockGetShared).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("correct horse")).toBeInTheDocument();
    expect(screen.getByText("Tuesday night")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "(407) 555-0142" })).toHaveAttribute("href", "tel:4075550142");
    expect(screen.getByText(/this link works until nov 14, 2026/i)).toBeInTheDocument();
    // Photos load through the link; one that can't load says so.
    await waitFor(() => expect(screen.getByAltText("Photo 1 of 2")).toHaveAttribute("src", "blob:shutoff"));
    expect(screen.getByText("Photo not available")).toBeInTheDocument();
    expect(mockPhotoUrl).toHaveBeenCalledWith(TOKEN, "ph-gone");
  });

  it("explains a link that has expired or been turned off", async () => {
    mockGetShared.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByText(/isn't working/i)).toBeInTheDocument();
    expect(screen.getByText(/ask the person who sent it for a new one/i)).toBeInTheDocument();
  });

  it("offers a retry when the guide can't be loaded", async () => {
    mockGetShared.mockRejectedValueOnce(new Error("down")).mockResolvedValue(SHARED);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("correct horse")).toBeInTheDocument();
  });
});
