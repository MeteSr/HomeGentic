/**
 * MOB.4 — FsboListingPage mobile audit
 */
import { render, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

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

let FsboListingPage: React.ComponentType;
let ShowingRequestForm: React.ComponentType<{ propertyId: string }>;

beforeAll(async () => {
  mockMatchMedia(1280);
  const mod = await import("@/pages/FsboListingPage");
  FsboListingPage   = mod.default;
  ShowingRequestForm = mod.ShowingRequestForm;
});

async function renderFsbo(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/for-sale/1"]}>
        <Routes><Route path="/for-sale/:propertyId" element={<FsboListingPage />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
}

async function renderForm(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ShowingRequestForm propertyId="1" />);
  });
  return result;
}

// ── Loading state renders ─────────────────────────────────────────────────────

describe("FsboListingPage — renders on both viewports", () => {
  it("renders loading state on desktop without crashing", async () => {
    const { container } = await renderFsbo(1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders loading state on mobile without crashing", async () => {
    const { container } = await renderFsbo(390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Showing request form submit button ────────────────────────────────────────

describe("ShowingRequestForm — submit button", () => {
  it("submit button is full-width on mobile", async () => {
    const { container } = await renderForm(390);
    const btn = container.querySelector("button[type='submit']") as HTMLElement;
    expect(btn.style.alignSelf === "stretch" || btn.style.width === "100%").toBe(true);
  });

  it("submit button is not full-width on desktop", async () => {
    const { container } = await renderForm(1280);
    const btn = container.querySelector("button[type='submit']") as HTMLElement;
    expect(btn.style.alignSelf).not.toBe("stretch");
    expect(btn.style.width).not.toBe("100%");
  });
});

// ── Outer container padding ───────────────────────────────────────────────────

describe("FsboListingPage — outer padding", () => {
  it("uses 2rem top padding on desktop", async () => {
    const { container } = await renderFsbo(1280);
    const outer = container.querySelector("[style*='max-width']") as HTMLElement | null;
    expect(outer).not.toBeNull();
    expect(outer!.style.padding).toMatch(/2rem/);
  });

  it("uses reduced top padding on mobile", async () => {
    const { container } = await renderFsbo(390);
    const outer = container.querySelector("[style*='max-width']") as HTMLElement | null;
    expect(outer).not.toBeNull();
    expect(outer!.style.padding).not.toMatch(/^2rem/);
  });
});

// ── Photo hero ────────────────────────────────────────────────────────────────

describe("FsboListingPage — photo hero", () => {
  it("hero container exists", async () => {
    const { container } = await renderFsbo(390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Showing request form inputs ───────────────────────────────────────────────

describe("ShowingRequestForm — input width", () => {
  it("name input is full-width", async () => {
    const { container } = await renderForm(390);
    const input = container.querySelector("#sr-name") as HTMLInputElement;
    expect(input.style.width).toBe("100%");
  });

  it("contact input is full-width", async () => {
    const { container } = await renderForm(390);
    const input = container.querySelector("#sr-contact") as HTMLInputElement;
    expect(input.style.width).toBe("100%");
  });

  it("time input is full-width", async () => {
    const { container } = await renderForm(390);
    const input = container.querySelector("#sr-time") as HTMLInputElement;
    expect(input.style.width).toBe("100%");
  });
});

// ── Form renders correct labels ───────────────────────────────────────────────

describe("ShowingRequestForm — labels", () => {
  it("shows Your Name label", async () => {
    await renderForm(390);
    expect(screen.getByText(/your name/i)).toBeInTheDocument();
  });

  it("shows Email or Phone label", async () => {
    await renderForm(390);
    expect(screen.getByText(/email or phone/i)).toBeInTheDocument();
  });

  it("shows Preferred Showing Time label", async () => {
    await renderForm(390);
    expect(screen.getByText(/preferred showing time/i)).toBeInTheDocument();
  });

  it("shows submit button text", async () => {
    await renderForm(390);
    expect(screen.getByRole("button", { name: /request a showing/i })).toBeInTheDocument();
  });
});
