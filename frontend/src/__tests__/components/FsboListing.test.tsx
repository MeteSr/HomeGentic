/**
 * TDD tests for Epic 10.3.1 — Public FSBO Listing Page
 *
 * Unauthenticated /for-sale/:propertyId page showing:
 *   - Property address and details (type, year built, sq ft)
 *   - List price (formatted)
 *   - HomeGentic score badge with "Verified on ICP" label
 *   - Verified job count summary
 *   - Photo gallery (first photo shown)
 *   - Contact / showing-request form (name, contact, preferred time)
 *   - Shows "Not For Sale" when FSBO record is missing or isFsbo=false
 *   - Shows loading state while data fetches
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ─── Mock data (hoisted so vi.mock factories can reference them) ───────────────

const {
  mockProperty,
  mockFsboRecord,
  mockJobs,
  mockPhotos,
} = vi.hoisted(() => {
  const mockProperty = {
    id:                BigInt(42),
    address:           "123 Maple Street",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily" as const,
    yearBuilt:         BigInt(1998),
    squareFeet:        BigInt(2100),
    verificationLevel: "Basic" as const,
    tier:              "Pro" as const,
    owner:             "owner-principal",
    isActive:          true,
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
  };

  const mockFsboRecord = {
    propertyId:     "42",
    isFsbo:         true,
    listPriceCents: 48_500_000,
    activatedAt:    Date.now(),
    step:           3 as const,
    hasReport:      false,
  };

  const mockJobs = [
    { id: "j1", verified: true,  serviceType: "Roof",  amount: 800000, date: "2024-01-01", status: "verified" as const,   contractorName: "Apex Roofing", description: "", photos: [], homeownerSigned: true,  contractorSigned: true,  isDiy: false, propertyId: "42", homeowner: "owner-principal", contractor: undefined, createdAt: 0, permitNumber: undefined, warrantyMonths: undefined },
    { id: "j2", verified: true,  serviceType: "HVAC",  amount: 500000, date: "2024-03-01", status: "verified" as const,   contractorName: "CoolAir",      description: "", photos: [], homeownerSigned: true,  contractorSigned: true,  isDiy: false, propertyId: "42", homeowner: "owner-principal", contractor: undefined, createdAt: 0, permitNumber: undefined, warrantyMonths: undefined },
    { id: "j3", verified: false, serviceType: "Paint", amount: 120000, date: "2024-05-01", status: "completed" as const,  contractorName: "PaintPro",     description: "", photos: [], homeownerSigned: true,  contractorSigned: false, isDiy: false, propertyId: "42", homeowner: "owner-principal", contractor: undefined, createdAt: 0, permitNumber: undefined, warrantyMonths: undefined },
  ];

  const mockPhotos = [
    { id: "ph1", url: "https://example.com/photo1.jpg", jobId: "j1", propertyId: "42", hash: "abc", phase: "after", description: "Roof replacement", size: 102400, verified: true, createdAt: 0 },
  ];

  return { mockProperty, mockFsboRecord, mockJobs, mockPhotos };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:   vi.fn().mockReturnValue(mockFsboRecord),
      setFsboMode: vi.fn(),
      advanceStep: vi.fn(),
      deactivate:  vi.fn(),
    },
  };
});

vi.mock("@/services/property", () => ({
  propertyService: {
    getProperty:     vi.fn().mockResolvedValue(mockProperty),
    getMyProperties: vi.fn().mockResolvedValue([mockProperty]),
  },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    getByProperty: vi.fn().mockResolvedValue(mockJobs),
    getAll:        vi.fn().mockResolvedValue(mockJobs),
  },
}));

vi.mock("@/services/photo", () => ({
  photoService: {
    getByProperty: vi.fn().mockResolvedValue(mockPhotos),
  },
}));

const mockActiveShareLink = {
  token:      "tok-abc123",
  snapshotId: "snap-1",
  propertyId: "42",
  createdBy:  "owner-principal",
  expiresAt:  null,
  visibility: "Public" as const,
  viewCount:  0,
  isActive:   true,
  createdAt:  Date.now(),
};

vi.mock("@/services/report", () => ({
  reportService: {
    listShareLinks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/services/showingRequest", () => ({
  showingRequestService: {
    create:          vi.fn().mockReturnValue({ id: "sr-1", propertyId: "42", name: "", contact: "", preferredTime: "", createdAt: Date.now() }),
    getByProperty:   vi.fn().mockReturnValue([]),
    __reset:         vi.fn(),
  },
}));

vi.mock("@/services/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications")>();
  return {
    ...actual,
    notificationService: {
      create:  vi.fn(),
      getAll:  vi.fn().mockReturnValue([]),
      __reset: vi.fn(),
    },
  };
});

import FsboListingPage from "@/pages/FsboListingPage";
import { fsboService } from "@/services/fsbo";
import { propertyService } from "@/services/property";
import { jobService } from "@/services/job";
import { photoService } from "@/services/photo";
import { reportService } from "@/services/report";
import { showingRequestService } from "@/services/showingRequest";
import { notificationService } from "@/services/notifications";

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPage(propertyId = "42") {
  return render(
    <MemoryRouter initialEntries={[`/for-sale/${propertyId}`]}>
      <Routes>
        <Route path="/for-sale/:propertyId" element={<FsboListingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FsboListingPage (10.3.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(mockFsboRecord);
    vi.mocked(propertyService.getProperty).mockResolvedValue(mockProperty);
    vi.mocked(jobService.getByProperty).mockResolvedValue(mockJobs);
    vi.mocked(photoService.getByProperty).mockResolvedValue(mockPhotos);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
  });

  // ── Property details ────────────────────────────────────────────────────────

  it("shows the property street address", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/123 Maple Street/i)).toBeInTheDocument());
  });

  it("shows city, state, and zip", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Austin.*TX|TX.*78701/i)).toBeInTheDocument());
  });

  it("shows the property type", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/single.?family/i)).toBeInTheDocument());
  });

  it("shows year built", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/1998/)).toBeInTheDocument());
  });

  it("shows square footage", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/2,100|2100/)).toBeInTheDocument());
  });

  // ── List price ──────────────────────────────────────────────────────────────

  it("shows the formatted list price", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/\$485,000/)).toBeInTheDocument());
  });

  // ── HomeGentic score badge ─────────────────────────────────────────────────────

  it("shows the HomeGentic score", async () => {
    renderPage();
    // score from 2 verified jobs (2*4=8) + value + verification(Basic=5)
    // Just check a numeric score is displayed inside a score badge
    await waitFor(() => {
      expect(screen.getByText(/homegentic score/i)).toBeInTheDocument();
    });
  });

  it("shows 'Verified on ICP Blockchain' label near the score", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/verified on icp blockchain/i)).toBeInTheDocument());
  });

  // ── Verified job summary ────────────────────────────────────────────────────

  it("shows the count of verified maintenance jobs", async () => {
    renderPage();
    await waitFor(() => {
      // 2 of 3 jobs are verified
      expect(screen.getByText(/2 verified/i)).toBeInTheDocument();
    });
  });

  it("shows verified job service types", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/roof/i)).toBeInTheDocument();
      expect(screen.getByText(/hvac/i)).toBeInTheDocument();
    });
  });

  // ── Photo gallery ───────────────────────────────────────────────────────────

  it("renders a photo when photos are available", async () => {
    renderPage();
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /property photo/i });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/photo1.jpg");
    });
  });

  it("shows a placeholder when no photos exist", async () => {
    vi.mocked(photoService.getByProperty).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no photos/i)).toBeInTheDocument();
    });
  });

  // ── Showing-request / contact form ─────────────────────────────────────────

  it("renders a contact form with name, contact, and time fields", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/contact.*email.*phone|email or phone/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/preferred.*time|showing.*time/i)).toBeInTheDocument();
    });
  });

  it("shows a submit button for the contact form", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /request.*showing|schedule.*showing/i })).toBeInTheDocument();
    });
  });

  it("submitting the form shows a confirmation message", async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Jane Buyer" } });
    fireEvent.change(screen.getByLabelText(/contact.*email.*phone|email or phone/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/preferred.*time|showing.*time/i), { target: { value: "Weekday evenings" } });
    fireEvent.submit(screen.getByRole("form", { name: /showing request/i }));
    await waitFor(() => {
      expect(screen.getByText(/request.*sent|we'll be in touch|thank you/i)).toBeInTheDocument();
    });
  });

  // ── Not-for-sale guard ──────────────────────────────────────────────────────

  it("shows 'not listed for sale' when FSBO record is null", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(null);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/not listed for sale|not available/i)).toBeInTheDocument();
    });
  });

  it("shows 'not listed for sale' when isFsbo is false", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue({ ...mockFsboRecord, isFsbo: false });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/not listed for sale|not available/i)).toBeInTheDocument();
    });
  });

  // ── Loading ─────────────────────────────────────────────────────────────────

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(propertyService.getProperty).mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.3.2  HomeGentic score badge as trust anchor
// ──────────────────────────────────────────────────────────────────────────────
describe("HomeGentic score badge as trust anchor — (10.3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(mockFsboRecord);
    vi.mocked(propertyService.getProperty).mockResolvedValue(mockProperty);
    vi.mocked(jobService.getByProperty).mockResolvedValue(mockJobs);
    vi.mocked(photoService.getByProperty).mockResolvedValue(mockPhotos);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
  });

  it("score badge section carries an accessible landmark label", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /homegentic score/i })).toBeInTheDocument();
    });
  });

  it("score badge shows a numeric score value", async () => {
    renderPage();
    await waitFor(() => {
      // score region must contain a number
      const region = screen.getByRole("region", { name: /homegentic score/i });
      expect(region.textContent).toMatch(/\d+/);
    });
  });

  it("score badge shows 'Verified on ICP Blockchain' trust label", async () => {
    renderPage();
    await waitFor(() => {
      const region = screen.getByRole("region", { name: /homegentic score/i });
      expect(region).toHaveTextContent(/verified on icp blockchain/i);
    });
  });

  it("score badge shows an explainer describing what verification means to buyers", async () => {
    renderPage();
    await waitFor(() => {
      // Explainer copy should reassure buyers that records are tamper-proof
      expect(
        screen.getByText(/tamper.?proof|immutable|cannot be altered|on.chain/i)
      ).toBeInTheDocument();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.3.3  Full HomeGentic report link on listing
// ──────────────────────────────────────────────────────────────────────────────
describe("Full HomeGentic report link — (10.3.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue({ ...mockFsboRecord, hasReport: true });
    vi.mocked(propertyService.getProperty).mockResolvedValue(mockProperty);
    vi.mocked(jobService.getByProperty).mockResolvedValue(mockJobs);
    vi.mocked(photoService.getByProperty).mockResolvedValue(mockPhotos);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([mockActiveShareLink]);
  });

  it("shows 'View Full Maintenance History' link when report is available", async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /view full maintenance history/i })
      ).toBeInTheDocument();
    });
  });

  it("report link href points to the share token URL", async () => {
    renderPage();
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /view full maintenance history/i });
      expect(link.getAttribute("href")).toMatch(/tok-abc123/);
    });
  });

  it("report link opens in a new tab", async () => {
    renderPage();
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /view full maintenance history/i });
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("does NOT show the report link when hasReport is false", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue({ ...mockFsboRecord, hasReport: false });
    renderPage();
    await waitFor(() => screen.getByText(/485,000/));
    expect(
      screen.queryByRole("link", { name: /view full maintenance history/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show the report link when no active share links exist", async () => {
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
    renderPage();
    await waitFor(() => screen.getByText(/485,000/));
    expect(
      screen.queryByRole("link", { name: /view full maintenance history/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show the report link when the share link is inactive", async () => {
    vi.mocked(reportService.listShareLinks).mockResolvedValue([
      { ...mockActiveShareLink, isActive: false },
    ]);
    renderPage();
    await waitFor(() => screen.getByText(/485,000/));
    expect(
      screen.queryByRole("link", { name: /view full maintenance history/i })
    ).not.toBeInTheDocument();
  });

  it("fetches share links using the property's ID", async () => {
    renderPage("42");
    await waitFor(() =>
      screen.getByRole("link", { name: /view full maintenance history/i })
    );
    expect(vi.mocked(reportService.listShareLinks)).toHaveBeenCalledWith("42");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.3.4  Showing request form — logging + seller notification
// ──────────────────────────────────────────────────────────────────────────────
describe("Showing request logging and seller notification — (10.3.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(mockFsboRecord);
    vi.mocked(propertyService.getProperty).mockResolvedValue(mockProperty);
    vi.mocked(jobService.getByProperty).mockResolvedValue(mockJobs);
    vi.mocked(photoService.getByProperty).mockResolvedValue(mockPhotos);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
  });

  async function fillAndSubmitForm() {
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Jane Buyer" } });
    fireEvent.change(screen.getByLabelText(/contact.*email.*phone|email or phone/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/preferred.*time|showing.*time/i), { target: { value: "Weekday evenings" } });
    fireEvent.submit(screen.getByRole("form", { name: /showing request/i }));
  }

  it("form submission calls showingRequestService.create with propertyId and form data", async () => {
    renderPage();
    await fillAndSubmitForm();
    await waitFor(() =>
      expect(vi.mocked(showingRequestService.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId:    "42",
          name:          "Jane Buyer",
          contact:       "jane@example.com",
          preferredTime: "Weekday evenings",
        })
      )
    );
  });

  it("form submission calls notificationService.create with type ShowingRequest", async () => {
    renderPage();
    await fillAndSubmitForm();
    await waitFor(() =>
      expect(vi.mocked(notificationService.create)).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ShowingRequest" })
      )
    );
  });

  it("notification message includes the buyer's name", async () => {
    renderPage();
    await fillAndSubmitForm();
    await waitFor(() => {
      const call = vi.mocked(notificationService.create).mock.calls[0][0];
      expect(call.message).toMatch(/Jane Buyer/i);
    });
  });

  it("notification includes the correct propertyId", async () => {
    renderPage();
    await fillAndSubmitForm();
    await waitFor(() => {
      const call = vi.mocked(notificationService.create).mock.calls[0][0];
      expect(call.propertyId).toBe("42");
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.3.5  Listing page SEO and Open Graph tags
// ──────────────────────────────────────────────────────────────────────────────
describe("Listing page SEO and OG tags — (10.3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(mockFsboRecord);
    vi.mocked(propertyService.getProperty).mockResolvedValue(mockProperty);
    vi.mocked(jobService.getByProperty).mockResolvedValue(mockJobs);
    vi.mocked(photoService.getByProperty).mockResolvedValue(mockPhotos);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
    // Reset meta tags injected by previous tests
    document.querySelectorAll('meta[property^="og:"], meta[name="description"]').forEach((el) => el.remove());
    document.title = "";
  });

  it("sets document.title to include the property address", async () => {
    renderPage();
    await waitFor(() => expect(document.title).toMatch(/123 Maple Street/i));
  });

  it("sets document.title to include 'For Sale'", async () => {
    renderPage();
    await waitFor(() => expect(document.title).toMatch(/for sale/i));
  });

  it("sets og:title meta tag to include the property address", async () => {
    renderPage();
    await waitFor(() => {
      const tag = document.querySelector('meta[property="og:title"]');
      expect(tag).not.toBeNull();
      expect(tag!.getAttribute("content")).toMatch(/123 Maple Street/i);
    });
  });

  it("sets og:description meta tag to include price and city", async () => {
    renderPage();
    await waitFor(() => {
      const tag = document.querySelector('meta[property="og:description"]');
      expect(tag).not.toBeNull();
      expect(tag!.getAttribute("content")).toMatch(/485,000|\$485/i);
      expect(tag!.getAttribute("content")).toMatch(/Austin/i);
    });
  });
});
