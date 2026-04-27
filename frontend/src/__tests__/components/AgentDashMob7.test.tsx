/**
 * MOB.7 — AgentDashboardPage + AgentMarketplacePage mobile audit
 */
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

// Prevents VoiceAgent / AuthContext / @icp-sdk/auth → IndexedDB dependency
// chain that causes act() to hang when multiple pages share one module registry.
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

// ── matchMedia mock ───────────────────────────────────────────────────────────
let currentWidth = 1280;
function mockMatchMedia(width: number) {
  currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    writable: true, configurable: true,
    value: (query: string) => {
      const maxMatch = query.match(/max-width:\s*(\d+)px/);
      const matches  = maxMatch ? currentWidth <= parseInt(maxMatch[1], 10) : false;
      return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    },
  });
}

let AgentDashboardPage: React.ComponentType;
let AgentMarketplacePage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  AgentDashboardPage   = (await import("@/pages/AgentDashboardPage")).default;
  AgentMarketplacePage = (await import("@/pages/AgentMarketplacePage")).default;
});

async function renderAgentDash(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/agent-dashboard"]}>
        <Routes><Route path="/agent-dashboard" element={<AgentDashboardPage />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
}

async function renderMarketplace(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/agent-marketplace"]}>
        <Routes><Route path="/agent-marketplace" element={<AgentMarketplacePage />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Renders without crashing ──────────────────────────────────────────────────

describe("AgentDashboardPage — renders on both viewports", () => {
  it("renders on desktop", async () => {
    const { container } = await renderAgentDash(1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders on mobile", async () => {
    const { container } = await renderAgentDash(390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── KPI row ───────────────────────────────────────────────────────────────────

describe("AgentDashboardPage — KPI row", () => {
  it("does NOT use repeat(3,1fr) as fixed grid on mobile", async () => {
    const { container } = await renderAgentDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const threeCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(3,1fr)"
    );
    expect(threeCol).toBeUndefined();
  });

  it("renders without crashing on desktop (loading state)", async () => {
    const { container } = await renderAgentDash(1280);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Listings table scroll ─────────────────────────────────────────────────────

describe("AgentDashboardPage — listings table", () => {
  it("listings table header has scroll container on mobile", async () => {
    const { container } = await renderAgentDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    // Any multi-column grid must be inside an overflow-x:auto parent on mobile
    const bareTable = allDivs.find((el) => {
      const cols = el.style.gridTemplateColumns ?? "";
      if (!cols.includes("2fr") || !cols.includes("auto")) return false;
      const parent = el.parentElement as HTMLElement | null;
      return !parent || parent.style.overflowX !== "auto";
    });
    expect(bareTable).toBeUndefined();
  });
});

// ── AgentMarketplacePage ──────────────────────────────────────────────────────

describe("AgentMarketplacePage — renders on both viewports", () => {
  it("renders on desktop", async () => {
    const { container } = await renderMarketplace(1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders on mobile", async () => {
    const { container } = await renderMarketplace(390);
    expect(container.firstChild).not.toBeNull();
  });
});

describe("AgentMarketplacePage — bid table scroll", () => {
  it("7-column bid table has scroll container on mobile", async () => {
    const { container } = await renderMarketplace(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    // A grid with "2fr 1fr 1fr 1fr 1fr 1fr auto" must not appear bare
    const bareTable = allDivs.find((el) => {
      const cols = el.style.gridTemplateColumns?.replace(/\s/g, "") ?? "";
      if (!cols.startsWith("2fr") || !cols.endsWith("auto")) return false;
      const frCount = (cols.match(/1fr/g) ?? []).length;
      if (frCount < 4) return false;
      const parent = el.parentElement as HTMLElement | null;
      return !parent || parent.style.overflowX !== "auto";
    });
    expect(bareTable).toBeUndefined();
  });
});
