/**
 * FsboListingManagerPage — TDD
 *
 * Owner-side listing management at /my-listing/:propertyId.
 *
 * Covers:
 *  - Not-activated state: shows activation prompt + FsboPanel
 *  - In-progress state (step 1–3): shows FsboPanel wizard
 *  - Live state (step "done"): full management dashboard
 *    - Status badge "Live"
 *    - Days on market counter
 *    - Stats: showing count, offer count, list price
 *    - "View Public Listing" link → /for-sale/:id
 *    - Price edit form: changes price, logs to history
 *    - Price history list appears after a change
 *    - ShowingInbox rendered
 *    - ShowingCalendar rendered
 *    - FsboOfferPanel rendered
 *    - "Take Down Listing" button present
 *    - Clicking "Take Down" shows a confirmation prompt
 *    - Confirming deactivation calls fsboService.deactivate and shows not-activated state
 *  - Mobile: no fixed multi-column grid
 *  - Score opt-in toggle: controls whether score is shown on public listing
 */

import { render, act, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

// ── matchMedia mock ───────────────────────────────────────────────────────────
let currentWidth = 1280;
function mockMatchMedia(width: number) {
  currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    writable: true, configurable: true,
    value: (query: string) => {
      const m = query.match(/max-width:\s*(\d+)px/);
      const matches = m ? currentWidth <= parseInt(m[1], 10) : false;
      return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    },
  });
}

// ── service imports ───────────────────────────────────────────────────────────
import { fsboService }           from "@/services/fsbo";
import { showingRequestService } from "@/services/showingRequest";
import { fsboOfferService }      from "@/services/fsboOffer";

// ── lazy imports ──────────────────────────────────────────────────────────────
let FsboListingManagerPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  FsboListingManagerPage = (await import("@/pages/FsboListingManagerPage")).default;
});

beforeEach(() => {
  fsboService.__reset();
  showingRequestService.__reset();
  fsboOfferService.__reset();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const PROP_ID = "prop-test-1";

function seedLiveListing(listPriceCents = 42500000) {
  fsboService.setFsboMode(PROP_ID, listPriceCents);
  fsboService.advanceStep(PROP_ID); // 1 → 2
  fsboService.advanceStep(PROP_ID); // 2 → 3
  fsboService.advanceStep(PROP_ID); // 3 → done
}

async function renderManager(propId = PROP_ID, width = 1280) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[`/my-listing/${propId}`]}>
        <Routes>
          <Route path="/my-listing/:propertyId" element={<FsboListingManagerPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Not-activated state ───────────────────────────────────────────────────────

describe("FsboListingManagerPage — not activated", () => {
  it("renders without crashing when no listing exists", async () => {
    const { container } = await renderManager();
    expect(container.firstChild).not.toBeNull();
  });

  it("shows a not-activated status indicator", async () => {
    await renderManager();
    expect(screen.getByTestId("listing-status-badge").textContent).toMatch(/not listed|inactive|not activated/i);
  });

  it("shows an activation prompt / CTA", async () => {
    await renderManager();
    expect(screen.getByTestId("activate-listing-cta")).toBeInTheDocument();
  });

  it("does NOT show the management dashboard sections", async () => {
    await renderManager();
    expect(screen.queryByTestId("listing-stats-bar")).toBeNull();
    expect(screen.queryByTestId("take-down-btn")).toBeNull();
  });
});

// ── In-progress state (wizard steps 1–3) ─────────────────────────────────────

describe("FsboListingManagerPage — activation in progress", () => {
  it("shows in-progress status when step is 1", async () => {
    fsboService.setFsboMode(PROP_ID, 35000000);
    await renderManager();
    expect(screen.getByTestId("listing-status-badge").textContent).toMatch(/in progress|step|activating/i);
  });

  it("does not show the live management dashboard", async () => {
    fsboService.setFsboMode(PROP_ID, 35000000);
    await renderManager();
    expect(screen.queryByTestId("listing-stats-bar")).toBeNull();
  });
});

// ── Live state ────────────────────────────────────────────────────────────────

describe("FsboListingManagerPage — live listing status badge", () => {
  it("shows 'Live' status badge", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("listing-status-badge").textContent).toMatch(/live/i);
  });
});

describe("FsboListingManagerPage — days on market", () => {
  it("shows days on market counter", async () => {
    seedLiveListing();
    await renderManager();
    const dom = screen.getByTestId("days-on-market");
    expect(dom.textContent).toMatch(/\d+/);
    expect(dom.textContent?.toLowerCase()).toMatch(/day/);
  });

  it("days on market is at least 1", async () => {
    seedLiveListing();
    await renderManager();
    const dom = screen.getByTestId("days-on-market");
    const n = parseInt(dom.textContent ?? "0");
    expect(n).toBeGreaterThanOrEqual(1);
  });
});

describe("FsboListingManagerPage — stats bar", () => {
  it("shows listing stats bar when live", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("listing-stats-bar")).toBeInTheDocument();
  });

  it("shows showing request count", async () => {
    seedLiveListing();
    showingRequestService.create({ propertyId: PROP_ID, name: "Alice", contact: "alice@test.com", preferredTime: "Saturday morning" });
    showingRequestService.create({ propertyId: PROP_ID, name: "Bob",   contact: "bob@test.com",   preferredTime: "Sunday afternoon" });
    await renderManager();
    const stat = screen.getByTestId("stat-showings");
    expect(stat.textContent).toMatch(/2/);
  });

  it("shows offer count", async () => {
    seedLiveListing();
    await fsboOfferService.logOffer(PROP_ID, {
      buyerName: "Carol", offerAmountCents: 41000000, earnestMoneyCents: 1000000,
      contingencies: ["inspection"], closeDateMs: Date.now() + 30 * 86400000, hasEscalationClause: false,
    });
    await renderManager();
    const stat = screen.getByTestId("stat-offers");
    expect(stat.textContent).toMatch(/1/);
  });

  it("shows list price", async () => {
    seedLiveListing(42500000);
    await renderManager();
    const stat = screen.getByTestId("stat-list-price");
    expect(stat.textContent).toMatch(/425,000|425000|\$425/);
  });
});

// ── Public listing link ───────────────────────────────────────────────────────

describe("FsboListingManagerPage — public listing link", () => {
  it("renders a 'View Public Listing' link", async () => {
    seedLiveListing();
    await renderManager();
    const link = screen.getByTestId("view-public-listing-link");
    expect(link).toBeInTheDocument();
  });

  it("link points to /for-sale/:propertyId", async () => {
    seedLiveListing();
    await renderManager();
    const link = screen.getByTestId("view-public-listing-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain(`/for-sale/${PROP_ID}`);
  });
});

// ── Price edit ────────────────────────────────────────────────────────────────

describe("FsboListingManagerPage — price edit", () => {
  it("shows current list price in the edit input", async () => {
    seedLiveListing(42500000);
    await renderManager();
    const input = screen.getByTestId("price-edit-input") as HTMLInputElement;
    // value should be the dollar amount (not cents)
    expect(parseInt(input.value.replace(/[^0-9]/g, ""))).toBe(425000);
  });

  it("Save Price button is present", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("save-price-btn")).toBeInTheDocument();
  });

  it("changing price and saving updates the record", async () => {
    seedLiveListing(42500000);
    await renderManager();
    const input = screen.getByTestId("price-edit-input");
    const btn   = screen.getByTestId("save-price-btn");

    await act(async () => {
      fireEvent.change(input, { target: { value: "410000" } });
      fireEvent.click(btn);
    });

    const record = fsboService.getRecord(PROP_ID);
    expect(record?.listPriceCents).toBe(41000000);
  });

  it("saving a price change logs it to price history", async () => {
    seedLiveListing(42500000);
    await renderManager();
    const input = screen.getByTestId("price-edit-input");
    const btn   = screen.getByTestId("save-price-btn");

    await act(async () => {
      fireEvent.change(input, { target: { value: "410000" } });
      fireEvent.click(btn);
    });

    const history = fsboService.getPriceHistory(PROP_ID);
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].priceCents).toBe(41000000);
  });

  it("price history section appears after at least one logged change", async () => {
    seedLiveListing(42500000);
    fsboService.logPriceChange(PROP_ID, 42500000); // pre-seed one entry
    await renderManager();
    expect(screen.getByTestId("price-history-list")).toBeInTheDocument();
  });

  it("price history list is absent when no history exists", async () => {
    seedLiveListing(42500000);
    // no logPriceChange calls
    await renderManager();
    expect(screen.queryByTestId("price-history-list")).toBeNull();
  });
});

// ── Sub-components rendered ───────────────────────────────────────────────────

describe("FsboListingManagerPage — sub-component presence", () => {
  it("renders ShowingInbox section", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("showing-inbox-section")).toBeInTheDocument();
  });

  it("renders ShowingCalendar section", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("showing-calendar-section")).toBeInTheDocument();
  });

  it("renders offer panel section", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("offer-panel-section")).toBeInTheDocument();
  });
});

// ── Score opt-in toggle ───────────────────────────────────────────────────────

describe("FsboListingManagerPage — score visibility toggle", () => {
  it("score opt-in toggle is present when live", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("score-optin-toggle")).toBeInTheDocument();
  });

  it("toggling changes the label text", async () => {
    seedLiveListing();
    await renderManager();
    const toggle = screen.getByTestId("score-optin-toggle");
    const before = toggle.textContent;
    await act(async () => { fireEvent.click(toggle); });
    expect(toggle.textContent).not.toBe(before);
  });
});

// ── Take down listing ─────────────────────────────────────────────────────────

describe("FsboListingManagerPage — take down listing", () => {
  it("shows 'Take Down Listing' button when live", async () => {
    seedLiveListing();
    await renderManager();
    expect(screen.getByTestId("take-down-btn")).toBeInTheDocument();
  });

  it("clicking Take Down shows a confirmation prompt", async () => {
    seedLiveListing();
    await renderManager();
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-btn")); });
    expect(screen.getByTestId("take-down-confirm-dialog")).toBeInTheDocument();
  });

  it("cancelling the confirmation leaves the listing live", async () => {
    seedLiveListing();
    await renderManager();
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-btn")); });
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-cancel")); });
    expect(screen.getByTestId("listing-status-badge").textContent).toMatch(/live/i);
  });

  it("confirming deactivation removes the record", async () => {
    seedLiveListing();
    await renderManager();
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-btn")); });
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-confirm")); });
    expect(fsboService.getRecord(PROP_ID)).toBeNull();
  });

  it("after confirmed deactivation, page shows not-activated state", async () => {
    seedLiveListing();
    await renderManager();
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-btn")); });
    await act(async () => { fireEvent.click(screen.getByTestId("take-down-confirm")); });
    expect(screen.getByTestId("listing-status-badge").textContent).toMatch(/not listed|inactive|not activated/i);
  });
});

// ── Mobile layout ─────────────────────────────────────────────────────────────

describe("FsboListingManagerPage — mobile layout", () => {
  it("renders without crashing on mobile", async () => {
    seedLiveListing();
    const { container } = await renderManager(PROP_ID, 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("stats bar does not use a fixed 4-column grid on mobile", async () => {
    seedLiveListing();
    const { container } = await renderManager(PROP_ID, 390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const fourCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s+/g, "") === "repeat(4,1fr)"
    );
    expect(fourCol).toBeUndefined();
  });
});
