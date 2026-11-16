/**
 * RegisterPage
 *
 * Tests:
 *   Step 1 — role selection
 *     - renders all three role cards
 *     - Continue button is disabled until a role is selected
 *     - Continue button advances to step 2
 *
 *   Step 2 — details, terms and submit (there is no separate confirm step)
 *     - renders email and phone fields
 *     - shows email error on blur with invalid email
 *     - clears email error when user edits the field
 *     - Create Account disabled until the email is valid, the phone (if any) is valid and the terms are agreed
 *     - calls authService.register on Create Account
 *     - navigates to /dashboard after successful Homeowner registration
 *     - navigates to /contractor-dashboard after successful Contractor registration
 *     - shows toast error on registration failure
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/auth", () => ({
  authService: {
    register: vi.fn(),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ setProfile: vi.fn(), tier: null, setTier: vi.fn() }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import RegisterPage from "@/pages/RegisterPage";
import { authService } from "@/services/auth";
import toast from "react-hot-toast";
import { CanisterError } from "@homegentic/shared/canisterError";

const MOCK_PROFILE = {
  principal: "local-dev", role: "Homeowner" as const,
  email: "test@example.com", phone: "5125550100",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true, lastLoggedIn: null,
  onboardingComplete: false,
};

function renderPage() {
  return render(<MemoryRouter><RegisterPage /></MemoryRouter>);
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

describe("RegisterPage — step 1: role selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all three roles as radio buttons", () => {
    renderPage();
    for (const r of ["Homeowner", "Contractor", "Realtor"]) {
      expect(screen.getByRole("radio", { name: new RegExp(r) })).toBeInTheDocument();
    }
  });

  it("Continue button is disabled until a role is selected", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button becomes enabled after selecting a role", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /Homeowner/ }));
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("advances to step 2 after selecting a role and clicking Continue", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /Homeowner/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/your details/i)).toBeInTheDocument();
  });
});

// ── Step 2 ────────────────────────────────────────────────────────────────────

function goToStep2(role: "Homeowner" | "Contractor" = "Homeowner") {
  renderPage();
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(role) }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

const createButton = () => screen.getByRole("button", { name: /create account/i });

function fillAndAgree(email = "test@example.com", phone = "5125550100") {
  if (email) fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), { target: { value: email } });
  if (phone) fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), { target: { value: phone } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("RegisterPage — step 2: details & validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders email and phone fields", () => {
    goToStep2();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/\+1.*555/i)).toBeInTheDocument();
  });

  it("shows email error on blur with an invalid email", () => {
    goToStep2();
    const emailInput = screen.getByPlaceholderText(/you@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.blur(emailInput);
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it("clears email error when the user starts editing again", () => {
    goToStep2();
    const emailInput = screen.getByPlaceholderText(/you@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "bad" } });
    fireEvent.blur(emailInput);
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    fireEvent.change(emailInput, { target: { value: "b" } });
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it("Create Account is disabled with no email, a bad email, a bad phone or without the terms", () => {
    goToStep2();
    expect(createButton()).toBeDisabled();
    fillAndAgree("not-an-email", "");
    expect(createButton()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), { target: { value: "test@example.com" } });
    expect(createButton()).not.toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), { target: { value: "abc" } });
    expect(createButton()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(createButton()).toBeDisabled();
  });
});

describe("RegisterPage — submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls authService.register on Create Account", async () => {
    vi.mocked(authService.register).mockResolvedValue(MOCK_PROFILE);
    goToStep2();
    fillAndAgree();
    fireEvent.click(createButton());
    await waitFor(() => expect(authService.register).toHaveBeenCalledWith({
      role: "Homeowner",
      email: "test@example.com",
      phone: "5125550100",
    }));
  });

  it("navigates to /dashboard after Homeowner registration", async () => {
    vi.mocked(authService.register).mockResolvedValue(MOCK_PROFILE);
    goToStep2();
    fillAndAgree();
    fireEvent.click(createButton());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("navigates to /contractor-dashboard after Contractor registration", async () => {
    vi.mocked(authService.register).mockResolvedValue({ ...MOCK_PROFILE, role: "Contractor" });
    goToStep2("Contractor");
    fillAndAgree("contractor@example.com", "");
    fireEvent.click(createButton());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard"));
  });

  it("shows toast error when registration fails", async () => {
    vi.mocked(authService.register).mockRejectedValue(new CanisterError("AlreadyExists"));
    goToStep2();
    fillAndAgree();
    fireEvent.click(createButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That already exists."));
  });

  it("never shows a raw error tag or agent text", async () => {
    vi.mocked(authService.register).mockRejectedValue(new Error("Call failed: Reject code 5, canister trapped"));
    goToStep2();
    fillAndAgree();
    fireEvent.click(createButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Registration failed"));
  });
});
