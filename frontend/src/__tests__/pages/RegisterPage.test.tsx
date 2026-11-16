/**
 * RegisterPage — real logic worth locking down:
 *   - two steps: role, then details (no separate confirm screen)
 *   - step 1: roles are radio buttons (keyboard and screen-reader
 *     friendly); Continue is disabled until one is chosen, and the role
 *     the visitor signed up from (sessionStorage "signupRole") is chosen
 *     for them
 *   - step 2: Create Account is disabled until a valid email is entered
 *     (and, if a phone is entered, it must be valid too) and the terms
 *     checkbox is checked
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

function goToStep2(role: "Homeowner" | "Contractor" = "Homeowner") {
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(role) }));
  fireEvent.click(screen.getByText("Continue"));
}

function fillDetails(email = "buyer@example.com") {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("RegisterPage — step 1: role", () => {
  it("disables Continue until a role is selected", () => {
    renderPage();
    expect(screen.getByText("Continue").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Homeowner/ }));
    expect(screen.getByText("Continue").closest("button")).not.toBeDisabled();
  });

  it("offers the roles as one radio group", () => {
    renderPage();
    const group = screen.getByRole("radiogroup", { name: /I am a/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("chooses the role the visitor signed up from", () => {
    sessionStorage.setItem("signupRole", "Contractor");
    renderPage();
    expect(screen.getByRole("radio", { name: /Contractor/ })).toBeChecked();
    expect(screen.getByText("Continue").closest("button")).not.toBeDisabled();
  });

  it("ignores a signup role it doesn't know", () => {
    sessionStorage.setItem("signupRole", "Admin");
    renderPage();
    expect(screen.getByText("Continue").closest("button")).toBeDisabled();
  });

  it("shows two steps", () => {
    renderPage();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText(/Confirm/)).not.toBeInTheDocument();
  });
});

describe("RegisterPage — step 2: details", () => {
  it("disables Create Account until a valid email is entered and the terms are agreed", () => {
    renderPage();
    goToStep2();
    const create = () => screen.getByText("Create Account").closest("button");
    expect(create()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(create()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "buyer@example.com" } });
    expect(create()).not.toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(create()).toBeDisabled();
  });

  it("disables Create Account when an invalid phone is entered, even with a valid email", () => {
    renderPage();
    goToStep2();
    fillDetails();
    fireEvent.change(screen.getByPlaceholderText("+1 (555) 000-0000"), { target: { value: "123" } });

    expect(screen.getByText("Create Account").closest("button")).toBeDisabled();
  });

  it("registers and navigates to /dashboard", async () => {
    mockRegister.mockResolvedValue({ role: "Homeowner", email: "buyer@example.com" });
    sessionStorage.setItem("signupRole", "Homeowner");
    renderPage();
    goToStep2();
    fillDetails();
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ role: "Homeowner", email: "buyer@example.com", phone: "" }));
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    expect(sessionStorage.getItem("signupRole")).toBeNull();
  });

  it("returns to the gift or invite page the new user signed in from", async () => {
    mockRegister.mockResolvedValue({ role: "Homeowner", email: "buyer@example.com" });
    sessionStorage.setItem("pendingVerification", "/manage/claim/tok-1");
    renderPage();
    goToStep2();
    fillDetails();
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/manage/claim/tok-1"));
    expect(sessionStorage.getItem("pendingVerification")).toBeNull();
  });

  it("redirects to checkout when a pending checkout intent exists and the role isn't Contractor", async () => {
    mockRegister.mockResolvedValue({ role: "Homeowner", email: "buyer@example.com" });
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Pro", billing: "Yearly" }));
    renderPage();
    goToStep2();
    fillDetails();
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Yearly"));
    expect(sessionStorage.getItem("pendingCheckout")).toBeNull();
  });

  it("ignores a pending checkout intent for a Contractor and goes to the contractor dashboard", async () => {
    mockRegister.mockResolvedValue({ role: "Contractor", email: "pro@example.com" });
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Pro", billing: "Yearly" }));
    renderPage();
    goToStep2("Contractor");
    fillDetails("pro@example.com");
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard"));
  });

  it("shows an error toast when registration fails", async () => {
    mockRegister.mockRejectedValue(new Error("This email is already taken."));
    renderPage();
    goToStep2();
    fillDetails();
    fireEvent.click(screen.getByText("Create Account"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("This email is already taken."));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
