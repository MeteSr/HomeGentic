/**
 * RecurringServiceCard — real logic worth locking down:
 *   - shows "No visits logged" with no visit history, or the most
 *     recent visit date (by string-max, not array order) formatted
 *     as "Mon D, YYYY"
 *   - falls back to the raw serviceType/frequency string when a label
 *     lookup misses, and to the default wrench icon/Active style for
 *     an unknown service type or status
 *   - clicking the card navigates to /recurring/:id
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecurringServiceCard } from "@/components/RecurringServiceCard";
import type { RecurringService, VisitLog } from "@/services/recurringService";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "rs-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "LawnCare",
    providerName: "Green Lawn Co.", frequency: "Monthly", startDate: "2024-01-01",
    status: "Active", createdAt: Date.now(),
    ...overrides,
  };
}

function makeVisit(overrides: Partial<VisitLog> = {}): VisitLog {
  return {
    id: "v-1", serviceId: "rs-1", propertyId: "prop-1", visitDate: "2024-03-01",
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("RecurringServiceCard — visit history", () => {
  it("shows No visits logged when there are none", () => {
    render(<RecurringServiceCard service={makeService()} visitLogs={[]} />);
    expect(screen.getByText("No visits logged")).toBeInTheDocument();
  });

  it("shows the most recent visit date regardless of array order", () => {
    render(<RecurringServiceCard
      service={makeService()}
      visitLogs={[makeVisit({ id: "v1", visitDate: "2024-01-15" }), makeVisit({ id: "v2", visitDate: "2024-06-20" })]}
    />);
    expect(screen.getByText("Last: Jun 20, 2024")).toBeInTheDocument();
  });
});

describe("RecurringServiceCard — labels and fallbacks", () => {
  it("uses the human-readable service type and frequency labels", () => {
    render(<RecurringServiceCard service={makeService({ serviceType: "PoolMaintenance", frequency: "BiWeekly" })} visitLogs={[]} />);
    expect(screen.getByText("Pool Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Bi-Weekly")).toBeInTheDocument();
  });

  it("falls back to the raw string for an unrecognized service type", () => {
    render(<RecurringServiceCard service={makeService({ serviceType: "TreeTrimming" as any })} visitLogs={[]} />);
    expect(screen.getByText("TreeTrimming")).toBeInTheDocument();
  });

  it("shows the provider name and status", () => {
    render(<RecurringServiceCard service={makeService({ providerName: "Sunshine Pools", status: "Paused" as any })} visitLogs={[]} />);
    expect(screen.getByText("Sunshine Pools")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });
});

describe("RecurringServiceCard — navigation", () => {
  it("navigates to /recurring/:id when clicked", () => {
    render(<RecurringServiceCard service={makeService({ id: "rs-42" })} visitLogs={[]} />);
    fireEvent.click(screen.getByText("Green Lawn Co."));
    expect(mockNavigate).toHaveBeenCalledWith("/recurring/rs-42");
  });
});
