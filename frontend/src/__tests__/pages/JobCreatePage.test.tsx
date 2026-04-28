/**
 * #178 — post-create photo upload path in JobCreatePage
 *
 * Verifies that photos collected before submit are sent to photoService.upload
 * after the job is created, and that a per-file failure shows a warning without
 * preventing the success state from rendering.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import JobCreatePage from "@/pages/JobCreatePage";

// RAF stub — react-helmet-async and some components defer via RAF
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
(globalThis as any).cancelAnimationFrame = () => {};

// ─── Service mocks ────────────────────────────────────────────────────────────

const { mockCreate, mockUpload, mockGetByProp, STABLE_PROPS } = vi.hoisted(() => ({
  mockCreate:    vi.fn(),
  mockUpload:    vi.fn(),
  mockGetByProp: vi.fn().mockResolvedValue([]),
  // Stable reference required — usePropertyStore is called every render; a new
  // array each call changes the [properties] useEffect dep and causes infinite re-renders.
  STABLE_PROPS:  [{ id: "prop-1", address: "123 Main St", city: "Austin" }],
}));

vi.mock("@/services/job", () => ({
  jobService: {
    create:        mockCreate,
    getByProperty: mockGetByProp,
  },
  isInsuranceRelevant: vi.fn().mockReturnValue(false),
}));

vi.mock("@/services/photo", () => ({
  photoService: {
    upload:   mockUpload,
    getQuota: vi.fn().mockResolvedValue({ used: 0, limit: 10, tier: "Basic" }),
  },
  PhotoQuota: {},
}));

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Basic" }),
  },
  PlanTier: {},
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: vi.fn(() => ({
    properties:    STABLE_PROPS,
    setProperties: vi.fn(),
  })),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/ConstructionPhotoUpload", () => ({
  ConstructionPhotoUpload: ({ onUpload }: { onUpload: (f: File, phase: string) => void }) => (
    <button
      data-testid="add-photo"
      onClick={() => onUpload(new File(["x"], "test.jpg", { type: "image/jpeg" }), "before")}
    >
      Add Photo
    </button>
  ),
}));

vi.mock("@/components/JobValueDelta", () => ({
  JobValueDelta: () => null,
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error:   vi.fn(),
  }),
}));

vi.mock("@/services/scoreService", () => ({
  computeScore: vi.fn().mockReturnValue(50),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/new"]}>
      <JobCreatePage />
    </MemoryRouter>
  );
}

function fillRequiredFields() {
  // Toggle DIY so contractor name is not required
  fireEvent.click(screen.getByText(/I did this myself/i));
  // Materials cost
  fireEvent.change(screen.getByLabelText(/materials cost/i), {
    target: { value: "500" },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("JobCreatePage — post-create photo upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByProp.mockResolvedValue([]);
  });

  it("calls photoService.upload for each collected file after job creation", async () => {
    mockCreate.mockResolvedValue({ id: "job-42", propertyId: "prop-1", serviceType: "HVAC" });
    mockUpload.mockResolvedValue({ id: "photo-1" });

    renderPage();
    await act(async () => {});

    fillRequiredFields();
    fireEvent.click(screen.getByTestId("add-photo"));
    fireEvent.click(screen.getByTestId("add-photo")); // add 2 files

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /log job/i }));
    });

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });

    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(File),
      "job-42",
      "prop-1",
      "before",
      ""
    );
  });

  it("shows a warning toast when a photo upload fails but still transitions to success state", async () => {
    mockCreate.mockResolvedValue({ id: "job-99", propertyId: "prop-1", serviceType: "Roofing" });
    mockUpload.mockRejectedValue(new Error("quota exceeded"));

    const toast = (await import("react-hot-toast")).default as any;

    renderPage();
    await act(async () => {});

    fillRequiredFields();
    fireEvent.click(screen.getByTestId("add-photo"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /log job/i }));
    });

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });

    // warning toast shown
    expect(toast).toHaveBeenCalledWith(
      expect.stringMatching(/failed to upload/i),
      expect.objectContaining({ icon: "⚠️" })
    );

    // success state still rendered
    await waitFor(() => {
      expect(screen.getByText(/record locked on-chain/i)).toBeInTheDocument();
    });
  });

  it("skips photoService.upload entirely when no files were added", async () => {
    mockCreate.mockResolvedValue({ id: "job-7", propertyId: "prop-1", serviceType: "Plumbing" });

    renderPage();
    await act(async () => {});

    fillRequiredFields();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /log job/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/record locked on-chain/i)).toBeInTheDocument()
    );

    expect(mockUpload).not.toHaveBeenCalled();
  });
});
