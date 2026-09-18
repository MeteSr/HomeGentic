/**
 * VoiceAgent — real logic worth locking down (the underlying hook is
 * mocked; useVoiceAgent.test.ts already covers its own logic):
 *   - renders nothing when isSupported is false
 *   - the mic button click calls startListening/stopListening depending
 *     on state, and is disabled while processing/speaking
 *   - the speech bubble only renders when there's something to show
 *     (transcript/response/error/pendingProposal)
 *   - the pending-proposal card's Confirm/Cancel buttons call
 *     confirmProposal/dismissProposal
 *   - the history panel toggles open/closed and Clear calls clearHistory
 *   - the pending-image indicator's remove button calls clearImage
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceAgent } from "@/components/VoiceAgent";
import { useVoiceAgent, type UseVoiceAgentReturn } from "@/hooks/useVoiceAgent";

vi.mock("@/hooks/useVoiceAgent", () => ({ useVoiceAgent: vi.fn() }));

const mockUseVoiceAgent = vi.mocked(useVoiceAgent);

function baseReturn(overrides: Partial<UseVoiceAgentReturn> = {}): UseVoiceAgentReturn {
  return {
    state: "idle",
    transcript: "",
    response: "",
    error: null,
    isSupported: true,
    alerts: [],
    history: [],
    pendingImage: null,
    pendingProposal: null,
    creditBalance: null,
    quotaExhausted: false,
    fallbackNotice: false,
    clearHistory: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    reset: vi.fn(),
    sendChat: vi.fn(),
    attachImage: vi.fn(),
    clearImage: vi.fn(),
    sendImageToAgent: vi.fn(),
    confirmProposal: vi.fn(),
    dismissProposal: vi.fn(),
    buyCredits: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VoiceAgent — unsupported browser", () => {
  it("renders nothing when isSupported is false", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ isSupported: false }));
    const { container } = render(<VoiceAgent />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VoiceAgent — mic button", () => {
  it("calls startListening when idle and clicked", () => {
    const startListening = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ state: "idle", startListening }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByLabelText("Ask HomeGentic"));
    expect(startListening).toHaveBeenCalledTimes(1);
  });

  it("calls stopListening when listening and clicked", () => {
    const stopListening = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ state: "listening", stopListening }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByLabelText("Stop listening"));
    expect(stopListening).toHaveBeenCalledTimes(1);
  });

  it("is disabled while processing", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ state: "processing" }));
    render(<VoiceAgent />);
    expect(screen.getByLabelText("Ask HomeGentic")).toBeDisabled();
  });

  it("is disabled while speaking", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ state: "speaking" }));
    render(<VoiceAgent />);
    expect(screen.getByLabelText("Ask HomeGentic")).toBeDisabled();
  });

  it("shows the Listening label while listening", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ state: "listening" }));
    render(<VoiceAgent />);
    expect(screen.getByText("Listening")).toBeInTheDocument();
  });
});

describe("VoiceAgent — speech bubble visibility", () => {
  it("does not render the bubble when idle with no content", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn());
    render(<VoiceAgent />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the bubble with the transcript when present", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ transcript: "turn on the lights" }));
    render(<VoiceAgent />);
    expect(screen.getByText('"turn on the lights"')).toBeInTheDocument();
  });

  it("renders the bubble with the response when present", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ response: "Here's your score." }));
    render(<VoiceAgent />);
    expect(screen.getByText("Here's your score.")).toBeInTheDocument();
  });

  it("renders the bubble with the error when present", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ error: "Something went wrong" }));
    render(<VoiceAgent />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("clicking the dismiss button calls reset", () => {
    const reset = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ response: "hi", reset }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("VoiceAgent — pending proposal card", () => {
  const proposal = {
    propertyAddress: "1 Main St",
    serviceType: "Plumbing",
    description: "Fixed leak",
    amountCents: 12345,
    completedDate: "2026-01-01",
    contractorName: "Acme Plumbing",
  };

  it("renders proposal details", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ pendingProposal: proposal }));
    render(<VoiceAgent />);
    expect(screen.getByText("Plumbing")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("$123.45")).toBeInTheDocument();
    expect(screen.getByText("Acme Plumbing")).toBeInTheDocument();
  });

  it("shows a duplicate warning when duplicateInfo is present", () => {
    mockUseVoiceAgent.mockReturnValue(
      baseReturn({
        pendingProposal: { ...proposal, duplicateInfo: { jobId: "abc123456789", reason: "same date" } },
      })
    );
    render(<VoiceAgent />);
    expect(screen.getByText(/Possible duplicate/)).toBeInTheDocument();
    expect(screen.getByText(/456789/)).toBeInTheDocument();
  });

  it("calls confirmProposal when Confirm & Send is clicked", () => {
    const confirmProposal = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ pendingProposal: proposal, confirmProposal }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByText("Confirm & Send"));
    expect(confirmProposal).toHaveBeenCalledTimes(1);
  });

  it("calls dismissProposal when Cancel is clicked", () => {
    const dismissProposal = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ pendingProposal: proposal, dismissProposal }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(dismissProposal).toHaveBeenCalledTimes(1);
  });
});

describe("VoiceAgent — history panel", () => {
  const history = [
    { id: "1", label: "Logged job", summary: "Roof repair", success: true, timestamp: Date.now() },
    { id: "2", label: "Failed action", summary: "Could not save", success: false, timestamp: Date.now() },
  ] as UseVoiceAgentReturn["history"];

  it("does not render the panel when history is empty", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ history: [] }));
    render(<VoiceAgent />);
    expect(screen.queryByText(/Agent History/)).not.toBeInTheDocument();
  });

  it("shows the history count but not entries until expanded", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ history }));
    render(<VoiceAgent />);
    expect(screen.getByText("Agent History (2)")).toBeInTheDocument();
    expect(screen.queryByText("Roof repair")).not.toBeInTheDocument();
  });

  it("expands to show entries when the header is clicked", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ history }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByText("Agent History (2)"));
    expect(screen.getByText("Roof repair")).toBeInTheDocument();
    expect(screen.getByText("Could not save")).toBeInTheDocument();
  });

  it("calls clearHistory and collapses when Clear is clicked", () => {
    const clearHistory = vi.fn();
    mockUseVoiceAgent.mockReturnValue(baseReturn({ history, clearHistory }));
    render(<VoiceAgent />);
    fireEvent.click(screen.getByText("Agent History (2)"));
    fireEvent.click(screen.getByText("Clear"));
    expect(clearHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Roof repair")).not.toBeInTheDocument();
  });
});

describe("VoiceAgent — pending image indicator", () => {
  it("renders the attachment indicator when pendingImage is set", () => {
    mockUseVoiceAgent.mockReturnValue(baseReturn({ pendingImage: { base64: "abc", mimeType: "image/png" } }));
    render(<VoiceAgent />);
    expect(screen.getByText("Image attached — tap mic to describe it")).toBeInTheDocument();
  });

  it("calls clearImage when the remove button is clicked", () => {
    const clearImage = vi.fn();
    mockUseVoiceAgent.mockReturnValue(
      baseReturn({ pendingImage: { base64: "abc", mimeType: "image/png" }, clearImage })
    );
    render(<VoiceAgent />);
    fireEvent.click(screen.getByLabelText("Remove image"));
    expect(clearImage).toHaveBeenCalledTimes(1);
  });
});
