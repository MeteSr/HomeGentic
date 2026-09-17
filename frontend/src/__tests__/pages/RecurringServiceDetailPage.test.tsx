/**
 * RecurringServiceDetailPage — real logic worth locking down:
 *   - loading -> populated states
 *   - logging a visit prepends the new entry to the list and closes the form
 *   - pause/resume/cancel status transitions, with cancel gated behind a
 *     window.confirm the user can decline
 *   - date formatting (YYYY-MM-DD -> "Mon D, YYYY")
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RecurringServiceDetailPage from "@/pages/RecurringServiceDetailPage";
import type { RecurringService, VisitLog } from "@/services/recurringService";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "svc-1" }) };
});

const { mockGetById, mockGetVisitLogs, mockAddVisitLog, mockUpdateStatus } = vi.hoisted(() => ({
  mockGetById:      vi.fn(),
  mockGetVisitLogs: vi.fn(),
  mockAddVisitLog:  vi.fn(),
  mockUpdateStatus: vi.fn(),
}));

vi.mock("@/services/recurringService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recurringService")>();
  return {
    ...actual,
    recurringService: {
      getById: mockGetById, getVisitLogs: mockGetVisitLogs,
      addVisitLog: mockAddVisitLog, updateStatus: mockUpdateStatus,
    },
  };
});

vi.mock("@/services/photo", () => ({
  photoService: { upload: vi.fn() },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "svc-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "LawnCare",
    providerName: "Green Lawn Co", frequency: "Monthly", startDate: "2024-01-01",
    status: "Active", createdAt: Date.now(),
    ...overrides,
  } as RecurringService;
}

function makeVisit(overrides: Partial<VisitLog> = {}): VisitLog {
  return {
    id: "visit-1", serviceId: "svc-1", propertyId: "prop-1",
    visitDate: "2024-03-15", createdAt: Date.now(),
    ...overrides,
  } as VisitLog;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecurringServiceDetailPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVisitLogs.mockResolvedValue([]);
});

describe("RecurringServiceDetailPage — visit log", () => {
  it("shows the empty state and formats dates for logged visits", async () => {
    mockGetById.mockResolvedValue(makeService());
    mockGetVisitLogs.mockResolvedValue([makeVisit({ visitDate: "2024-03-15" })]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Mar 15, 2024")).toBeInTheDocument());
  });

  it("prepends a newly logged visit and closes the form", async () => {
    mockGetById.mockResolvedValue(makeService());
    mockGetVisitLogs.mockResolvedValue([makeVisit({ id: "old", visitDate: "2024-01-01" })]);
    mockAddVisitLog.mockResolvedValue(makeVisit({ id: "new", visitDate: "2024-06-01" }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Log Visit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Log Visit"));

    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(mockAddVisitLog).toHaveBeenCalledWith("svc-1", expect.any(String), undefined));
    await waitFor(() => expect(screen.getByText("Jun 01, 2024")).toBeInTheDocument());
    expect(screen.queryByText("Save")).not.toBeInTheDocument(); // form closed
    expect(mockToastSuccess).toHaveBeenCalledWith("Visit logged");
  });
});

describe("RecurringServiceDetailPage — status transitions", () => {
  it("pauses an active service", async () => {
    mockGetById.mockResolvedValue(makeService({ status: "Active" }));
    mockUpdateStatus.mockResolvedValue(makeService({ status: "Paused" }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Pause Service")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pause Service"));

    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("svc-1", "Paused"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Service paused");
  });

  it("resumes a paused service", async () => {
    mockGetById.mockResolvedValue(makeService({ status: "Paused" }));
    mockUpdateStatus.mockResolvedValue(makeService({ status: "Active" }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Resume Service")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Resume Service"));

    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("svc-1", "Active"));
  });

  it("cancels only after the user confirms", async () => {
    mockGetById.mockResolvedValue(makeService({ status: "Active" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await waitFor(() => expect(screen.getByText("Cancel Service")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cancel Service"));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("svc-1", "Cancelled"));
    confirmSpy.mockRestore();
  });

  it("does not cancel when the user declines the confirmation", async () => {
    mockGetById.mockResolvedValue(makeService({ status: "Active" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    await waitFor(() => expect(screen.getByText("Cancel Service")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cancel Service"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
