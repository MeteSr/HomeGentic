/**
 * LoginPage — mostly presentational, but has real logic worth locking down:
 *   - ?role= query param swaps the heading/sub copy (or falls back to generic)
 *   - login button reflects isLoading state and calls useAuth().login
 *   - "Get Started" / "Try the demo first" navigate correctly
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockLogin, mockDevLogin, mockAuthState } = vi.hoisted(() => ({
  mockLogin:    vi.fn(),
  mockDevLogin: vi.fn(),
  mockAuthState: { isLoading: false },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, devLogin: mockDevLogin }),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => mockAuthState,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage — role-based heading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isLoading = false;
  });

  it("shows the generic heading with no role param", () => {
    renderAt("/login");
    expect(screen.getByText("Log in to your account")).toBeInTheDocument();
  });

  it("shows the homeowner heading for ?role=homeowner", () => {
    renderAt("/login?role=homeowner");
    expect(screen.getByText("Welcome, homeowner")).toBeInTheDocument();
    expect(screen.getByText(/manage your property records/i)).toBeInTheDocument();
  });

  it("shows the contractor heading for ?role=contractor", () => {
    renderAt("/login?role=contractor");
    expect(screen.getByText("Welcome, contractor")).toBeInTheDocument();
  });

  it("shows the realtor heading for ?role=realtor", () => {
    renderAt("/login?role=realtor");
    expect(screen.getByText("Welcome, realtor")).toBeInTheDocument();
  });

  it("falls back to the generic heading for an unrecognised role", () => {
    renderAt("/login?role=astronaut");
    expect(screen.getByText("Log in to your account")).toBeInTheDocument();
  });
});

describe("LoginPage — sign-in button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isLoading = false;
  });

  it("calls login() when clicked", () => {
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: /sign in with internet identity/i }));
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it("shows 'Connecting…' and is disabled while isLoading", () => {
    mockAuthState.isLoading = true;
    renderAt("/login");
    const button = screen.getByRole("button", { name: /connecting/i });
    expect(button).toBeDisabled();
  });

  it("shows the normal label and is enabled when not loading", () => {
    renderAt("/login");
    const button = screen.getByRole("button", { name: /sign in with internet identity/i });
    expect(button).not.toBeDisabled();
  });
});

describe("LoginPage — secondary navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isLoading = false;
  });

  it("navigates to /register on 'Get Started'", () => {
    renderAt("/login");
    fireEvent.click(screen.getByText("Get Started"));
    expect(mockNavigate).toHaveBeenCalledWith("/register");
  });

  it("navigates to /demo on 'Try the demo first'", () => {
    renderAt("/login");
    fireEvent.click(screen.getByText(/try the demo first/i));
    expect(mockNavigate).toHaveBeenCalledWith("/demo");
  });
});
