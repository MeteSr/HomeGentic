/**
 * TDD tests for Issue #308 — 360° Panorama Viewer integration
 *
 * Covers:
 *   - FsboListingPage renders PlayCanvas360Viewer when panoramas exist
 *   - FsboListingPage does NOT render viewer when no panoramas
 *   - FsboListingManagerPage renders panorama upload section when listing is live
 *   - Panorama manager: shows existing panoramas, add form, remove button
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ─── Mock PlayCanvas so tests don't need WebGL ────────────────────────────────

vi.mock("playcanvas", () => ({
  Application:   vi.fn().mockReturnValue({ start: vi.fn(), scene: {}, setCanvasFillMode: vi.fn(), setCanvasResolution: vi.fn(), on: vi.fn(), destroy: vi.fn() }),
  FILLMODE_FILL_WINDOW: "FILLMODE_FILL_WINDOW",
  RESOLUTION_AUTO:      "RESOLUTION_AUTO",
  Entity:  vi.fn().mockReturnValue({ addComponent: vi.fn(), setLocalPosition: vi.fn(), setLocalEulerAngles: vi.fn(), name: "" }),
  Color:   vi.fn(),
  Vec3:    vi.fn(),
}));

// ─── Mock data ────────────────────────────────────────────────────────────────

const {
  mockProperty,
  mockFsboRecord,
  mockPanoramas,
} = vi.hoisted(() => ({
  mockProperty: {
    id: "prop-308", address: "7 Oak Lane", city: "Denver", state: "CO", zipCode: "80203",
    propertyType: "SingleFamily" as const, yearBuilt: BigInt(2005), squareFeet: BigInt(1800),
    verificationLevel: "Basic" as const, tier: "Pro" as const,
    owner: "owner-p", isActive: true, createdAt: BigInt(0), updatedAt: BigInt(0),
  },
  mockFsboRecord: {
    propertyId: "prop-308", isFsbo: true, listPriceCents: 50_000_000,
    activatedAt: Date.now(), step: "done" as const, hasReport: false,
  },
  mockPanoramas: [
    { roomLabel: "Living Room",    photoId: "PH_360_1" },
    { roomLabel: "Kitchen",        photoId: "PH_360_2" },
    { roomLabel: "Master Bedroom", photoId: "PH_360_3" },
  ],
}));

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: { getProperty: vi.fn().mockResolvedValue(mockProperty), getMyProperties: vi.fn().mockResolvedValue([mockProperty]) },
}));
vi.mock("@/services/job", () => ({
  jobService: { getByProperty: vi.fn().mockResolvedValue([]), getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/photo", () => ({
  photoService: { getByProperty: vi.fn().mockResolvedValue([]), getListingPhotos: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/report", () => ({
  reportService: { listShareLinks: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/showingRequest", () => ({
  showingRequestService: { create: vi.fn(), getByProperty: vi.fn().mockReturnValue([]) },
}));
vi.mock("@/services/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications")>();
  return { ...actual, notificationService: { create: vi.fn(), getAll: vi.fn().mockReturnValue([]) } };
});
vi.mock("@/services/fsboOffer", () => ({
  fsboOfferService: { getByProperty: vi.fn().mockReturnValue([]) },
}));

vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return {
    ...actual,
    listingService: {
      ...actual.listingService,
      getListingPhotos: vi.fn().mockResolvedValue([]),
      getPanoramas:    vi.fn().mockResolvedValue(mockPanoramas),
      addPanorama:     vi.fn().mockResolvedValue(undefined),
      removePanorama:  vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:       vi.fn().mockReturnValue(mockFsboRecord),
      setFsboMode:     vi.fn(),
      advanceStep:     vi.fn(),
      deactivate:      vi.fn(),
      getPriceHistory: vi.fn().mockReturnValue([]),
      updatePrice:     vi.fn(),
      logPriceChange:  vi.fn(),
    },
  };
});

import FsboListingPage from "@/pages/FsboListingPage";
import FsboListingManagerPage from "@/pages/FsboListingManagerPage";
import { listingService } from "@/services/listing";
import { fsboService } from "@/services/fsbo";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderListingPage(propertyId = "prop-308") {
  return render(
    <MemoryRouter initialEntries={[`/for-sale/${propertyId}`]}>
      <Routes>
        <Route path="/for-sale/:propertyId" element={<FsboListingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderManagerPage(propertyId = "prop-308") {
  return render(
    <MemoryRouter initialEntries={[`/my-listing/${propertyId}`]}>
      <Routes>
        <Route path="/my-listing/:propertyId" element={<FsboListingManagerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── FsboListingPage — viewer section ────────────────────────────────────────

describe("FsboListingPage — 360° viewer (issue #308)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(mockFsboRecord);
    vi.mocked(listingService.getPanoramas).mockResolvedValue(mockPanoramas);
  });

  it("renders the 360° viewer section when panoramas exist", async () => {
    renderListingPage();
    await waitFor(() => {
      expect(screen.getByTestId("viewer-360")).toBeInTheDocument();
    });
  });

  it("shows a '360° Virtual Tour' heading above the viewer", async () => {
    renderListingPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /360.*virtual tour|virtual tour/i })).toBeInTheDocument();
    });
  });

  it("viewer shows the first room name", async () => {
    renderListingPage();
    await waitFor(() => {
      expect(screen.getByTestId("viewer-current-room")).toHaveTextContent("Living Room");
    });
  });

  it("does NOT render viewer section when no panoramas exist", async () => {
    vi.mocked(listingService.getPanoramas).mockResolvedValue([]);
    renderListingPage();
    // Wait for page to finish loading
    await waitFor(() => screen.getByText(/50,000,000|500,000|\$500,000/));
    expect(screen.queryByTestId("viewer-360")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /360.*virtual tour/i })).not.toBeInTheDocument();
  });
});

// ─── FsboListingManagerPage — panorama management ────────────────────────────

describe("FsboListingManagerPage — panorama management (issue #308)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue({ ...mockFsboRecord, step: "done" });
    vi.mocked(listingService.getPanoramas).mockResolvedValue(mockPanoramas);
  });

  it("renders the '360° Tour' section when listing is live", async () => {
    renderManagerPage();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /360.*tour|panorama/i })).toBeInTheDocument();
    });
  });

  it("shows each existing panorama room label", async () => {
    renderManagerPage();
    await waitFor(() => {
      expect(screen.getByText("Living Room")).toBeInTheDocument();
      expect(screen.getByText("Kitchen")).toBeInTheDocument();
      expect(screen.getByText("Master Bedroom")).toBeInTheDocument();
    });
  });

  it("shows a remove button for each existing panorama", async () => {
    renderManagerPage();
    await waitFor(() => {
      const removeBtns = screen.getAllByRole("button", { name: /remove.*room|delete.*panorama/i });
      expect(removeBtns).toHaveLength(mockPanoramas.length);
    });
  });

  it("clicking Remove calls removePanorama with the correct room label", async () => {
    renderManagerPage();
    await waitFor(() => screen.getAllByRole("button", { name: /remove.*room|delete.*panorama/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /remove.*room|delete.*panorama/i })[0]);
    await waitFor(() => {
      expect(vi.mocked(listingService.removePanorama)).toHaveBeenCalledWith(
        "prop-308",
        "Living Room"
      );
    });
  });

  it("shows a room label input and upload button for adding a panorama", async () => {
    renderManagerPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/room label|room name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/360.*photo|panorama.*photo/i)).toBeInTheDocument();
    });
  });
});
