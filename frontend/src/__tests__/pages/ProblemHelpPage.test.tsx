/**
 * ProblemHelpPage ("Show me the problem"): the owner describes what's wrong,
 * may add a photo, and gets an AI suggestion labelled as AI, with a danger
 * banner when needed and one tap to a prefilled quote request.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate, mockAsk } = vi.hoisted(() => ({ mockNavigate: vi.fn(), mockAsk: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "prop-1" }), useNavigate: () => mockNavigate };
});
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));
vi.mock("@/services/problemHelp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problemHelp")>();
  return { ...actual, askAboutProblem: mockAsk };
});

import ProblemHelpPage from "@/pages/ProblemHelpPage";

const ANSWER = {
  summary: "Water under the kitchen sink.",
  likelyCauses: ["A loose drain nut", "A cracked supply line"],
  safeToTry: ["Hand-tighten the drain nut"],
  shutOff: ["The two valves under the sink"],
  danger: false,
  dangerAdvice: "",
  serviceType: "Plumbing",
  urgency: "high",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProblemHelpPage />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ProblemHelpPage", () => {
  it("says up front that the answer is from AI and what to do in danger", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Show me the problem" })).toBeInTheDocument();
    expect(screen.getByText(/AI suggestions, not a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText(/call 911/i)).toBeInTheDocument();
    expect(screen.getByText(/photo is sent to the AI to read and isn't saved/i)).toBeInTheDocument();
  });

  it("waits for a description before asking", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /get ai suggestions/i })).toBeDisabled();
  });

  it("shows causes, safe steps, shutoffs and the trade, then opens a prefilled quote", async () => {
    mockAsk.mockResolvedValue(ANSWER);
    renderPage();
    fireEvent.change(screen.getByLabelText(/what's wrong/i), { target: { value: "Water under the sink" } });
    const photo = new File(["x"], "sink.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/add a photo/i), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole("button", { name: /get ai suggestions/i }));

    expect(await screen.findByText("A loose drain nut")).toBeInTheDocument();
    expect(mockAsk).toHaveBeenCalledWith("Water under the sink", photo);
    expect(screen.getByText("Hand-tighten the drain nut")).toBeInTheDocument();
    expect(screen.getByText("The two valves under the sink")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /request a quote from a plumbing pro/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: {
        prefill: {
          propertyId: "prop-1",
          serviceType: "Plumbing",
          urgency: "high",
          description: "Water under the sink",
        },
      },
    });
  });

  it("leads with the danger advice when the AI flags danger", async () => {
    mockAsk.mockResolvedValue({
      ...ANSWER,
      danger: true,
      dangerAdvice: "Leave the house and call the gas company from outside.",
      urgency: "emergency",
    });
    renderPage();
    fireEvent.change(screen.getByLabelText(/what's wrong/i), { target: { value: "Smells like gas" } });
    fireEvent.click(screen.getByRole("button", { name: /get ai suggestions/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Leave the house");
    expect(screen.getByRole("button", { name: /request an urgent quote/i })).toBeInTheDocument();
  });

  it("shows the error when asking fails", async () => {
    mockAsk.mockRejectedValue(new Error("You've reached today's limit for AI help. Try again tomorrow."));
    renderPage();
    fireEvent.change(screen.getByLabelText(/what's wrong/i), { target: { value: "Leak" } });
    fireEvent.click(screen.getByRole("button", { name: /get ai suggestions/i }));
    await waitFor(() => expect(screen.getByText(/today's limit/)).toBeInTheDocument());
  });
});
