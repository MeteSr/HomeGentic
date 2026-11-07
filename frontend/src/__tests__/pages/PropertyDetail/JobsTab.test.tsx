import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { JobsTab } from "@/pages/PropertyDetail/JobsTab";
import type { Job } from "@/services/job";

const job: Job = {
  id: "j1",
  propertyId: "prop-9",
  homeowner: "o",
  serviceType: "Roofing",
  contractorName: "Acme",
  amount: 1_500_000,
  date: "2024-03-10",
  description: "New roof",
  isDiy: false,
  status: "verified",
  verified: true,
  homeownerSigned: true,
  contractorSigned: true,
  photos: [],
  createdAt: 0,
};

const renderTab = (jobs: Job[]) =>
  render(
    <MemoryRouter>
      <JobsTab propertyId="prop-9" jobs={jobs} />
    </MemoryRouter>,
  );

describe("JobsTab", () => {
  it("links to the home's improvements record", () => {
    renderTab([job]);
    expect(screen.getByRole("link", { name: /improvements record/i })).toHaveAttribute(
      "href",
      "/properties/prop-9/improvements",
    );
    expect(screen.getByText("Roofing")).toBeInTheDocument();
  });

  it("shows the empty state with no link when there are no jobs", () => {
    renderTab([]);
    expect(screen.getByText(/no jobs found/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /improvements record/i })).toBeNull();
  });
});
