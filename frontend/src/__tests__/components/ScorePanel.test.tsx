import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ScorePanel from "@/components/ScorePanel";

const defaultProps = {
  score:         74,
  grade:         "B",
  delta:         0,
  certified:     false,
  premium:       null,
  market:        "Austin, TX",
  onResaleReady: vi.fn(),
  onCopyCertLink: vi.fn(),
};

describe("ScorePanel", () => {
  it("renders the score number", () => {
    render(<ScorePanel {...defaultProps} />);
    expect(screen.getByText("74")).toBeInTheDocument();
  });

  it("renders the grade", () => {
    render(<ScorePanel {...defaultProps} />);
    expect(screen.getByText(/\/100 · B/)).toBeInTheDocument();
  });

  it("hides delta chip when delta is 0", () => {
    render(<ScorePanel {...defaultProps} delta={0} />);
    expect(screen.queryByLabelText("Score delta")).not.toBeInTheDocument();
  });

  it("shows positive delta chip when delta > 0", () => {
    render(<ScorePanel {...defaultProps} delta={5} />);
    expect(screen.getByLabelText("Score delta")).toHaveTextContent("+5 pts");
  });

  it("shows negative delta chip when delta < 0", () => {
    render(<ScorePanel {...defaultProps} delta={-3} />);
    expect(screen.getByLabelText("Score delta")).toHaveTextContent("-3 pts");
  });

  it("hides certified badge when not certified", () => {
    render(<ScorePanel {...defaultProps} certified={false} />);
    expect(screen.queryByLabelText("HomeGentic Certified")).not.toBeInTheDocument();
  });

  it("shows certified badge when certified", () => {
    render(<ScorePanel {...defaultProps} certified={true} />);
    expect(screen.getByLabelText("HomeGentic Certified")).toBeInTheDocument();
  });

  it("hides premium range when premium is null", () => {
    render(<ScorePanel {...defaultProps} premium={null} />);
    expect(screen.queryByLabelText("Premium estimate")).not.toBeInTheDocument();
  });

  it("shows premium range when premium is provided", () => {
    render(
      <ScorePanel {...defaultProps} premium={{ low: 15000, high: 25000 }} />
    );
    expect(screen.getByLabelText("Premium estimate")).toBeInTheDocument();
    expect(screen.getByText(/15,000/)).toBeInTheDocument();
  });

  it("calls onResaleReady when View Resale Report is clicked", () => {
    const onResaleReady = vi.fn();
    render(<ScorePanel {...defaultProps} onResaleReady={onResaleReady} />);
    fireEvent.click(screen.getByText("View Resale Report"));
    expect(onResaleReady).toHaveBeenCalledTimes(1);
  });

  it("calls onCopyCertLink when Copy Cert Link is clicked", () => {
    const onCopyCertLink = vi.fn();
    render(<ScorePanel {...defaultProps} onCopyCertLink={onCopyCertLink} />);
    fireEvent.click(screen.getByText("Copy Cert Link"));
    expect(onCopyCertLink).toHaveBeenCalledTimes(1);
  });
});
