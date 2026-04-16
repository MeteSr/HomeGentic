/**
 * FsboSearchPage — Public FSBO search marketplace
 *
 * Route: /homes
 * Public, unauthenticated. Buyers browse verified FSBO listings with
 * HomeGentic scores, verified maintenance counts, and system ages —
 * data unavailable on Zillow, Redfin, or Realtor.com.
 *
 * SEO strategy:
 *   - Dynamic <title> + <meta description> via react-helmet-async
 *   - JSON-LD ItemList schema for each visible listing
 *   - JSON-LD BreadcrumbList
 *   - Canonical URL
 *   - OG / Twitter card tags
 *   - Semantic landmarks: <header>, <main>, <aside>, <article>
 *   - Individual listing URLs at /for-sale/:id already have their own schemas
 */

import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, SlidersHorizontal, ShieldCheck, Award, TrendingUp, Clock, Wrench, ChevronRight } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  listPublicFsbos,
  type FsboPublicListing,
  type PropertyType,
} from "@/services/fsbo";

// ─── Design tokens ────────────────────────────────────────────────────────────

const UI = {
  ink:       COLORS.plum,
  inkLight:  COLORS.plumMid,
  paper:     COLORS.white,
  rule:      COLORS.rule,
  sage:      COLORS.sage,
  sageLight: COLORS.sageLight,
  rust:      COLORS.rust,
  butter:    COLORS.butter,
  serif:     FONTS.serif,
  sans:      FONTS.sans,
  mono:      FONTS.mono,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function daysOnMarket(activatedAt: number): number {
  return Math.max(1, Math.floor((Date.now() - activatedAt) / 86_400_000));
}

function humanType(t: PropertyType): string {
  const map: Record<PropertyType, string> = {
    SingleFamily: "Single Family",
    Condo:        "Condo",
    Townhouse:    "Townhouse",
    MultiFamily:  "Multi-Family",
  };
  return map[t] ?? t;
}

function scoreColor(score: number): string {
  if (score >= 85) return COLORS.sage;
  if (score >= 70) return "#5B9E57";
  if (score >= 50) return "#C4882A";
  return COLORS.rust;
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs Work";
}

// ─── Filter & sort types ──────────────────────────────────────────────────────

type SortKey = "newest" | "price_asc" | "price_desc" | "score_desc";

interface Filters {
  query:       string;
  type:        PropertyType | "";
  minPrice:    string;   // dollars, empty = no limit
  maxPrice:    string;
  hasScore:    boolean;
}

const DEFAULT_FILTERS: Filters = {
  query:    "",
  type:     "",
  minPrice: "",
  maxPrice: "",
  hasScore: false,
};

// ─── Filter + sort logic ──────────────────────────────────────────────────────

function applyFilters(
  listings: FsboPublicListing[],
  filters:  Filters,
  sort:     SortKey,
): FsboPublicListing[] {
  let result = listings.filter((l) => {
    const q = filters.query.trim().toLowerCase();
    if (q) {
      const hay = `${l.address} ${l.city} ${l.state} ${l.zipCode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.type && l.propertyType !== filters.type) return false;
    if (filters.minPrice) {
      const minCents = parseFloat(filters.minPrice) * 100;
      if (l.listPriceCents < minCents) return false;
    }
    if (filters.maxPrice) {
      const maxCents = parseFloat(filters.maxPrice) * 100;
      if (l.listPriceCents > maxCents) return false;
    }
    if (filters.hasScore && l.score === undefined) return false;
    return true;
  });

  result = [...result].sort((a, b) => {
    switch (sort) {
      case "price_asc":   return a.listPriceCents - b.listPriceCents;
      case "price_desc":  return b.listPriceCents - a.listPriceCents;
      case "score_desc":  return (b.score ?? -1) - (a.score ?? -1);
      case "newest":
      default:            return b.activatedAt - a.activatedAt;
    }
  });

  return result;
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  const label = scoreLabel(score);
  return (
    <div
      data-testid="listing-score"
      title={`HomeGentic Score: ${score}/100 — ${label}`}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            "0.35rem",
        background:     color + "18",
        border:         `1.5px solid ${color}40`,
        borderRadius:   RADIUS.pill,
        padding:        "0.2rem 0.65rem",
        fontFamily:     UI.mono,
        fontSize:       "0.7rem",
        fontWeight:     700,
        color,
        letterSpacing:  "0.04em",
      }}
    >
      <Award size={11} strokeWidth={2.5} />
      {score} <span style={{ fontWeight: 400, opacity: 0.8 }}>/ 100</span>
    </div>
  );
}

// ─── Verification badge ───────────────────────────────────────────────────────

function VerifiedBadge({ level }: { level: string }) {
  const isPremium = level === "Premium";
  return (
    <div
      data-testid="listing-verified-badge"
      title={`HomeGentic ${level} verified`}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           "0.3rem",
        background:    isPremium ? COLORS.sageLight : "#EAF2FF",
        border:        `1px solid ${isPremium ? COLORS.sageMid : "#B3D0F5"}`,
        borderRadius:  RADIUS.pill,
        padding:       "0.2rem 0.6rem",
        fontFamily:    UI.mono,
        fontSize:      "0.65rem",
        fontWeight:    600,
        color:         isPremium ? "#2A6B26" : "#1A4E8A",
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
      }}
    >
      <ShieldCheck size={10} strokeWidth={2.5} />
      {level} Verified
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: FsboPublicListing }) {
  const dom    = daysOnMarket(listing.activatedAt);
  const isNew  = dom <= 7;
  const showVerified = listing.verificationLevel === "Basic" || listing.verificationLevel === "Premium";

  return (
    <article
      data-testid="fsbo-listing-card"
      style={{
        background:   UI.paper,
        border:       `1px solid ${UI.rule}`,
        borderRadius: RADIUS.card,
        overflow:     "hidden",
        boxShadow:    SHADOWS.card,
        display:      "flex",
        flexDirection: "column",
        transition:   "box-shadow 0.15s",
      }}
    >
      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: "200px", background: UI.rule, overflow: "hidden", flexShrink: 0 }}>
        {listing.photoUrl ? (
          <img
            src={listing.photoUrl}
            alt={`${listing.address}, ${listing.city} ${listing.state}`}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {humanType(listing.propertyType)}
            </div>
          </div>
        )}

        {/* New listing ribbon */}
        {isNew && (
          <div style={{
            position:      "absolute",
            top:           "0.75rem",
            left:          "0.75rem",
            background:    UI.sage,
            color:         "#fff",
            fontFamily:    UI.mono,
            fontSize:      "0.6rem",
            fontWeight:    700,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            padding:       "0.2rem 0.55rem",
            borderRadius:  RADIUS.pill,
          }}>
            New
          </div>
        )}

        {/* FSBO pill */}
        <div style={{
          position:      "absolute",
          top:           "0.75rem",
          right:         "0.75rem",
          background:    UI.ink + "CC",
          color:         "#fff",
          fontFamily:    UI.mono,
          fontSize:      "0.6rem",
          fontWeight:    700,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          padding:       "0.2rem 0.55rem",
          borderRadius:  RADIUS.pill,
          backdropFilter: "blur(4px)",
        }}>
          For Sale By Owner
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1 }}>

        {/* Price */}
        <div
          data-testid="listing-price"
          style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.45rem", color: UI.ink, lineHeight: 1.1 }}
        >
          {formatPrice(listing.listPriceCents)}
        </div>

        {/* Address */}
        <div>
          <div
            data-testid="listing-address"
            style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.9rem", color: UI.ink }}
          >
            {listing.address}
          </div>
          <div style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight }}>
            {listing.city}, {listing.state} {listing.zipCode}
          </div>
        </div>

        {/* Key stats row */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" as const }}>
          {[
            { label: "Bed",  value: `${listing.bedrooms}` },
            { label: "Bath", value: `${listing.bathrooms}` },
            { label: "Sqft", value: formatNumber(listing.squareFeet), testId: "listing-sqft" },
            { label: "Built", value: String(listing.yearBuilt), testId: "listing-year" },
          ].map(({ label, value, testId }) => (
            <div key={label} style={{ textAlign: "center" as const, minWidth: "2.5rem" }}>
              <div
                data-testid={testId}
                style={{ fontFamily: UI.sans, fontWeight: 700, fontSize: "0.85rem", color: UI.ink }}
              >
                {value}
              </div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.58rem", textTransform: "uppercase" as const, letterSpacing: "0.07em", color: UI.inkLight }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* ── HomeGentic differentiators ─────────────────────────────────── */}

        {/* Score badge (opt-in) */}
        {listing.score !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" as const }}>
            <ScoreBadge score={listing.score} />
            <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>HomeGentic Score</span>
          </div>
        )}

        {/* Verification badge */}
        {showVerified && <VerifiedBadge level={listing.verificationLevel} />}

        {/* System highlights */}
        {listing.systemHighlights && listing.systemHighlights.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "0.3rem" }}>
            {listing.systemHighlights.slice(0, 3).map((h) => (
              <span
                key={h}
                style={{
                  background:    UI.sageLight,
                  border:        `1px solid ${COLORS.sageMid}`,
                  borderRadius:  RADIUS.sm,
                  padding:       "0.15rem 0.5rem",
                  fontFamily:    UI.mono,
                  fontSize:      "0.6rem",
                  color:         "#2A6B26",
                  letterSpacing: "0.04em",
                }}
              >
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Footer meta */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "0.5rem", borderTop: `1px solid ${UI.rule}` }}>
          <div style={{ display: "flex", gap: "0.9rem" }}>
            <span
              data-testid="listing-dom"
              style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}
            >
              <Clock size={11} />
              {dom} day{dom === 1 ? "" : "s"}
            </span>
            <span
              data-testid="listing-jobs"
              style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: UI.mono, fontSize: "0.65rem", color: COLORS.sage }}
            >
              <Wrench size={11} />
              {listing.verifiedJobCount} verified
            </span>
          </div>

          <Link
            to={`/for-sale/${listing.propertyId}`}
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           "0.2rem",
              fontFamily:    UI.mono,
              fontSize:      "0.7rem",
              fontWeight:    700,
              color:         UI.sage,
              textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            View <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function TypeChip({
  type, active, onClick,
}: { type: PropertyType; active: boolean; onClick: () => void }) {
  return (
    <button
      data-testid={`filter-type-${type}`}
      onClick={onClick}
      style={{
        border:        `1.5px solid ${active ? UI.sage : UI.rule}`,
        borderRadius:  RADIUS.pill,
        padding:       "0.35rem 0.9rem",
        background:    active ? UI.sageLight : "transparent",
        fontFamily:    UI.mono,
        fontSize:      "0.72rem",
        fontWeight:    active ? 700 : 400,
        color:         active ? "#2A6B26" : UI.inkLight,
        cursor:        "pointer",
        letterSpacing: "0.04em",
        transition:    "all 0.12s",
        whiteSpace:    "nowrap" as const,
      }}
    >
      {humanType(type)}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PROPERTY_TYPES: PropertyType[] = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];

export default function FsboSearchPage() {
  const { isMobile } = useBreakpoint();
  const allListings    = useMemo(() => listPublicFsbos(), []);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort,    setSort]    = useState<SortKey>("newest");

  const results = useMemo(
    () => applyFilters(allListings, filters, sort),
    [allListings, filters, sort],
  );

  // ── SEO helpers ─────────────────────────────────────────────────────────────
  const pageTitle      = "FSBO Homes for Sale — Verified Listings with HomeGentic Scores";
  const pageDesc       = `Browse ${allListings.length} homes for sale by owner with verified maintenance histories, HomeGentic scores, and transparent system ages. Find your next home with full confidence.`;
  const canonicalUrl   = "https://homegentic.app/homes";

  const jsonLdItemList = {
    "@context":     "https://schema.org",
    "@type":        "ItemList",
    "name":         "FSBO Homes for Sale on HomeGentic",
    "description":  pageDesc,
    "url":          canonicalUrl,
    "numberOfItems": results.length,
    "itemListElement": results.map((l, i) => ({
      "@type":    "ListItem",
      "position": i + 1,
      "url":      `https://homegentic.app/for-sale/${l.propertyId}`,
      "name":     `${l.bedrooms} bed ${l.bathrooms} bath ${humanType(l.propertyType)} in ${l.city}, ${l.state} — ${formatPrice(l.listPriceCents)}`,
      "item": {
        "@type":          "RealEstateListing",
        "name":           `${l.address}, ${l.city}, ${l.state} ${l.zipCode}`,
        "url":            `https://homegentic.app/for-sale/${l.propertyId}`,
        "description":    l.description ?? "",
        "price":          String(Math.round(l.listPriceCents / 100)),
        "priceCurrency":  "USD",
        "image":          l.photoUrl ?? "",
        "address": {
          "@type":           "PostalAddress",
          "streetAddress":   l.address,
          "addressLocality": l.city,
          "addressRegion":   l.state,
          "postalCode":      l.zipCode,
          "addressCountry":  "US",
        },
      },
    })),
  };

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",           "item": "https://homegentic.app" },
      { "@type": "ListItem", "position": 2, "name": "Homes for Sale", "item": canonicalUrl },
    ],
  };

  // ── handlers ────────────────────────────────────────────────────────────────
  const setFilter = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: val }));

  const toggleType = (t: PropertyType) =>
    setFilter("type", filters.type === t ? "" : t);

  // ── layout dims ─────────────────────────────────────────────────────────────
  const gridCols = isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))";

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={canonicalUrl} />
        <meta property="og:title"       content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:image"       content="https://homegentic.app/og-homes.png" />

        {/* Twitter card */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />

        {/* JSON-LD */}
        <script type="application/ld+json">{JSON.stringify(jsonLdItemList)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdBreadcrumb)}</script>
      </Helmet>

      <div style={{ minHeight: "100vh", background: "#F7F5F2", fontFamily: UI.sans }}>

        {/* ── Hero search header ───────────────────────────────────────────── */}
        <header style={{
          background:   UI.ink,
          padding:      isMobile ? "1.5rem 1rem 1.25rem" : "2.5rem 2rem 2rem",
        }}>
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>

            {/* Breadcrumb — hidden visually but present for SEO */}
            <nav aria-label="Breadcrumb" style={{ marginBottom: "0.75rem" }}>
              <ol style={{ display: "flex", gap: "0.4rem", listStyle: "none", margin: 0, padding: 0 }}>
                <li>
                  <a href="/" style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#ffffff80", textDecoration: "none" }}>
                    HomeGentic
                  </a>
                </li>
                <li style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#ffffff40" }}>/</li>
                <li>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#ffffffCC" }}>
                    Homes for Sale
                  </span>
                </li>
              </ol>
            </nav>

            <h1 style={{
              fontFamily:  UI.serif,
              fontWeight:  900,
              fontSize:    isMobile ? "1.6rem" : "2.2rem",
              color:       "#FDFCFA",
              margin:      "0 0 0.25rem",
              lineHeight:  1.15,
            }}>
              Find FSBO Homes for Sale
            </h1>
            <p style={{
              fontFamily: UI.sans,
              fontSize:   "0.9rem",
              color:      "#ffffff99",
              margin:     "0 0 1.25rem",
              fontWeight: 300,
            }}>
              Every listing comes with verified maintenance history and a HomeGentic score —
              transparency you won't find on Zillow or Redfin.
            </p>

            {/* Search bar */}
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position:  "absolute",
                  left:      "0.85rem",
                  top:       "50%",
                  transform: "translateY(-50%)",
                  color:     UI.inkLight,
                  pointerEvents: "none",
                }}
              />
              <input
                type="search"
                placeholder="City, state, or zip code"
                value={filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
                aria-label="Search by city, state, or zip code"
                style={{
                  width:         "100%",
                  padding:       "0.75rem 1rem 0.75rem 2.5rem",
                  border:        "none",
                  borderRadius:  RADIUS.input,
                  fontFamily:    UI.sans,
                  fontSize:      "0.95rem",
                  color:         UI.ink,
                  background:    "#FDFCFA",
                  boxSizing:     "border-box" as const,
                  outline:       "none",
                }}
              />
            </div>
          </div>
        </header>

        {/* ── Filters bar ──────────────────────────────────────────────────── */}
        <div style={{
          background:  "#fff",
          borderBottom: `1px solid ${UI.rule}`,
          padding:     isMobile ? "0.75rem 1rem" : "0.85rem 2rem",
          position:    "sticky",
          top:         0,
          zIndex:      10,
        }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" as const, alignItems: "center" }}>

              {/* Type chips */}
              {PROPERTY_TYPES.map((t) => (
                <TypeChip
                  key={t}
                  type={t}
                  active={filters.type === t}
                  onClick={() => toggleType(t)}
                />
              ))}

              {/* Price range */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: isMobile ? 0 : "0.5rem" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, whiteSpace: "nowrap" as const }}>$</span>
                <input
                  data-testid="filter-min-price"
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => setFilter("minPrice", e.target.value)}
                  aria-label="Minimum price in dollars"
                  style={{
                    width:        "80px",
                    padding:      "0.3rem 0.5rem",
                    border:       `1px solid ${UI.rule}`,
                    borderRadius: RADIUS.input,
                    fontFamily:   UI.sans,
                    fontSize:     "0.78rem",
                    color:        UI.ink,
                  }}
                />
                <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>–</span>
                <input
                  data-testid="filter-max-price"
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => setFilter("maxPrice", e.target.value)}
                  aria-label="Maximum price in dollars"
                  style={{
                    width:        "80px",
                    padding:      "0.3rem 0.5rem",
                    border:       `1px solid ${UI.rule}`,
                    borderRadius: RADIUS.input,
                    fontFamily:   UI.sans,
                    fontSize:     "0.78rem",
                    color:        UI.ink,
                  }}
                />
              </div>

              {/* Score filter toggle */}
              <button
                data-testid="filter-has-score"
                onClick={() => setFilter("hasScore", !filters.hasScore)}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           "0.35rem",
                  border:        `1.5px solid ${filters.hasScore ? UI.sage : UI.rule}`,
                  borderRadius:  RADIUS.pill,
                  padding:       "0.35rem 0.9rem",
                  background:    filters.hasScore ? UI.sageLight : "transparent",
                  fontFamily:    UI.mono,
                  fontSize:      "0.72rem",
                  fontWeight:    filters.hasScore ? 700 : 400,
                  color:         filters.hasScore ? "#2A6B26" : UI.inkLight,
                  cursor:        "pointer",
                  letterSpacing: "0.04em",
                  whiteSpace:    "nowrap" as const,
                }}
              >
                <Award size={12} />
                Scores disclosed
              </button>
            </div>
          </div>
        </div>

        {/* ── Results bar + sort ────────────────────────────────────────────── */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "1rem 1rem 0.5rem" : "1.25rem 2rem 0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" as const }}>
            <div
              data-testid="results-count"
              style={{ fontFamily: UI.mono, fontSize: "0.78rem", color: UI.inkLight }}
            >
              {results.length} {results.length === 1 ? "home" : "homes"} for sale
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SlidersHorizontal size={14} color={UI.inkLight} />
              <select
                data-testid="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort listings"
                style={{
                  border:       `1px solid ${UI.rule}`,
                  borderRadius: RADIUS.input,
                  padding:      "0.3rem 0.6rem",
                  fontFamily:   UI.mono,
                  fontSize:     "0.75rem",
                  color:        UI.ink,
                  background:   "transparent",
                  cursor:       "pointer",
                }}
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="score_desc">Highest Score</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Main results grid ─────────────────────────────────────────────── */}
        <main
          aria-label="FSBO listing results"
          style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "0.5rem 1rem 3rem" : "0.75rem 2rem 4rem" }}
        >
          {results.length === 0 ? (
            <div
              data-testid="no-results-message"
              style={{
                textAlign:  "center",
                padding:    "4rem 1rem",
                color:      UI.inkLight,
                fontFamily: UI.sans,
              }}
            >
              <TrendingUp size={40} color={UI.rule} style={{ marginBottom: "1rem" }} />
              <p style={{ fontSize: "1.1rem", fontWeight: 600, color: UI.ink, margin: "0 0 0.5rem" }}>
                No listings match your filters
              </p>
              <p style={{ fontSize: "0.875rem", margin: 0 }}>
                Try broadening your search — remove a filter or expand the price range.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "1.25rem" }}>
              {results.map((listing) => (
                <ListingCard key={listing.propertyId} listing={listing} />
              ))}
            </div>
          )}
        </main>

        {/* ── Value-prop footer strip ───────────────────────────────────────── */}
        <footer style={{
          borderTop:  `1px solid ${UI.rule}`,
          background: "#fff",
          padding:    isMobile ? "2rem 1rem" : "2.5rem 2rem",
        }}>
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink, margin: "0 0 0.75rem" }}>
              Why HomeGentic FSBO listings are different
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "1rem" }}>
              {[
                {
                  icon:  <Award size={20} color={UI.sage} />,
                  title: "HomeGentic Score",
                  body:  "A 0–100 score built from verified maintenance records, system ages, and property verification — the first objective home health score in real estate.",
                },
                {
                  icon:  <ShieldCheck size={20} color={UI.sage} />,
                  title: "Verified by HomeGentic",
                  body:  "Basic and Premium verified properties have had their maintenance history reviewed and cryptographically signed on-chain.",
                },
                {
                  icon:  <Wrench size={20} color={UI.sage} />,
                  title: "Transparent History",
                  body:  "See the count of verified maintenance jobs before you schedule a showing. No surprises after inspection.",
                },
              ].map(({ icon, title, body }) => (
                <div key={title} style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icon}</div>
                  <div>
                    <div style={{ fontFamily: UI.sans, fontWeight: 700, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.3rem" }}>
                      {title}
                    </div>
                    <div style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, lineHeight: 1.5 }}>
                      {body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
