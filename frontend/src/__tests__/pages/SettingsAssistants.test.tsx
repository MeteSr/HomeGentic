/**
 * SettingsPage — "AI assistants" tab: how to use HomeGentic from ChatGPT or
 * Claude through the ICP MCP connector (docs/AI_CONNECTORS.md).
 *
 *  SAI.1 the tab is hidden until the connector flag is on
 *  SAI.2 ?tab=assistants opens it, with setup steps for both apps, the
 *        consent choice, and how to revoke
 *  SAI.3 each sample prompt has prefilled Ask in ChatGPT / Claude links
 *  SAI.4 "I've connected it" is remembered in this browser
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { role, mockToastError, report, contractor } = vi.hoisted(() => ({
  role: { current: "Homeowner" },
  mockToastError: vi.fn(),
  report: {
    getAllowPublicReports: vi.fn(),
    setAllowPublicReports: vi.fn(),
  },
  contractor: {
    getMyProfile: vi.fn(),
    getMyProfilePrivacy: vi.fn(),
    setProfilePrivacy: vi.fn(),
  },
}));

vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return { ...actual, reportService: report };
});

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return { ...actual, contractorService: contractor };
});

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
      getMySubscription: vi.fn(() => Promise.resolve({ tier: "Free", expiresAt: null })),
      getPauseState: vi.fn().mockReturnValue(null),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    principal: "test-principal",
    profile: { name: "Test User", role: role.current, email: "test@example.com" },
    isLoading: false,
    tier: null,
    setTier: vi.fn(),
    setProfile: vi.fn(),
  })),
}));

vi.mock("@/store/propertyStore", () => ({ usePropertyStore: vi.fn(() => ({ properties: [] })) }));
vi.mock("@/store/jobStore", () => ({ useJobStore: vi.fn(() => ({ jobs: [] })) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: mockToastError } }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/DeleteAccountSection", () => ({ DeleteAccountSection: () => null }));

import SettingsPage from "@/pages/SettingsPage";

import { askUrl, SAMPLE_PROMPTS, MCP_URL, CHATGPT_APP_NAME, isConnectorConnected } from "@/services/aiConnectors";

const renderAt = (tab: string) =>
  render(
    <MemoryRouter initialEntries={[`/settings?tab=${tab}`]}>
      <SettingsPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  role.current = "Homeowner";
  report.getAllowPublicReports.mockResolvedValue(true);
  localStorage.clear();
});
afterEach(() => {
  delete (window as any).__e2e_ai_connectors;
});

describe("AI assistants tab", () => {
  it("SAI.1 is hidden while the connector flag is off", () => {
    renderAt("assistants");
    expect(screen.queryByRole("button", { name: "AI assistants" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Use HomeGentic in ChatGPT or Claude/i })).toBeNull();
  });

  it("SAI.2 opens from ?tab=assistants with setup steps, consent choice and revoke", () => {
    (window as any).__e2e_ai_connectors = true;
    renderAt("assistants");
    expect(screen.getByRole("button", { name: "AI assistants" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Use HomeGentic in ChatGPT or Claude/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CHATGPT_APP_NAME))).toBeInTheDocument();
    expect(screen.getByText(MCP_URL)).toBeInTheDocument();
    expect(screen.getAllByText(/Questions only/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Actions & questions/).length).toBeGreaterThan(0);
    expect(screen.getByText(/disconnect at any time in Internet Identity/)).toBeInTheDocument();
  });

  it("SAI.3 each sample prompt links to ChatGPT and Claude with the prompt filled in", () => {
    (window as any).__e2e_ai_connectors = true;
    renderAt("assistants");
    const gpt = screen.getAllByRole("link", { name: /Ask in ChatGPT/ });
    const claude = screen.getAllByRole("link", { name: /Ask in Claude/ });
    expect(gpt).toHaveLength(SAMPLE_PROMPTS.length);
    expect(claude).toHaveLength(SAMPLE_PROMPTS.length);
    expect(gpt[0]).toHaveAttribute("href", askUrl("chatgpt", SAMPLE_PROMPTS[0]));
    expect(claude[0]).toHaveAttribute("href", askUrl("claude", SAMPLE_PROMPTS[0]));
    expect(gpt[0]).toHaveAttribute("target", "_blank");
    expect(gpt[0].getAttribute("rel")).toMatch(/noopener/);
  });

  it("SAI.4 remembers that the user connected it", () => {
    (window as any).__e2e_ai_connectors = true;
    renderAt("assistants");
    const box = screen.getByRole("checkbox", { name: /I've connected it/i });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(isConnectorConnected()).toBe(true);
  });
});
