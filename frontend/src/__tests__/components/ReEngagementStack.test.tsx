import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ReEngagementStack from "@/components/ReEngagementStack";
import type { ReEngagementPrompt } from "@/services/reEngagementService";

const prompt: ReEngagementPrompt = {
  jobId:          "job-1",
  contractorName: "Smith HVAC",
  serviceType:    "HVAC",
  monthsSince:    11,
  message:        "Book Smith HVAC again — they did your last HVAC service 11 months ago.",
};

const defaultProps = {
  prompts:        [] as ReEngagementPrompt[],
  onRequestQuote: vi.fn(),
  onLogJob:       vi.fn(),
};

describe("ReEngagementStack", () => {
  it("renders nothing when prompts is empty", () => {
    const { container } = render(<ReEngagementStack {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a prompt card when prompts has entries", () => {
    render(<ReEngagementStack {...defaultProps} prompts={[prompt]} />);
    expect(
      screen.getByText(/Book Smith HVAC again/)
    ).toBeInTheDocument();
  });

  it("shows Book Again header with service type", () => {
    render(<ReEngagementStack {...defaultProps} prompts={[prompt]} />);
    expect(screen.getByText("Book Again — HVAC")).toBeInTheDocument();
  });

  it("calls onRequestQuote with correct prefill when Request Quote is clicked", () => {
    const onRequestQuote = vi.fn();
    render(
      <ReEngagementStack
        {...defaultProps}
        prompts={[prompt]}
        onRequestQuote={onRequestQuote}
      />
    );
    fireEvent.click(screen.getByText("Request Quote →"));
    expect(onRequestQuote).toHaveBeenCalledWith({
      serviceType:    "HVAC",
      contractorName: "Smith HVAC",
    });
  });

  it("calls onLogJob with correct prefill when Log Job is clicked", () => {
    const onLogJob = vi.fn();
    render(
      <ReEngagementStack
        {...defaultProps}
        prompts={[prompt]}
        onLogJob={onLogJob}
      />
    );
    fireEvent.click(screen.getByText("Log Job"));
    expect(onLogJob).toHaveBeenCalledWith({
      serviceType:    "HVAC",
      contractorName: "Smith HVAC",
    });
  });

  it("dismisses prompt on X click", () => {
    render(<ReEngagementStack {...defaultProps} prompts={[prompt]} />);
    fireEvent.click(screen.getByLabelText("Dismiss HVAC re-engagement"));
    expect(screen.queryByText(/Book Smith HVAC again/)).not.toBeInTheDocument();
  });

  it("hides prompt already dismissed via localStorage on mount", () => {
    localStorage.setItem("homefax_reengage_job-1", "1");
    render(<ReEngagementStack {...defaultProps} prompts={[prompt]} />);
    expect(screen.queryByText(/Book Smith HVAC again/)).not.toBeInTheDocument();
  });
});
