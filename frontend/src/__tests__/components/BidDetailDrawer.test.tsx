/**
 * BidDetailDrawer — real logic worth locking down:
 *   - loads and renders the anonymous thread for this proposal, with
 *     seller messages right-aligned and redaction notices shown
 *   - sending a blank/whitespace-only message is a no-op; a real
 *     message posts, appends to the thread, and clears the draft
 *   - Enter key sends the message
 *   - a failed send shows a toast
 *   - Choose Bid calls onChoose with the proposal; Close calls onClose
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BidDetailDrawer } from "@/components/BidDetailDrawer";
import type { MaskedProposal, ThreadMessage } from "@/services/listing";

const { mockGetThread, mockPostMessage } = vi.hoisted(() => ({
  mockGetThread: vi.fn(),
  mockPostMessage: vi.fn(),
}));
vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return { ...actual, listingService: { getThread: mockGetThread, postMessage: mockPostMessage } };
});

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError } }));

function makeProposal(overrides: Partial<MaskedProposal> = {}): MaskedProposal {
  return {
    id: "prop-1", requestId: "req-1", letter: "A", commissionBps: 250,
    suggestedListCents: 50_000_000, cmaSummary: "", marketingPlan: "",
    marketingCommitments: [], estimatedDaysOnMarket: 30, status: "Shortlisted" as any,
    derived: { estNetToSellerCents: 48_000_000, pctVsCompsBps: 0, overCompFlag: false, thinCompsFlag: false },
    agentRecord: { closedInZip: 12, avgDom: 21, saleToListRatioBps: 9800, withdrawnUnsold: 1, commitmentsUnmet: 0 },
    isMine: false, agentName: null, agentEmail: null, agentBrokerage: null, createdAt: Date.now(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "m-1", proposalId: "prop-1", authorRole: "agent" as any,
    scrubbedBody: "When can we schedule a walkthrough?", redactions: [], sentAt: Date.now(),
    ...overrides,
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof BidDetailDrawer>> = {}) {
  const onClose = vi.fn();
  const onChoose = vi.fn();
  const utils = render(<BidDetailDrawer proposal={makeProposal()} onClose={onClose} onChoose={onChoose} {...props} />);
  return { ...utils, onClose, onChoose };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetThread.mockResolvedValue([]);
});

describe("BidDetailDrawer — thread", () => {
  it("shows the empty-thread message when there are no messages", async () => {
    renderDrawer();
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
  });

  it("renders loaded messages and shows a redaction notice", async () => {
    mockGetThread.mockResolvedValue([
      makeMessage({ id: "m1", scrubbedBody: "Call me at [redacted]", redactions: ["phone number"] }),
    ]);
    renderDrawer();

    expect(await screen.findByText("Call me at [redacted]")).toBeInTheDocument();
    expect(screen.getByText(/A phone number was removed/)).toBeInTheDocument();
  });
});

describe("BidDetailDrawer — sending messages", () => {
  it("does not send a blank or whitespace-only message", async () => {
    renderDrawer();
    await screen.findByText("No messages yet.");
    const input = screen.getByPlaceholderText("Ask a question…");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("sends a message, appends it, and clears the draft", async () => {
    mockPostMessage.mockResolvedValue(makeMessage({ id: "m2", authorRole: "seller" as any, scrubbedBody: "Sounds good" }));
    renderDrawer();
    await screen.findByText("No messages yet.");

    const input = screen.getByPlaceholderText("Ask a question…");
    fireEvent.change(input, { target: { value: "Sounds good" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockPostMessage).toHaveBeenCalledWith("prop-1", "Sounds good", "seller"));
    expect(await screen.findByText("Sounds good")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("shows a toast when sending fails", async () => {
    mockPostMessage.mockRejectedValue(new Error("Message blocked"));
    renderDrawer();
    await screen.findByText("No messages yet.");

    fireEvent.change(screen.getByPlaceholderText("Ask a question…"), { target: { value: "Hi there" } });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask a question…"), { key: "Enter" });

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Message blocked"));
  });
});

describe("BidDetailDrawer — actions", () => {
  it("calls onChoose with the proposal", async () => {
    const { onChoose } = renderDrawer();
    await screen.findByText("No messages yet.");
    fireEvent.click(screen.getByText("Choose Bid A"));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "prop-1" }));
  });

  it("calls onClose via the close button", async () => {
    const { onClose, container } = renderDrawer();
    await screen.findByText("No messages yet.");
    fireEvent.click(container.querySelectorAll("button")[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
