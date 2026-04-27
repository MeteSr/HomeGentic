/**
 * FsboSearchPage — unit tests (TDD)
 *
 * Covers:
 *  - Render / no-crash on desktop and mobile
 *  - Listing cards appear with price, address, stats
 *  - HomeGentic score shown when opted-in, hidden when not
 *  - Verified job count displayed
 *  - Verification badge present when level is Basic or Premium
 *  - "No results" state when filters match nothing
 *  - City text filter narrows results
 *  - Property type filter chip narrows results
 *  - Price range filter narrows results
 *  - Sort: low-to-high orders cards correctly
 *  - "HomeGentic Score" filter only shows scored listings
 *  - SEO: page title includes "FSBO Homes for Sale"
 *  - SEO: JSON-LD ItemList script tag present
 *  - Mobile layout: cards stack single column
 */

import { render, act, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { vi } from "vitest";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));
import type { FsboPublicListing } from "@/services/fsbo";

// ── Test listings fixture (injected via vi.mock — no static data in service) ──

const NOW = Date.now();
const daysAgo = (n: number) => NOW - n * 86_400_000;

const TEST_LISTINGS: FsboPublicListing[] = [
  { propertyId: "1", listPriceCents: 42500000, activatedAt: daysAgo(12), address: "2847 Rosewood Trail", city: "Austin",   state: "TX", zipCode: "78704", propertyType: "SingleFamily", yearBuilt: 2008, squareFeet: 2140, bedrooms: 3, bathrooms: 2, verificationLevel: "Premium",    score: 91,        verifiedJobCount: 14, description: "South Austin gem.", photoUrl: "https://example.com/1.jpg", hasPublicReport: true,  systemHighlights: ["Roof: 2 yrs"] },
  { propertyId: "2", listPriceCents: 31800000, activatedAt: daysAgo(5),  address: "1124 Maple Grove Ln",  city: "Nashville", state: "TN", zipCode: "37206", propertyType: "SingleFamily", yearBuilt: 1998, squareFeet: 1860, bedrooms: 3, bathrooms: 2, verificationLevel: "Basic",     score: 78,        verifiedJobCount: 8,  description: "East Nashville bungalow.", photoUrl: "https://example.com/2.jpg", hasPublicReport: false, systemHighlights: ["Windows: 4 yrs"] },
  { propertyId: "3", listPriceCents: 58900000, activatedAt: daysAgo(21), address: "405 Lakeview Commons", city: "Denver",    state: "CO", zipCode: "80203", propertyType: "Condo",        yearBuilt: 2015, squareFeet: 1320, bedrooms: 2, bathrooms: 2, verificationLevel: "Premium",    score: 88,        verifiedJobCount: 11, description: "Downtown Denver condo.",   photoUrl: "https://example.com/3.jpg", hasPublicReport: true,  systemHighlights: ["HVAC: 1 yr"] },
  { propertyId: "4", listPriceCents: 27400000, activatedAt: daysAgo(33), address: "8912 Pinewood Circle", city: "Phoenix",   state: "AZ", zipCode: "85016", propertyType: "SingleFamily", yearBuilt: 1992, squareFeet: 1680, bedrooms: 3, bathrooms: 2, verificationLevel: "Basic",     score: undefined, verifiedJobCount: 5,  description: "Arcadia-area home.",       photoUrl: "https://example.com/4.jpg", hasPublicReport: false, systemHighlights: ["AC: 5 yrs"] },
  { propertyId: "5", listPriceCents: 49500000, activatedAt: daysAgo(7),  address: "331 Fernwood Ave NE",  city: "Portland",  state: "OR", zipCode: "97212", propertyType: "SingleFamily", yearBuilt: 1924, squareFeet: 1940, bedrooms: 4, bathrooms: 2, verificationLevel: "Premium",    score: 85,        verifiedJobCount: 19, description: "Portland craftsman.",      photoUrl: "https://example.com/5.jpg", hasPublicReport: true,  systemHighlights: ["Electrical: 4 yrs"] },
  { propertyId: "6", listPriceCents: 29200000, activatedAt: daysAgo(15), address: "220 Westmont Place",   city: "Austin",    state: "TX", zipCode: "78731", propertyType: "Condo",        yearBuilt: 2017, squareFeet: 1105, bedrooms: 2, bathrooms: 2, verificationLevel: "Unverified", score: undefined, verifiedJobCount: 2,  description: "Austin high-rise condo.",  photoUrl: undefined,                    hasPublicReport: false, systemHighlights: [] },
];

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return { ...actual, listPublicFsbos: async () => TEST_LISTINGS };
});

// ── matchMedia mock ───────────────────────────────────────────────────────────
let currentWidth = 1280;
function mockMatchMedia(width: number) {
  currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const maxMatch = query.match(/max-width:\s*(\d+)px/);
      const matches  = maxMatch ? currentWidth <= parseInt(maxMatch[1], 10) : false;
      return {
        matches,
        media: query,
        addEventListener:    () => {},
        removeEventListener: () => {},
        dispatchEvent:       () => false,
      };
    },
  });
}

// ── lazy imports ──────────────────────────────────────────────────────────────
let FsboSearchPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  FsboSearchPage = (await import("@/pages/FsboSearchPage")).default;
});

// ── render helpers ────────────────────────────────────────────────────────────
async function renderSearch(url = "/homes", width = 1280) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/homes" element={<FsboSearchPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
  return result;
}

// ── TEST_LISTINGS fixture shape ───────────────────────────────────────────────

describe("TEST_LISTINGS fixture", () => {
  it("is non-empty", () => {
    expect(TEST_LISTINGS.length).toBeGreaterThan(0);
  });

  it("every listing has required fields", () => {
    for (const l of TEST_LISTINGS) {
      expect(l.propertyId).toBeTruthy();
      expect(l.listPriceCents).toBeGreaterThan(0);
      expect(l.address).toBeTruthy();
      expect(l.city).toBeTruthy();
      expect(l.state).toBeTruthy();
      expect(typeof l.squareFeet).toBe("number");
      expect(typeof l.yearBuilt).toBe("number");
      expect(typeof l.verifiedJobCount).toBe("number");
    }
  });

  it("at least one listing has a score (opted-in)", () => {
    expect(TEST_LISTINGS.some((l) => l.score !== undefined)).toBe(true);
  });

  it("at least one listing has no score (opted-out)", () => {
    expect(TEST_LISTINGS.some((l) => l.score === undefined)).toBe(true);
  });

  it("at least one listing has a photo URL", () => {
    expect(TEST_LISTINGS.some((l) => !!l.photoUrl)).toBe(true);
  });
});

// ── Render / no-crash ─────────────────────────────────────────────────────────

describe("FsboSearchPage — renders on both viewports", () => {
  it("renders on desktop without crashing", async () => {
    const { container } = await renderSearch("/homes", 1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders on mobile without crashing", async () => {
    const { container } = await renderSearch("/homes", 390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Search bar ────────────────────────────────────────────────────────────────

describe("FsboSearchPage — search bar", () => {
  it("renders a text input for location search", async () => {
    await renderSearch();
    const input = screen.getByPlaceholderText(/city, state, or zip/i);
    expect(input).toBeInTheDocument();
  });
});

// ── Listing cards ─────────────────────────────────────────────────────────────

describe("FsboSearchPage — listing cards", () => {
  it("renders at least one listing card", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("each card shows a formatted price", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    for (const card of cards) {
      expect(within(card).getByTestId("listing-price").textContent).toMatch(/\$/);
    }
  });

  it("each card shows an address", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    for (const card of cards) {
      expect(within(card).getByTestId("listing-address").textContent?.length).toBeGreaterThan(3);
    }
  });

  it("each card shows sq ft and year built", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    for (const card of cards) {
      expect(within(card).getByTestId("listing-sqft").textContent).toBeTruthy();
      expect(within(card).getByTestId("listing-year").textContent).toBeTruthy();
    }
  });

  it("each card shows days on market", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    for (const card of cards) {
      expect(within(card).getByTestId("listing-dom").textContent).toMatch(/day/i);
    }
  });

  it("each card shows verified job count", async () => {
    await renderSearch();
    const cards = screen.getAllByTestId("fsbo-listing-card");
    for (const card of cards) {
      expect(within(card).getByTestId("listing-jobs").textContent).toMatch(/verified/i);
    }
  });
});

// ── HomeGentic Score ──────────────────────────────────────────────────────────

describe("FsboSearchPage — HomeGentic Score display", () => {
  it("shows score badge on opted-in listings", async () => {
    await renderSearch();
    const scoreBadges = screen.getAllByTestId("listing-score");
    expect(scoreBadges.length).toBeGreaterThan(0);
  });

  it("score badge displays a number 0–100", async () => {
    await renderSearch();
    const scoreBadges = screen.getAllByTestId("listing-score");
    for (const badge of scoreBadges) {
      const num = parseInt(badge.textContent ?? "");
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(100);
    }
  });

  it("opted-out listings have no score badge", async () => {
    const { container } = await renderSearch();
    const cards = Array.from(container.querySelectorAll("[data-testid='fsbo-listing-card']")) as HTMLElement[];
    const listings = TEST_LISTINGS;
    const optedOutCount = listings.filter((l) => l.score === undefined).length;

    // Count cards without a score badge
    const cardsWithoutScore = cards.filter(
      (c) => !c.querySelector("[data-testid='listing-score']")
    ).length;
    expect(cardsWithoutScore).toBe(optedOutCount);
  });
});

// ── Verification badge ────────────────────────────────────────────────────────

describe("FsboSearchPage — verification badges", () => {
  it("verified listings (Basic or Premium) show a badge", async () => {
    await renderSearch();
    const listings = TEST_LISTINGS;
    const verifiedCount = listings.filter(
      (l) => l.verificationLevel === "Basic" || l.verificationLevel === "Premium"
    ).length;
    const badges = screen.getAllByTestId("listing-verified-badge");
    expect(badges.length).toBe(verifiedCount);
  });
});

// ── City filter ───────────────────────────────────────────────────────────────

describe("FsboSearchPage — city text filter", () => {
  it("typing a city name in the search box narrows results", async () => {
    const { container } = await renderSearch();
    const allCards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    const totalCount = allCards.length;

    const input = screen.getByPlaceholderText(/city, state, or zip/i);
    // Pick a city that exists in mock data but not all listings
    const listings = TEST_LISTINGS;
    const firstCity = listings[0].city;
    const cityCount = listings.filter(
      (l) => l.city.toLowerCase().includes(firstCity.toLowerCase())
    ).length;

    await act(async () => { fireEvent.change(input, { target: { value: firstCity } }); });

    const filtered = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(filtered.length).toBe(cityCount);
    expect(filtered.length).toBeLessThanOrEqual(totalCount);
  });

  it("clearing the search box restores all results", async () => {
    const { container } = await renderSearch();
    const totalCount = container.querySelectorAll("[data-testid='fsbo-listing-card']").length;

    const input = screen.getByPlaceholderText(/city, state, or zip/i);
    const firstCity = TEST_LISTINGS[0].city;

    await act(async () => { fireEvent.change(input, { target: { value: firstCity } }); });
    await act(async () => { fireEvent.change(input, { target: { value: "" } }); });

    const restored = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(restored.length).toBe(totalCount);
  });
});

// ── Property type filter ──────────────────────────────────────────────────────

describe("FsboSearchPage — property type filter", () => {
  it("selecting SingleFamily chip shows only SingleFamily listings", async () => {
    const { container } = await renderSearch();
    const listings = TEST_LISTINGS;
    const sfCount = listings.filter((l) => l.propertyType === "SingleFamily").length;

    const chip = screen.getByTestId("filter-type-SingleFamily");
    await act(async () => { fireEvent.click(chip); });

    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBe(sfCount);
  });

  it("clicking the active chip again clears the type filter", async () => {
    const { container } = await renderSearch();
    const totalCount = container.querySelectorAll("[data-testid='fsbo-listing-card']").length;

    const chip = screen.getByTestId("filter-type-SingleFamily");
    await act(async () => { fireEvent.click(chip); });
    await act(async () => { fireEvent.click(chip); });

    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBe(totalCount);
  });
});

// ── Price range filter ────────────────────────────────────────────────────────

describe("FsboSearchPage — price range filter", () => {
  it("max price filter hides listings above the threshold", async () => {
    const { container } = await renderSearch();
    const listings = TEST_LISTINGS;
    const threshold = 500_000;
    const expectedCount = listings.filter((l) => l.listPriceCents <= threshold * 100).length;

    const maxInput = screen.getByTestId("filter-max-price");
    await act(async () => {
      fireEvent.change(maxInput, { target: { value: String(threshold) } });
    });

    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBe(expectedCount);
  });

  it("min price filter hides listings below the threshold", async () => {
    const { container } = await renderSearch();
    const listings = TEST_LISTINGS;
    const threshold = 400_000;
    const expectedCount = listings.filter((l) => l.listPriceCents >= threshold * 100).length;

    const minInput = screen.getByTestId("filter-min-price");
    await act(async () => {
      fireEvent.change(minInput, { target: { value: String(threshold) } });
    });

    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBe(expectedCount);
  });
});

// ── Sort ──────────────────────────────────────────────────────────────────────

describe("FsboSearchPage — sort", () => {
  it("sort price low→high orders first card cheapest", async () => {
    const { container } = await renderSearch();
    const select = screen.getByTestId("sort-select");
    await act(async () => {
      fireEvent.change(select, { target: { value: "price_asc" } });
    });

    const cards = Array.from(
      container.querySelectorAll("[data-testid='fsbo-listing-card']")
    ) as HTMLElement[];
    expect(cards.length).toBeGreaterThan(1);

    const prices = cards.map((c) => {
      const raw = c.querySelector("[data-testid='listing-price']")?.textContent ?? "$0";
      return parseInt(raw.replace(/[^0-9]/g, ""), 10);
    });
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it("sort price high→low orders first card most expensive", async () => {
    const { container } = await renderSearch();
    const select = screen.getByTestId("sort-select");
    await act(async () => {
      fireEvent.change(select, { target: { value: "price_desc" } });
    });

    const cards = Array.from(
      container.querySelectorAll("[data-testid='fsbo-listing-card']")
    ) as HTMLElement[];
    const prices = cards.map((c) => {
      const raw = c.querySelector("[data-testid='listing-price']")?.textContent ?? "$0";
      return parseInt(raw.replace(/[^0-9]/g, ""), 10);
    });
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it("sort by score shows highest-score first (only scored listings)", async () => {
    const { container } = await renderSearch();
    const select = screen.getByTestId("sort-select");
    await act(async () => {
      fireEvent.change(select, { target: { value: "score_desc" } });
    });

    const scoreBadges = Array.from(
      container.querySelectorAll("[data-testid='listing-score']")
    ) as HTMLElement[];
    if (scoreBadges.length > 1) {
      const scores = scoreBadges.map((b) => parseInt(b.textContent ?? "0"));
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    }
  });
});

// ── "Show only scored" filter ─────────────────────────────────────────────────

describe("FsboSearchPage — score filter", () => {
  it("'Scores disclosed' toggle hides listings without a score", async () => {
    const { container } = await renderSearch();
    const toggle = screen.getByTestId("filter-has-score");
    await act(async () => { fireEvent.click(toggle); });

    const listings = TEST_LISTINGS;
    const scoredCount = listings.filter((l) => l.score !== undefined).length;
    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBe(scoredCount);
  });
});

// ── No-results state ──────────────────────────────────────────────────────────

describe("FsboSearchPage — no results", () => {
  it("shows a no-results message when filters match nothing", async () => {
    await renderSearch();
    const minInput = screen.getByTestId("filter-min-price");
    await act(async () => {
      // Set min price higher than any listing
      fireEvent.change(minInput, { target: { value: "99999999" } });
    });
    expect(screen.getByTestId("no-results-message")).toBeInTheDocument();
  });
});

// ── Results count ─────────────────────────────────────────────────────────────

describe("FsboSearchPage — results count", () => {
  it("displays the number of results found", async () => {
    await renderSearch();
    const count = screen.getByTestId("results-count");
    expect(count.textContent).toMatch(/\d+/);
    expect(count.textContent?.toLowerCase()).toMatch(/home|listing|result/);
  });
});

// ── SEO ───────────────────────────────────────────────────────────────────────

describe("FsboSearchPage — SEO", () => {
  it("page title contains 'FSBO' or 'For Sale By Owner'", async () => {
    await renderSearch();
    expect(document.title).toMatch(/fsbo|for sale by owner/i);
  });

  it("JSON-LD script tag is present in the document", async () => {
    await renderSearch();
    // React 19: react-helmet-async v3 uses React 19's native head hoisting for
    // <title>/<meta>/<link>, but non-async <script> tags are NOT hoisted to <head>.
    // They render in the document body. We search the full document instead.
    const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
    expect(scripts.length).toBeGreaterThan(0);
  });

  it("JSON-LD contains ItemList type", async () => {
    await renderSearch();
    // See note above — non-async scripts render in body with React 19.
    const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']")) as HTMLElement[];
    const combined = scripts.map((s) => s.textContent ?? "").join("\n");
    expect(combined).toMatch(/ItemList/);
  });
});

// ── Mobile layout ─────────────────────────────────────────────────────────────

describe("FsboSearchPage — mobile layout", () => {
  it("cards do NOT use multi-column grid on mobile", async () => {
    const { container } = await renderSearch("/homes", 390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const multiCol = allDivs.find((el) => {
      const cols = el.style.gridTemplateColumns?.replace(/\s+/g, "");
      return cols && cols.includes("1fr1fr");
    });
    expect(multiCol).toBeUndefined();
  });

  it("renders at least one card on mobile", async () => {
    const { container } = await renderSearch("/homes", 390);
    const cards = container.querySelectorAll("[data-testid='fsbo-listing-card']");
    expect(cards.length).toBeGreaterThan(0);
  });
});
