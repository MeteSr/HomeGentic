import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MilestoneStack from "@/components/MilestoneStack";

const ELEVEN_MONTHS_MS = 11 * 30 * 24 * 60 * 60 * 1000;

const defaultProps = {
  verifiedJobCount: 0,
  accountAgeMs:     0,
  certified:        false,
  onNavigate:       vi.fn(),
};

describe("MilestoneStack", () => {
  beforeEach(() => { localStorage.clear(); });
  it("renders nothing when no conditions are met", () => {
    const { container } = render(<MilestoneStack {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows annual milestone when account is old enough and has verified jobs", () => {
    render(
      <MilestoneStack
        {...defaultProps}
        accountAgeMs={ELEVEN_MONTHS_MS + 1}
        verifiedJobCount={1}
      />
    );
    expect(screen.getByText("One Year of HomeFax")).toBeInTheDocument();
  });

  it("does not show annual milestone when verifiedJobCount is 0", () => {
    render(
      <MilestoneStack
        {...defaultProps}
        accountAgeMs={ELEVEN_MONTHS_MS + 1}
        verifiedJobCount={0}
      />
    );
    expect(screen.queryByText("One Year of HomeFax")).not.toBeInTheDocument();
  });

  it("shows 3-job milestone when verifiedJobCount >= 3", () => {
    render(
      <MilestoneStack {...defaultProps} verifiedJobCount={3} />
    );
    expect(
      screen.getByText(/Milestone — Your Home History Is Taking Shape/)
    ).toBeInTheDocument();
  });

  it("does not show 3-job milestone when verifiedJobCount < 3", () => {
    render(<MilestoneStack {...defaultProps} verifiedJobCount={2} />);
    expect(
      screen.queryByText(/Milestone — Your Home History Is Taking Shape/)
    ).not.toBeInTheDocument();
  });

  it("shows certified banner when certified is true", () => {
    render(<MilestoneStack {...defaultProps} certified={true} />);
    expect(screen.getByText("HomeFax Certified")).toBeInTheDocument();
  });

  it("dismisses annual milestone on X click", () => {
    render(
      <MilestoneStack
        {...defaultProps}
        accountAgeMs={ELEVEN_MONTHS_MS + 1}
        verifiedJobCount={1}
      />
    );
    fireEvent.click(screen.getByLabelText("Dismiss annual milestone"));
    expect(screen.queryByText("One Year of HomeFax")).not.toBeInTheDocument();
  });

  it("dismisses 3-job milestone on X click", () => {
    render(<MilestoneStack {...defaultProps} verifiedJobCount={3} />);
    fireEvent.click(screen.getByLabelText("Dismiss 3-job milestone"));
    expect(
      screen.queryByText(/Milestone — Your Home History Is Taking Shape/)
    ).not.toBeInTheDocument();
  });

  it("calls onNavigate with /resale-ready from annual banner", () => {
    const onNavigate = vi.fn();
    render(
      <MilestoneStack
        {...defaultProps}
        accountAgeMs={ELEVEN_MONTHS_MS + 1}
        verifiedJobCount={1}
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByText(/View Resale Summary/));
    expect(onNavigate).toHaveBeenCalledWith("/resale-ready");
  });
});
