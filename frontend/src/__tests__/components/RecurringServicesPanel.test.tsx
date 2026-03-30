import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RecurringServicesPanel from "@/components/RecurringServicesPanel";
import type { RecurringService, VisitLog } from "@/services/recurringService";

const service: RecurringService = {
  id:           "svc-1",
  propertyId:   "prop-1",
  homeowner:    "user-1",
  serviceType:  "LawnCare",
  providerName: "Green Thumb Co",
  frequency:    "Monthly",
  startDate:    "2024-01-01",
  status:       "Active",
  createdAt:    Date.now(),
};

const defaultProps = {
  services:      [] as RecurringService[],
  visitLogMap:   {} as Record<string, VisitLog[]>,
  userTier:      "Free" as const,
  onAddService:  vi.fn(),
  onViewService: vi.fn(),
};

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("RecurringServicesPanel", () => {
  it("renders the Recurring Services header", () => {
    renderWithRouter(<RecurringServicesPanel {...defaultProps} />);
    expect(screen.getByText("Recurring Services")).toBeInTheDocument();
  });

  it("renders empty state when services is empty", () => {
    renderWithRouter(<RecurringServicesPanel {...defaultProps} />);
    expect(screen.getByText(/Lawn care, pest control/)).toBeInTheDocument();
    expect(screen.getByText("Add first service →")).toBeInTheDocument();
  });

  it("renders service cards when services are provided", () => {
    renderWithRouter(
      <RecurringServicesPanel {...defaultProps} services={[service]} />
    );
    expect(screen.getByText("Green Thumb Co")).toBeInTheDocument();
  });

  it("calls onAddService when + Add button is clicked", () => {
    const onAddService = vi.fn();
    renderWithRouter(
      <RecurringServicesPanel {...defaultProps} onAddService={onAddService} />
    );
    fireEvent.click(screen.getByText("+ Add"));
    expect(onAddService).toHaveBeenCalledTimes(1);
  });

  it("calls onAddService when Add first service is clicked in empty state", () => {
    const onAddService = vi.fn();
    renderWithRouter(
      <RecurringServicesPanel {...defaultProps} onAddService={onAddService} />
    );
    fireEvent.click(screen.getByText("Add first service →"));
    expect(onAddService).toHaveBeenCalledTimes(1);
  });

  it("does not show empty state when services are provided", () => {
    renderWithRouter(
      <RecurringServicesPanel {...defaultProps} services={[service]} />
    );
    expect(screen.queryByText(/Lawn care, pest control/)).not.toBeInTheDocument();
  });
});
