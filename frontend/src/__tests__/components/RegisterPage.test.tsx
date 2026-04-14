/**
 * RegisterPage
 *
 * Tests:
 *   Step 1 — role selection
 *     - renders all three role cards
 *     - Continue button is disabled until a role is selected
 *     - Continue button advances to step 2
 *
 *   Step 2 — details / validation
 *     - renders email and phone fields
 *     - shows email error on blur with invalid email
 *     - clears email error when user edits the field
 *     - Review button disabled when email is invalid
 *     - Review button disabled when phone is invalid
 *     - Review button re-enables once invalid email is corrected
 *     - Review button advances with valid inputs
 *     - Review button advances when both fields are empty (optional)
 *
 *   Step 3 — confirm
 *     - shows the selected role, email, and phone
 *     - shows "Not provided" for empty optional fields
 *     - calls authService.register on Create Account
 *     - navigates to /onboarding after successful Homeowner registration
 *     - navigates to /contractor-dashboard after successful Contractor registration
 *     - shows toast error on registration failure
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/auth", () => ({
  authService: {
    register: vi.fn(),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ setProfile: vi.fn() }),
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

const MOCK_PROFILE = {
  principal: "local-dev", role: "Homeowner" as const,
  email: "test@example.com", phone: "5125550100",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true, lastLoggedIn: null,
};

function renderPage() {
  return render(<MemoryRouter><RegisterPage /></MemoryRouter>);
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

describe("RegisterPage — step 1: role selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all three role cards", () => {
    renderPage();
    expect(screen.getByText("Homeowner")).toBeInTheDocument();
    expect(screen.getByText("Contractor")).toBeInTheDocument();
    expect(screen.getByText("Realtor")).toBeInTheDocument();
  });

  it("Continue button is disabled until a role is selected", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button becomes enabled after selecting a role", () => {
    renderPage();
    fireEvent.click(screen.getByText("Homeowner"));
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("advances to step 2 after selecting a role and clicking Continue", () => {
    renderPage();
    fireEvent.click(screen.getByText("Homeowner"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/your details/i)).toBeInTheDocument();
  });
});

// ── Step 2 ────────────────────────────────────────────────────────────────────

function goToStep2() {
  renderPage();
  fireEvent.click(screen.getByText("Homeowner"));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
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

  it("Review button is disabled when email is invalid", () => {
    goToStep2();
    fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), {
      target: { value: "not-an-email" },
    });
    expect(screen.getByRole("button", { name: /review/i })).toBeDisabled();
  });

  it("Review button is disabled when phone is invalid", () => {
    goToStep2();
    fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), {
      target: { value: "abc" },
    });
    expect(screen.getByRole("button", { name: /review/i })).toBeDisabled();
  });

  it("Review button re-enables once an invalid email is corrected", () => {
    goToStep2();
    const emailInput = screen.getByPlaceholderText(/you@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    expect(screen.getByRole("button", { name: /review/i })).toBeDisabled();
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    expect(screen.getByRole("button", { name: /review/i })).not.toBeDisabled();
  });

  it("Review button advances with valid email and phone", () => {
    goToStep2();
    fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), {
      target: { value: "5125550100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    expect(screen.getByRole("heading", { name: /confirm/i })).toBeInTheDocument();
  });

  it("Review button is disabled when email is empty", () => {
    goToStep2();
    // Email is required — button must be disabled with no input
    expect(screen.getByRole("button", { name: /review/i })).toBeDisabled();
  });
});

// ── Step 3 ────────────────────────────────────────────────────────────────────

function goToStep3(email = "test@example.com", phone = "5125550100") {
  renderPage();
  fireEvent.click(screen.getByText("Homeowner"));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  if (email) fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), { target: { value: email } });
  if (phone) fireEvent.change(screen.getByPlaceholderText(/\+1.*555/i), { target: { value: phone } });
  fireEvent.click(screen.getByRole("button", { name: /review/i }));
  // Must agree to terms before Create Account is enabled
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("RegisterPage — step 3: confirm & submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the selected role and contact details", () => {
    goToStep3();
    expect(screen.getByText("Homeowner")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("5125550100")).toBeInTheDocument();
  });

  it("shows 'Not provided' for empty optional phone field", () => {
    goToStep3("test@example.com", "");
    expect(screen.getAllByText("Not provided").length).toBe(1);
  });

  it("calls authService.register on Create Account", async () => {
    vi.mocked(authService.register).mockResolvedValue(MOCK_PROFILE);
    goToStep3();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(authService.register).toHaveBeenCalledWith({
      role: "Homeowner",
      email: "test@example.com",
      phone: "5125550100",
    }));
  });

  it("navigates to /onboarding after Homeowner registration", async () => {
    vi.mocked(authService.register).mockResolvedValue(MOCK_PROFILE);
    goToStep3();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/onboarding"));
  });

  it("navigates to /contractor-dashboard after Contractor registration", async () => {
    vi.mocked(authService.register).mockResolvedValue({ ...MOCK_PROFILE, role: "Contractor" });
    renderPage();
    fireEvent.click(screen.getByText("Contractor"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example\.com/i), { target: { value: "contractor@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard"));
  });

  it("shows toast error when registration fails", async () => {
    vi.mocked(authService.register).mockRejectedValue(new Error("AlreadyExists"));
    goToStep3();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("AlreadyExists"));
  });
});
