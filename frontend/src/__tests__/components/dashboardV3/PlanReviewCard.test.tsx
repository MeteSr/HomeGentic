/**
 * The one review card for a multi-step assistant task: every write the
 * assistant wants to make, with its real arguments, each ticked by default.
 * Nothing is saved until the user presses the save button.
 *
 *  PR.1 lists every step with its label, arguments, reason and what saving means
 *  PR.2 the save button counts the ticked steps; unticking leaves a step out
 *  PR.3 cancel declines the whole plan; with nothing ticked there's nothing to save
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlanReviewCard } from "@/components/dashboardV3/PlanReviewCard";
import type { AssistantPlan } from "@/services/assistantPlan";

const plan: AssistantPlan = {
  task: "storm_prep",
  title: "Storm prep for 12 Oak St",
  steps: [
    {
      tool: "schedule_maintenance_task",
      input: {
        property_id: "P1",
        system_name: "Gutters",
        task_description: "Clean gutters and downspouts",
        planned_year: 2026,
        planned_month: 6,
      },
      why: "No gutter cleaning on record",
    },
    {
      tool: "create_quote_request",
      input: {
        property_id: "P1",
        service_type: "Roofing",
        description: "Roof inspection before storm season",
        urgency: "Medium",
      },
      why: "Roof is near the end of its expected life",
    },
  ],
};

function renderCard(homeAddress: string | null = "12 Oak St, Tampa FL") {
  const onApprove = vi.fn();
  const onDismiss = vi.fn();
  render(<PlanReviewCard plan={plan} homeAddress={homeAddress} onApprove={onApprove} onDismiss={onDismiss} />);
  return { onApprove, onDismiss };
}

describe("PR.1 — every step with its real arguments", () => {
  it("shows the task, title, and each step's label, arguments, reason and note", () => {
    renderCard();
    expect(screen.getByText("Storm prep")).toBeInTheDocument();
    expect(screen.getByText("Storm prep for 12 Oak St")).toBeInTheDocument();
    expect(screen.getByText("Schedule a maintenance task")).toBeInTheDocument();
    expect(screen.getByText(/Gutters · June 2026/)).toBeInTheDocument();
    expect(screen.getByText("Clean gutters and downspouts")).toBeInTheDocument();
    expect(screen.getByText("Open a quote request")).toBeInTheDocument();
    expect(screen.getByText("Roof inspection before storm season")).toBeInTheDocument();
    expect(screen.getByText(/Roof is near the end of its expected life/)).toBeInTheDocument();
    expect(screen.getByText(/Contractors who do this work can see it/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is saved until you approve/i)).toBeInTheDocument();
  });
});

describe("PR.1b — the home the steps act on", () => {
  it("names the home from the steps' property id, not the plan's title", () => {
    renderCard();
    expect(screen.getByText("For 12 Oak St, Tampa FL")).toBeInTheDocument();
  });

  it("warns when the steps name a home that isn't on the user's list", () => {
    renderCard(null);
    expect(screen.getByText(/isn't one of your homes/)).toBeInTheDocument();
  });
});

describe("PR.2 — ticking", () => {
  it("saves every step by default", () => {
    const { onApprove } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Save 2 steps" }));
    expect(onApprove).toHaveBeenCalledWith([0, 1]);
  });

  it("leaves out an unticked step", () => {
    const { onApprove } = renderCard();
    fireEvent.click(screen.getByRole("checkbox", { name: /Open a quote request/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 step" }));
    expect(onApprove).toHaveBeenCalledWith([0]);
  });
});

describe("PR.3 — declining", () => {
  it("cancel declines the plan", () => {
    const { onDismiss, onApprove } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("can't save with nothing ticked", () => {
    renderCard();
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.getByRole("button", { name: "Save 0 steps" })).toBeDisabled();
  });
});
