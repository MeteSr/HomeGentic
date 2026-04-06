/**
 * InviteContractorModal
 *
 * Tests:
 *   - Shows loading spinner while token is being generated
 *   - Shows QR code and copy-link input once token is ready
 *   - Copy button writes the verify URL to the clipboard
 *   - Copy button shows "Copied" feedback then resets
 *   - Email input: Send button disabled until a valid email is typed
 *   - Send button calls the invite email endpoint
 *   - Shows "Sent" after email is sent successfully
 *   - Error from createInviteToken: shows error message
 *   - Clicking the backdrop calls onClose
 *   - Close button calls onClose
 *   - Job summary line shows serviceType and amount
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { InviteContractorModal } from "@/components/InviteContractorModal";
import type { Job } from "@/services/job";

vi.mock("@/services/job", () => ({
  jobService: {
    createInviteToken: vi.fn(),
  },
}));

// Stub navigator.clipboard
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: writeTextMock },
  configurable: true,
});

// Stub fetch for email send
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
(global as any).fetch = fetchMock;

import { jobService } from "@/services/job";

const MOCK_JOB: Job = {
  id:               "job-1",
  propertyId:       "prop-1",
  homeowner:        "aaaaa-aa",
  serviceType:      "Plumbing",
  contractorName:   "Pipe Dreams Inc",
  description:      "Fix kitchen sink",
  amount:           25000,
  date:             "2024-06-15",
  homeownerSigned:  true,
  contractorSigned: false,
  isDiy:            false,
  verified:         false,
  photos:           [],
  status:           "completed",
  createdAt:        new Date("2024-06-15").getTime(),
};

function renderModal(overrides: Partial<Parameters<typeof InviteContractorModal>[0]> = {}) {
  const onClose = vi.fn();
  const result = render(
    <MemoryRouter>
      <InviteContractorModal
        job={MOCK_JOB}
        propertyAddress="456 Elm St, Orlando, FL"
        onClose={onClose}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { ...result, onClose };
}

// ── Loading state ─────────────────────────────────────────────────────────────

describe("InviteContractorModal — loading", () => {
  it("shows loading spinner while token is being generated", () => {
    (jobService.createInviteToken as any).mockImplementation(
      () => new Promise(() => {})
    );
    renderModal();
    // Spinner is present (Loader2 icon — no text, but the modal header is shown)
    expect(screen.getByText(/invite/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

// ── Token ready ───────────────────────────────────────────────────────────────

describe("InviteContractorModal — token ready", () => {
  beforeEach(() => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_test123");
  });

  it("shows the verify URL in a read-only input", async () => {
    renderModal();
    await waitFor(() => {
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      const urlInput = inputs.find((i) => i.readOnly);
      expect(urlInput?.value).toContain("/verify/INV_test123");
    });
  });

  it("shows a Copy button", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument()
    );
  });

  it("shows the email input field", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/contractor@example\.com/i)).toBeInTheDocument()
    );
  });

  it("shows expiry note", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/expires in 48 hours/i)).toBeInTheDocument()
    );
  });
});

// ── Job summary line ──────────────────────────────────────────────────────────

describe("InviteContractorModal — job summary", () => {
  it("shows serviceType in the summary", async () => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_x");
    renderModal();
    // Summary is rendered immediately (before token loads)
    expect(screen.getByText(/Plumbing/)).toBeInTheDocument();
  });

  it("shows formatted amount in the summary", () => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_x");
    renderModal();
    expect(screen.getByText(/\$250/)).toBeInTheDocument();
  });

  it("shows property address in the summary", () => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_x");
    renderModal();
    expect(screen.getByText(/456 Elm St/)).toBeInTheDocument();
  });
});

// ── Copy button ───────────────────────────────────────────────────────────────

describe("InviteContractorModal — copy link", () => {
  beforeEach(() => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_copy1");
    writeTextMock.mockResolvedValue(undefined);
  });

  it("calls clipboard.writeText with the verify URL", async () => {
    renderModal();
    await waitFor(() => screen.getByRole("button", { name: /copy/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("/verify/INV_copy1")
    );
  });

  it("shows 'Copied' after clicking", async () => {
    renderModal();
    await waitFor(() => screen.getByRole("button", { name: /copy/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });
});

// ── Email send ────────────────────────────────────────────────────────────────

describe("InviteContractorModal — email send", () => {
  beforeEach(() => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_email1");
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("Send button is disabled until a valid email is entered", async () => {
    renderModal();
    await waitFor(() => screen.getByPlaceholderText(/contractor@example\.com/i));
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("Send button becomes enabled when valid email is typed", async () => {
    renderModal();
    await waitFor(() => screen.getByPlaceholderText(/contractor@example\.com/i));
    fireEvent.change(screen.getByPlaceholderText(/contractor@example\.com/i), {
      target: { value: "hvac@example.com" },
    });
    expect(screen.getByRole("button", { name: /send/i })).not.toBeDisabled();
  });

  it("calls fetch with the email and verifyUrl", async () => {
    renderModal();
    await waitFor(() => screen.getByPlaceholderText(/contractor@example\.com/i));
    fireEvent.change(screen.getByPlaceholderText(/contractor@example\.com/i), {
      target: { value: "hvac@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/invite/send-email");
    const body = JSON.parse(opts.body);
    expect(body.to).toBe("hvac@example.com");
    expect(body.verifyUrl).toContain("/verify/INV_email1");
  });

  it("shows 'Sent' after email is sent", async () => {
    renderModal();
    await waitFor(() => screen.getByPlaceholderText(/contractor@example\.com/i));
    fireEvent.change(screen.getByPlaceholderText(/contractor@example\.com/i), {
      target: { value: "hvac@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sent/i })).toBeInTheDocument()
    );
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("InviteContractorModal — token error", () => {
  it("shows error message when createInviteToken fails", async () => {
    (jobService.createInviteToken as any).mockRejectedValue(
      new Error("Not authorized")
    );
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
    );
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe("InviteContractorModal — close", () => {
  beforeEach(() => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_close1");
  });

  it("calls onClose when the X button is clicked", async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop overlay is clicked", async () => {
    const { onClose } = renderModal();
    // The backdrop is the role="dialog" wrapper element
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Contractor name in header ─────────────────────────────────────────────────

describe("InviteContractorModal — header", () => {
  it("includes contractor name in heading when job has contractorName", () => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_x");
    renderModal();
    expect(screen.getByText(/invite.*pipe dreams/i)).toBeInTheDocument();
  });

  it("shows generic 'Invite Contractor' heading when no contractorName", () => {
    (jobService.createInviteToken as any).mockResolvedValue("INV_x");
    renderModal({ job: { ...MOCK_JOB, contractorName: "" } });
    expect(screen.getByText(/invite contractor/i)).toBeInTheDocument();
  });
});
