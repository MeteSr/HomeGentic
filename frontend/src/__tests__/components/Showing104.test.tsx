/**
 * TDD tests for Epic 10.4 — Buyer Communication & Showing Management
 *
 *   10.4.1 — Showing request inbox (accept / decline / propose alternate time)
 *   10.4.2 — Showing calendar (list of confirmed showings, iCal export)
 *   10.4.3 — Post-showing feedback request (send request, log response)
 *   10.4.4 — Buyer Q&A via HomeGentic report (submit question, seller sees it)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ─── Mock data (vi.hoisted) ────────────────────────────────────────────────────

const {
  mockPending, mockAccepted, mockDeclined, mockAlternate,
  mockFeedbackRequest, mockQA,
} = vi.hoisted(() => {
  const now = Date.now();

  const mockPending = {
    id:            "sr-1",
    propertyId:    "prop-1",
    name:          "Alice Buyer",
    contact:       "alice@example.com",
    preferredTime: "Saturday 10am",
    createdAt:     now - 3_000,
    status:        "Pending" as const,
  };

  const mockAccepted = {
    ...mockPending,
    id:     "sr-2",
    name:   "Bob Buyer",
    status: "Accepted" as const,
  };

  const mockDeclined = {
    ...mockPending,
    id:     "sr-3",
    name:   "Carol Buyer",
    status: "Declined" as const,
  };

  const mockAlternate = {
    ...mockPending,
    id:            "sr-4",
    name:          "Dave Buyer",
    status:        "AlternatePending" as const,
    alternateTime: "Sunday 2pm",
  };

  const mockFeedbackRequest = {
    id:        "fb-1",
    showingId: "sr-2",
    sentAt:    now - 1_000,
    response:  null as string | null,
  };

  const mockQA = {
    id:         "qa-1",
    propertyId: "prop-1",
    question:   "Is the roof newer than 10 years?",
    askedAt:    now - 2_000,
    answer:     null as string | null,
  };

  return { mockPending, mockAccepted, mockDeclined, mockAlternate, mockFeedbackRequest, mockQA };
});

// ─── Service mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/showingRequest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/showingRequest")>();
  return {
    ...actual,   // re-export pure helpers (generateIcal, etc.)
    showingRequestService: {
      getByProperty:    vi.fn().mockReturnValue([]),
      create:           vi.fn().mockImplementation((input) => ({ ...input, id: "sr-new", createdAt: Date.now(), status: "Pending" })),
      accept:           vi.fn().mockImplementation((id) => ({ ...mockAccepted, id })),
      decline:          vi.fn().mockImplementation((id) => ({ ...mockDeclined, id })),
      proposeAlternate: vi.fn().mockImplementation((id, time) => ({ ...mockAlternate, id, alternateTime: time })),
    },
  };
});

vi.mock("@/services/showingFeedback", () => ({
  showingFeedbackService: {
    sendRequest:    vi.fn().mockResolvedValue(mockFeedbackRequest),
    submitResponse: vi.fn().mockResolvedValue({ ...mockFeedbackRequest, response: "It went well!" }),
    getByShowing:   vi.fn().mockReturnValue(null),
  },
}));

vi.mock("@/services/reportQA", () => ({
  reportQAService: {
    ask:           vi.fn().mockResolvedValue(mockQA),
    getByProperty: vi.fn().mockReturnValue([mockQA]),
  },
}));

vi.mock("@/services/notifications", () => ({
  notificationService: {
    create: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal:       "local",
    profile:         { role: "Homeowner", tier: "Pro" },
    isAuthenticated: true,
  }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import ShowingInbox    from "@/components/ShowingInbox";
import ShowingCalendar from "@/components/ShowingCalendar";
import ReportQAPanel   from "@/components/ReportQAPanel";
import { showingRequestService, type ShowingRequest } from "@/services/showingRequest";
import { showingFeedbackService } from "@/services/showingFeedback";
import { reportQAService }        from "@/services/reportQA";
import { generateIcal }           from "@/services/showingRequest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderInbox(requests: ShowingRequest[] = [mockPending as ShowingRequest]) {
  vi.mocked(showingRequestService.getByProperty).mockReturnValue(requests as any);
  return render(
    <MemoryRouter>
      <ShowingInbox propertyId="prop-1" />
    </MemoryRouter>
  );
}

function renderCalendar(requests: ShowingRequest[] = [mockAccepted as ShowingRequest]) {
  vi.mocked(showingRequestService.getByProperty).mockReturnValue(requests as any);
  return render(
    <MemoryRouter>
      <ShowingCalendar propertyId="prop-1" />
    </MemoryRouter>
  );
}

function renderQAPanel() {
  vi.mocked(reportQAService.getByProperty).mockReturnValue([mockQA] as any);
  return render(
    <MemoryRouter>
      <ReportQAPanel propertyId="prop-1" sellerView={false} />
    </MemoryRouter>
  );
}

function renderQAPanelSeller() {
  vi.mocked(reportQAService.getByProperty).mockReturnValue([mockQA] as any);
  return render(
    <MemoryRouter>
      <ReportQAPanel propertyId="prop-1" sellerView={true} />
    </MemoryRouter>
  );
}

// ─── 10.4.1 Showing request inbox ─────────────────────────────────────────────

describe("ShowingInbox — showing request inbox (10.4.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 'Showing Requests' section heading", () => {
    renderInbox();
    expect(screen.getByText(/showing requests/i)).toBeInTheDocument();
  });

  it("shows empty-state message when there are no requests", () => {
    vi.mocked(showingRequestService.getByProperty).mockReturnValue([]);
    render(<MemoryRouter><ShowingInbox propertyId="prop-1" /></MemoryRouter>);
    expect(screen.getByText(/no showing requests/i)).toBeInTheDocument();
  });

  it("displays buyer name, contact, and preferred time for each request", () => {
    renderInbox();
    expect(screen.getByText("Alice Buyer")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText(/saturday 10am/i)).toBeInTheDocument();
  });

  it("shows Accept and Decline buttons for Pending requests", () => {
    renderInbox();
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("clicking Accept calls showingRequestService.accept with the request id", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => {
      expect(showingRequestService.accept).toHaveBeenCalledWith("sr-1");
    });
  });

  it("clicking Decline calls showingRequestService.decline with the request id", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    await waitFor(() => {
      expect(showingRequestService.decline).toHaveBeenCalledWith("sr-1");
    });
  });

  it("shows a 'Propose Alternate Time' button for Pending requests", () => {
    renderInbox();
    expect(screen.getByRole("button", { name: /propose alternate/i })).toBeInTheDocument();
  });

  it("clicking Propose Alternate reveals a text input for alternate time", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /propose alternate/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/alternate time/i)).toBeInTheDocument();
    });
  });

  it("submitting an alternate time calls proposeAlternate with id and new time", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /propose alternate/i }));
    await waitFor(() => screen.getByLabelText(/alternate time/i));
    fireEvent.change(screen.getByLabelText(/alternate time/i), { target: { value: "Sunday 2pm" } });
    fireEvent.click(screen.getByRole("button", { name: /send alternate/i }));
    await waitFor(() => {
      expect(showingRequestService.proposeAlternate).toHaveBeenCalledWith("sr-1", "Sunday 2pm");
    });
  });

  it("shows 'Accepted' badge for accepted requests", () => {
    renderInbox([mockAccepted]);
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
  });

  it("shows 'Declined' badge for declined requests", () => {
    renderInbox([mockDeclined]);
    expect(screen.getByText(/declined/i)).toBeInTheDocument();
  });

  it("shows 'Alternate Proposed' badge for alternate-pending requests", () => {
    renderInbox([mockAlternate]);
    expect(screen.getByText(/alternate proposed/i)).toBeInTheDocument();
    expect(screen.getByText(/sunday 2pm/i)).toBeInTheDocument();
  });
});

// ─── 10.4.2 Showing calendar ───────────────────────────────────────────────────

describe("ShowingCalendar — showing calendar (10.4.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 'Confirmed Showings' section heading", () => {
    renderCalendar();
    expect(screen.getByText(/confirmed showings/i)).toBeInTheDocument();
  });

  it("lists only accepted showings", () => {
    renderCalendar([mockPending, mockAccepted, mockDeclined]);
    // Only Bob Buyer (Accepted) should appear; Alice (Pending) and Carol (Declined) should not
    expect(screen.getByText("Bob Buyer")).toBeInTheDocument();
    expect(screen.queryByText("Alice Buyer")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Buyer")).not.toBeInTheDocument();
  });

  it("shows empty-state when no showings are confirmed", () => {
    renderCalendar([mockPending]);
    expect(screen.getByText(/no confirmed showings/i)).toBeInTheDocument();
  });

  it("shows preferred time for each confirmed showing", () => {
    renderCalendar([mockAccepted]);
    expect(screen.getByText(/saturday 10am/i)).toBeInTheDocument();
  });

  it("renders an 'Export iCal' button", () => {
    renderCalendar([mockAccepted]);
    expect(screen.getByRole("button", { name: /export ical/i })).toBeInTheDocument();
  });

  it("clicking Export iCal triggers a download with .ics content", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement;
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    renderCalendar([mockAccepted]);
    fireEvent.click(screen.getByRole("button", { name: /export ical/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

// ─── generateIcal pure helper ─────────────────────────────────────────────────

describe("generateIcal — iCal export helper (10.4.2)", () => {
  it("is a function exported from showingRequest service", () => {
    expect(typeof generateIcal).toBe("function");
  });

  it("returns a string containing BEGIN:VCALENDAR", () => {
    const ical = generateIcal([mockAccepted as any]);
    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).toContain("END:VCALENDAR");
  });

  it("includes one VEVENT per accepted showing", () => {
    const ical = generateIcal([mockAccepted as any]);
    expect(ical).toContain("BEGIN:VEVENT");
    expect(ical).toContain("END:VEVENT");
  });

  it("includes the buyer name in the SUMMARY field", () => {
    const ical = generateIcal([mockAccepted as any]);
    expect(ical).toContain("Bob Buyer");
  });

  it("returns empty calendar (no VEVENTs) for an empty array", () => {
    const ical = generateIcal([]);
    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).not.toContain("VEVENT");
  });
});

// ─── 10.4.3 Post-showing feedback ─────────────────────────────────────────────

describe("ShowingInbox — post-showing feedback (10.4.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(showingFeedbackService.getByShowing).mockReturnValue(null);
  });

  it("shows a 'Request Feedback' button for accepted showings", () => {
    renderInbox([mockAccepted]);
    expect(screen.getByRole("button", { name: /request feedback/i })).toBeInTheDocument();
  });

  it("clicking 'Request Feedback' calls showingFeedbackService.sendRequest", async () => {
    renderInbox([mockAccepted]);
    fireEvent.click(screen.getByRole("button", { name: /request feedback/i }));
    await waitFor(() => {
      expect(showingFeedbackService.sendRequest).toHaveBeenCalledWith("sr-2");
    });
  });

  it("shows 'Feedback Requested' after clicking the button", async () => {
    renderInbox([mockAccepted]);
    fireEvent.click(screen.getByRole("button", { name: /request feedback/i }));
    await waitFor(() => {
      expect(screen.getByText(/feedback requested/i)).toBeInTheDocument();
    });
  });

  it("shows feedback response text when a response has been submitted", () => {
    vi.mocked(showingFeedbackService.getByShowing).mockReturnValue({
      ...mockFeedbackRequest,
      response: "Great place!",
    } as any);
    renderInbox([mockAccepted]);
    expect(screen.getByText(/great place!/i)).toBeInTheDocument();
  });

  it("does not show 'Request Feedback' for pending or declined showings", () => {
    renderInbox([mockPending]);
    expect(screen.queryByRole("button", { name: /request feedback/i })).not.toBeInTheDocument();
  });
});

// ─── 10.4.4 Buyer Q&A via HomeGentic report ─────────────────────────────────────

describe("ReportQAPanel — buyer Q&A (10.4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a 'Questions & Answers' section heading", () => {
    renderQAPanel();
    expect(screen.getByText(/questions.*answers/i)).toBeInTheDocument();
  });

  it("shows a question input and submit button for buyers", () => {
    renderQAPanel();
    expect(screen.getByLabelText(/your question/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
  });

  it("submitting a question calls reportQAService.ask with propertyId and question", async () => {
    vi.mocked(reportQAService.ask).mockResolvedValue(mockQA as any);
    renderQAPanel();
    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: "Is the roof newer than 10 years?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => {
      expect(reportQAService.ask).toHaveBeenCalledWith(
        "prop-1",
        "Is the roof newer than 10 years?"
      );
    });
  });

  it("clears the input after successful submission", async () => {
    vi.mocked(reportQAService.ask).mockResolvedValue(mockQA as any);
    renderQAPanel();
    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: "Is the roof newer than 10 years?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => {
      expect((screen.getByLabelText(/your question/i) as HTMLInputElement).value).toBe("");
    });
  });

  it("displays existing questions from reportQAService.getByProperty", () => {
    renderQAPanel();
    expect(screen.getByText(/is the roof newer than 10 years/i)).toBeInTheDocument();
  });

  it("shows 'No answer yet' for questions without an answer", () => {
    renderQAPanel();
    expect(screen.getByText(/no answer yet/i)).toBeInTheDocument();
  });

  it("does not show the question form in seller view", () => {
    renderQAPanelSeller();
    expect(screen.queryByLabelText(/your question/i)).not.toBeInTheDocument();
  });

  it("shows all questions in seller view for review", () => {
    renderQAPanelSeller();
    expect(screen.getByText(/is the roof newer than 10 years/i)).toBeInTheDocument();
  });
});
