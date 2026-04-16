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
 *  - listPublicFsbos() service method returns array with required fields
 */

import { render, act, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

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
let listPublicFsbos: () => import("@/services/fsbo").FsboPublicListing[];

beforeAll(async () => {
  mockMatchMedia(1280);
  FsboSearchPage = (await import("@/pages/FsboSearchPage")).default;
  listPublicFsbos = (await import("@/services/fsbo")).listPublicFsbos;
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

// ── listPublicFsbos service ───────────────────────────────────────────────────

describe("listPublicFsbos()", () => {
  it("returns a non-empty array", () => {
    const listings = listPublicFsbos();
    expect(listings.length).toBeGreaterThan(0);
  });

  it("every listing has required fields", () => {
    const listings = listPublicFsbos();
    for (const l of listings) {
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
    const listings = listPublicFsbos();
    const withScore = listings.filter((l) => l.score !== undefined);
    expect(withScore.length).toBeGreaterThan(0);
  });

  it("at least one listing has no score (opted-out)", () => {
    const listings = listPublicFsbos();
    const withoutScore = listings.filter((l) => l.score === undefined);
    expect(withoutScore.length).toBeGreaterThan(0);
  });

  it("at least one listing has a photo URL", () => {
    const listings = listPublicFsbos();
    const withPhoto = listings.filter((l) => !!l.photoUrl);
    expect(withPhoto.length).toBeGreaterThan(0);
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
    const listings = listPublicFsbos();
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
    const listings = listPublicFsbos();
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
    const listings = listPublicFsbos();
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
    const firstCity = listPublicFsbos()[0].city;

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
    const listings = listPublicFsbos();
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
    const listings = listPublicFsbos();
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
    const listings = listPublicFsbos();
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

    const listings = listPublicFsbos();
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

  it("JSON-LD script tag is present in the document head", async () => {
    await renderSearch();
    const scripts = Array.from(document.head.querySelectorAll("script[type='application/ld+json']"));
    expect(scripts.length).toBeGreaterThan(0);
  });

  it("JSON-LD contains ItemList type", async () => {
    await renderSearch();
    const scripts = Array.from(document.head.querySelectorAll("script[type='application/ld+json']")) as HTMLElement[];
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
