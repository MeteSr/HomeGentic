/**
 * RegisterPage — real logic worth locking down:
 *   - step 1: Continue is disabled until a role is selected
 *   - step 2: Review is disabled until a valid email is entered (and,
 *     if a phone is entered, it must be valid too)
 *   - step 3: Create Account is disabled until the terms checkbox is
 *     checked
 *   - a successful submit registers, consumes a pending referral code
 *     if one exists, and navigates based on role and a pending
 *     checkout intent in sessionStorage
 *   - a failed submit shows an error toast
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RegisterPage from "@/pages/RegisterPage";

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));
vi.mock("@/services/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/auth")>();
  return { ...actual, authService: { register: mockRegister } };
});

const { mockGetPendingRefCode, mockClearPendingRefCode, mockUseReferralCode } = vi.hoisted(() => ({
  mockGetPendingRefCode: vi.fn(),
  mockClearPendingRefCode: vi.fn(),
  mockUseReferralCode: vi.fn(),
}));
vi.mock("@/services/neighborReferral", () => ({
  neighborReferralService: {
    getPendingRefCode: mockGetPendingRefCode,
    clearPendingRefCode: mockClearPendingRefCode,
    useReferralCode: mockUseReferralCode,
  },
}));

const mockSetProfile = vi.fn();
vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ setProfile: mockSetProfile }),
}));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: mockToastSuccess } }));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(<MemoryRouter><RegisterPage /></MemoryRouter>);
}

function goToStep2() {
  fireEvent.click(screen.getByText("Homeowner"));
  fireEvent.click(screen.getByText("Continue"));
}

function goToStep3(email = "buyer@example.com") {
  goToStep2();
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByText("Review"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPendingRefCode.mockReturnValue(null);
  sessionStorage.clear();
});

describe("RegisterPage — step 1: role", () => {
  it("disables Continue until a role is selected", () => {
    renderPage();
    expect(screen.getByText("Continue").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByText("Homeowner"));
    expect(screen.getByText("Continue").closest("button")).not.toBeDisabled();
  });
});

describe("RegisterPage — step 2: details", () => {
  it("disables Review until a valid email is entered", () => {
    renderPage();
    goToStep2();
    expect(screen.getByText("Review").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "not-an-email" } });
    expect(screen.getByText("Review").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "buyer@example.com" } });
    expect(screen.getByText("Review").closest("button")).not.toBeDisabled();
  });

  it("disables Review when an invalid phone is entered, even with a valid email", () => {
    renderPage();
    goToStep2();
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("+1 (555) 000-0000"), { target: { value: "123" } });

    expect(screen.getByText("Review").closest("button")).toBeDisabled();
  });
});

describe("RegisterPage — step 3: confirm", () => {
  it("disables Create Account until terms are agreed", () => {
    renderPage();
    goToStep3();
    expect(screen.getByText("Create Account").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Create Account").closest("button")).not.toBeDisabled();
  });

  it("registers, consumes a pending referral code, and navigates to /dashboard", async () => {
    mockRegister.mockResolvedValue({ role: "Homeowner", email: "buyer@example.com" });
    mockGetPendingRefCode.mockReturnValue("REF123");
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ role: "Homeowner", email: "buyer@example.com", phone: "" }));
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockClearPendingRefCode).toHaveBeenCalled();
    expect(mockUseReferralCode).toHaveBeenCalledWith("REF123");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to checkout when a pending checkout intent exists and the role isn't Contractor", async () => {
    mockRegister.mockResolvedValue({ role: "Homeowner", email: "buyer@example.com" });
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Pro", billing: "Yearly" }));
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Yearly"));
    expect(sessionStorage.getItem("pendingCheckout")).toBeNull();
  });

  it("ignores a pending checkout intent for a Contractor and goes to the contractor dashboard", async () => {
    mockRegister.mockResolvedValue({ role: "Contractor", email: "pro@example.com" });
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Pro", billing: "Yearly" }));
    renderPage();
    fireEvent.click(screen.getByText("Contractor"));
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "pro@example.com" } });
    fireEvent.click(screen.getByText("Review"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard"));
  });

  it("shows an error toast when registration fails", async () => {
    mockRegister.mockRejectedValue(new Error("This email is already taken."));
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("This email is already taken."));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
