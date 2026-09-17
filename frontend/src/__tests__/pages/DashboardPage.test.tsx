/**
 * DashboardPage — was untested despite real branching logic:
 *   - mobile vs desktop layout switch
 *   - auto-opens the add-property wizard exactly once for a new user with
 *     no properties and incomplete onboarding
 */

import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DashboardPage from "@/pages/DashboardPage";

const { mockBreakpoint, mockOpen, mockPropertySummary } = vi.hoisted(() => ({
  mockBreakpoint: { isMobile: false },
  mockOpen: vi.fn(),
  mockPropertySummary: { properties: [] as any[], loading: false },
}));

vi.mock("@/hooks/useBreakpoint", () => ({
  useBreakpoint: () => mockBreakpoint,
}));

vi.mock("@/hooks/usePropertySummary", () => ({
  usePropertySummary: () => mockPropertySummary,
}));

vi.mock("@/store/addPropertyStore", () => ({
  useAddPropertyStore: () => ({ open: mockOpen }),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({ profile: mockProfile.value })),
}));

const mockProfile = vi.hoisted(() => ({
  value: { onboardingComplete: true } as any,
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/pages/MobileHomeDashboard", () => ({
  MobileHomeDashboard: () => <div data-testid="mobile-dashboard" />,
}));

vi.mock("@/components/dashboardV3/DashboardV3", () => ({
  DashboardV3: () => <div data-testid="desktop-dashboard" />,
}));

describe("DashboardPage — layout switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreakpoint.isMobile = false;
    mockPropertySummary.properties = [];
    mockPropertySummary.loading = false;
    mockProfile.value = { onboardingComplete: true };
  });

  it("renders the desktop DashboardV3 when not mobile", () => {
    const { getByTestId, queryByTestId } = render(<DashboardPage />);
    expect(getByTestId("desktop-dashboard")).toBeInTheDocument();
    expect(queryByTestId("mobile-dashboard")).not.toBeInTheDocument();
  });

  it("renders MobileHomeDashboard when isMobile is true", () => {
    mockBreakpoint.isMobile = true;
    const { getByTestId, queryByTestId } = render(<DashboardPage />);
    expect(getByTestId("mobile-dashboard")).toBeInTheDocument();
    expect(queryByTestId("desktop-dashboard")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — auto-open add-property wizard for new users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreakpoint.isMobile = false;
    mockPropertySummary.properties = [];
    mockPropertySummary.loading = false;
  });

  it("opens the wizard when onboarding is incomplete and there are no properties", () => {
    mockProfile.value = { onboardingComplete: false };
    render(<DashboardPage />);
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the wizard while property data is still loading", () => {
    mockProfile.value = { onboardingComplete: false };
    mockPropertySummary.loading = true;
    render(<DashboardPage />);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("does not open the wizard when onboarding is already complete", () => {
    mockProfile.value = { onboardingComplete: true };
    render(<DashboardPage />);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("does not open the wizard when the user already has properties", () => {
    mockProfile.value = { onboardingComplete: false };
    mockPropertySummary.properties = [{ id: "prop-1" }];
    render(<DashboardPage />);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("does not open the wizard when there is no profile yet", () => {
    mockProfile.value = null;
    render(<DashboardPage />);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
