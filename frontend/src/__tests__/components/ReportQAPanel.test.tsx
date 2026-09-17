/**
 * ReportQAPanel — real logic worth locking down (against the real
 * in-memory reportQAService, not mocks):
 *   - the ask form only shows for buyers (sellerView=false), never
 *     for sellers
 *   - blank/whitespace-only questions are a no-op
 *   - asking a real question appends it to the list and clears the
 *     input
 *   - unanswered questions show "No answer yet"; answered ones show
 *     the answer text
 *   - the list is scoped to the given propertyId and re-loads when it
 *     changes
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import ReportQAPanel from "@/components/ReportQAPanel";
import { reportQAService } from "@/services/reportQA";

beforeEach(() => {
  (reportQAService as any).__reset();
});

describe("ReportQAPanel — ask form visibility", () => {
  it("shows the ask form for buyers", () => {
    render(<ReportQAPanel propertyId="prop-1" sellerView={false} />);
    expect(screen.getByLabelText("Ask question")).toBeInTheDocument();
  });

  it("hides the ask form for sellers", () => {
    render(<ReportQAPanel propertyId="prop-1" sellerView />);
    expect(screen.queryByLabelText("Ask question")).not.toBeInTheDocument();
  });
});

describe("ReportQAPanel — asking questions", () => {
  it("ignores a blank or whitespace-only question", () => {
    render(<ReportQAPanel propertyId="prop-1" sellerView={false} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about maintenance/), { target: { value: "   " } });
    fireEvent.click(screen.getByLabelText("Ask question"));

    expect(reportQAService.getByProperty("prop-1")).toHaveLength(0);
  });

  it("appends a real question and clears the input", async () => {
    render(<ReportQAPanel propertyId="prop-1" sellerView={false} />);
    const input = screen.getByPlaceholderText(/Ask about maintenance/);
    fireEvent.change(input, { target: { value: "Is the roof under warranty?" } });
    fireEvent.click(screen.getByLabelText("Ask question"));

    expect(await screen.findByText("Is the roof under warranty?")).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue(""));
    expect(reportQAService.getByProperty("prop-1")).toHaveLength(1);
  });

  it("shows unanswered questions as No answer yet", async () => {
    render(<ReportQAPanel propertyId="prop-1" sellerView={false} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about maintenance/), { target: { value: "Any pending permits?" } });
    fireEvent.click(screen.getByLabelText("Ask question"));

    expect(await screen.findByText("No answer yet")).toBeInTheDocument();
  });
});

describe("ReportQAPanel — property scoping", () => {
  it("only shows questions for the current propertyId", () => {
    reportQAService.ask("prop-1", "Question about property 1");
    reportQAService.ask("prop-2", "Question about property 2");

    render(<ReportQAPanel propertyId="prop-1" sellerView />);

    expect(screen.getByText("Question about property 1")).toBeInTheDocument();
    expect(screen.queryByText("Question about property 2")).not.toBeInTheDocument();
  });

  it("re-loads the question list when propertyId changes", () => {
    reportQAService.ask("prop-1", "Q for property 1");
    reportQAService.ask("prop-2", "Q for property 2");

    const { rerender } = render(<ReportQAPanel propertyId="prop-1" sellerView />);
    expect(screen.getByText("Q for property 1")).toBeInTheDocument();

    rerender(<ReportQAPanel propertyId="prop-2" sellerView />);
    expect(screen.getByText("Q for property 2")).toBeInTheDocument();
    expect(screen.queryByText("Q for property 1")).not.toBeInTheDocument();
  });
});
