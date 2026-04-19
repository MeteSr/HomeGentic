/**
 * FsboListingManagerPage — Owner-side FSBO listing management
 *
 * Route: /my-listing/:propertyId  (protected)
 *
 * Three states based on fsboService record:
 *   null record      → Not activated  — shows activation CTA + FsboPanel wizard
 *   step 1 | 2 | 3   → In progress   — shows FsboPanel wizard to finish setup
 *   step "done"       → Live          — full management dashboard:
 *                          • Stats bar (DOM, showings, offers, price)
 *                          • Price edit + history
 *                          • Score opt-in toggle
 *                          • Public listing link
 *                          • ShowingInbox + ShowingCalendar
 *                          • FsboOfferPanel
 *                          • Take Down listing (with confirmation)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link }                         from "react-router-dom";
import { Helmet }                                  from "react-helmet-async";
import {
  Eye, TrendingDown, CalendarDays, MessageSquare,
  Tag, Award, AlertTriangle, CheckCircle2, ExternalLink,
  ChevronDown, ChevronUp,
} from "lucide-react";

import { COLORS, FONTS, RADIUS, SHADOWS }    from "@/theme";
import { useBreakpoint }                      from "@/hooks/useBreakpoint";
import { fsboService, type FsboRecord }       from "@/services/fsbo";
import { showingRequestService }              from "@/services/showingRequest";
import { fsboOfferService }                   from "@/services/fsboOffer";
import ShowingInbox                           from "@/components/ShowingInbox";
import ShowingCalendar                        from "@/components/ShowingCalendar";
import FsboOfferPanel                         from "@/components/FsboOfferPanel";
import FsboPanel                              from "@/components/FsboPanel";
import ListingPhotoManager                    from "@/components/ListingPhotoManager";

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
  mono:      FONTS.sans,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function daysOnMarket(activatedAt: number): number {
  return Math.max(1, Math.floor((Date.now() - activatedAt) / 86_400_000));
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type ListingState = "not-activated" | "in-progress" | "live";

function statusForRecord(rec: FsboRecord | null): ListingState {
  if (!rec)              return "not-activated";
  if (rec.step === "done") return "live";
  return "in-progress";
}

function StatusBadge({ state }: { state: ListingState }) {
  const cfg = {
    live:          { label: "Live",          bg: COLORS.sageLight, border: COLORS.sageMid, color: "#1E6B1A" },
    "in-progress": { label: "Activating — In Progress", bg: COLORS.butter,    border: "#D4B84A",    color: "#7A5C00" },
    "not-activated": { label: "Not Listed",  bg: UI.rule + "80",   border: UI.rule,        color: UI.inkLight },
  }[state];

  return (
    <span
      data-testid="listing-status-badge"
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           "0.35rem",
        background:    cfg.bg,
        border:        `1.5px solid ${cfg.border}`,
        borderRadius:  RADIUS.pill,
        padding:       "0.3rem 0.85rem",
        fontFamily:    UI.mono,
        fontSize:      "0.72rem",
        fontWeight:    700,
        color:         cfg.color,
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
      }}
    >
      {state === "live" && <CheckCircle2 size={12} />}
      {state === "in-progress" && <AlertTriangle size={12} />}
      {cfg.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, testId,
}: {
  icon:   React.ReactNode;
  label:  string;
  value:  React.ReactNode;
  testId: string;
}) {
  return (
    <div style={{
      background:   UI.paper,
      border:       `1px solid ${UI.rule}`,
      borderRadius: RADIUS.card,
      padding:      "1rem 1.25rem",
      display:      "flex",
      flexDirection: "column" as const,
      gap:          "0.4rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: UI.inkLight }}>
        {icon}
        <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      <div
        data-testid={testId}
        style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: UI.ink }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ testId, title, children }: { testId: string; title: string; children: React.ReactNode }) {
  return (
    <section
      data-testid={testId}
      style={{
        background:   UI.paper,
        border:       `1px solid ${UI.rule}`,
        borderRadius: RADIUS.card,
        overflow:     "hidden",
      }}
    >
      <div style={{
        padding:     "0.85rem 1.25rem",
        borderBottom: `1px solid ${UI.rule}`,
        fontFamily:  UI.mono,
        fontSize:    "0.72rem",
        fontWeight:  700,
        color:       UI.inkLight,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
      }}>
        {title}
      </div>
      <div style={{ padding: "1.25rem" }}>
        {children}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FsboListingManagerPage() {
  const { propertyId = "" } = useParams<{ propertyId: string }>();
  const { isMobile }        = useBreakpoint();

  const [record,        setRecord]        = useState<FsboRecord | null>(() => fsboService.getRecord(propertyId));
  const [showingCount,  setShowingCount]  = useState(0);
  const [offerCount,    setOfferCount]    = useState(0);
  const [priceInput,    setPriceInput]    = useState("");
  const [scoreOptIn,    setScoreOptIn]    = useState(true);
  const [showTakeDown,  setShowTakeDown]  = useState(false);
  const [priceHistory,  setPriceHistory]  = useState(() => fsboService.getPriceHistory(propertyId));

  const listingState = statusForRecord(record);

  // Single source of truth: one callback that atomically refreshes all
  // derived state from the services so callers can't forget a slice.
  const refreshAll = useCallback(() => {
    const rec = fsboService.getRecord(propertyId);
    setRecord(rec);
    setPriceHistory(fsboService.getPriceHistory(propertyId));
    setShowingCount(showingRequestService.getByProperty(propertyId).length);
    setOfferCount(fsboOfferService.getByProperty(propertyId).length);
    if (rec) setPriceInput(String(Math.round(rec.listPriceCents / 100)));
  }, [propertyId]);

  // Populate on mount and whenever propertyId changes
  useEffect(() => { refreshAll(); }, [refreshAll]);

  function handleSavePrice() {
    const dollars = parseFloat(priceInput);
    if (!record || isNaN(dollars) || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    fsboService.updatePrice(propertyId, cents);
    fsboService.logPriceChange(propertyId, cents);
    refreshAll();
  }

  function handleTakeDownConfirm() {
    fsboService.deactivate(propertyId);
    setShowTakeDown(false);
    refreshAll();
  }

  const pageTitle = record?.step === "done"
    ? `Manage Listing — ${propertyId} | HomeGentic`
    : "Activate FSBO Listing | HomeGentic";

  // ── Not activated ────────────────────────────────────────────────────────────
  if (listingState === "not-activated") {
    return (
      <>
        <Helmet><title>{pageTitle}</title></Helmet>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: isMobile ? "1.5rem 1rem" : "2.5rem 2rem", fontFamily: UI.sans }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" as const }}>
            <StatusBadge state="not-activated" />
          </div>

          <div
            data-testid="activate-listing-cta"
            style={{
              background:   UI.sageLight,
              border:       `1.5px solid ${COLORS.sageMid}`,
              borderRadius: RADIUS.card,
              padding:      "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.15rem", color: UI.ink, margin: "0 0 0.4rem" }}>
              Your home isn't listed yet.
            </p>
            <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: 0 }}>
              Complete the activation steps below to go live on the HomeGentic marketplace.
            </p>
          </div>

          <FsboPanel
            propertyId={propertyId}
            score={0}
            verifiedJobCount={0}
            hasReport={false}
          />
        </div>
      </>
    );
  }

  // ── In progress (steps 1–3) ──────────────────────────────────────────────────
  if (listingState === "in-progress") {
    return (
      <>
        <Helmet><title>{pageTitle}</title></Helmet>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: isMobile ? "1.5rem 1rem" : "2.5rem 2rem", fontFamily: UI.sans }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <StatusBadge state="in-progress" />
          </div>
          <FsboPanel
            propertyId={propertyId}
            score={0}
            verifiedJobCount={0}
            hasReport={record?.hasReport ?? false}
          />
        </div>
      </>
    );
  }

  // ── Live management dashboard ────────────────────────────────────────────────
  const dom = daysOnMarket(record!.activatedAt);

  return (
    <>
      <Helmet><title>{pageTitle}</title></Helmet>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "1rem" : "2rem 2rem 4rem", fontFamily: UI.sans }}>

        {/* ── Header row ────────────────────────────────────────────────────── */}
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          flexWrap:       "wrap" as const,
          gap:            "0.75rem",
          marginBottom:   "1.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" as const }}>
            <StatusBadge state="live" />
            <span
              data-testid="days-on-market"
              style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.inkLight }}
            >
              {dom} day{dom === 1 ? "" : "s"} on market
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" as const }}>
            <Link
              data-testid="view-public-listing-link"
              to={`/for-sale/${propertyId}`}
              style={{
                display:     "inline-flex",
                alignItems:  "center",
                gap:         "0.35rem",
                fontFamily:  UI.mono,
                fontSize:    "0.72rem",
                fontWeight:  600,
                color:       UI.sage,
                textDecoration: "none",
                border:      `1px solid ${COLORS.sageMid}`,
                borderRadius: RADIUS.pill,
                padding:     "0.35rem 0.85rem",
              }}
            >
              <ExternalLink size={12} />
              View Public Listing
            </Link>

            <button
              data-testid="take-down-btn"
              onClick={() => setShowTakeDown(true)}
              style={{
                display:     "inline-flex",
                alignItems:  "center",
                gap:         "0.35rem",
                fontFamily:  UI.mono,
                fontSize:    "0.72rem",
                fontWeight:  600,
                color:       UI.rust,
                background:  "transparent",
                border:      `1px solid ${UI.rust}60`,
                borderRadius: RADIUS.pill,
                padding:     "0.35rem 0.85rem",
                cursor:      "pointer",
              }}
            >
              <TrendingDown size={12} />
              Take Down Listing
            </button>
          </div>
        </div>

        {/* ── Take-down confirmation dialog ─────────────────────────────────── */}
        {showTakeDown && (
          <div
            data-testid="take-down-confirm-dialog"
            style={{
              background:   "#FFF5F5",
              border:       `1.5px solid ${UI.rust}60`,
              borderRadius: RADIUS.card,
              padding:      "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <p style={{ fontFamily: UI.sans, fontWeight: 600, color: UI.ink, margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
              Remove this listing from the marketplace?
            </p>
            <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, margin: "0 0 1rem" }}>
              Your listing will be taken down immediately. Showing requests and offers already received will not be deleted.
              You can re-activate at any time.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                data-testid="take-down-confirm"
                onClick={handleTakeDownConfirm}
                style={{
                  background:   UI.rust,
                  color:        "#fff",
                  border:       "none",
                  borderRadius: RADIUS.pill,
                  padding:      "0.45rem 1.1rem",
                  fontFamily:   UI.mono,
                  fontSize:     "0.72rem",
                  fontWeight:   700,
                  cursor:       "pointer",
                }}
              >
                Yes, Take Down
              </button>
              <button
                data-testid="take-down-cancel"
                onClick={() => setShowTakeDown(false)}
                style={{
                  background:   "transparent",
                  color:        UI.inkLight,
                  border:       `1px solid ${UI.rule}`,
                  borderRadius: RADIUS.pill,
                  padding:      "0.45rem 1.1rem",
                  fontFamily:   UI.mono,
                  fontSize:     "0.72rem",
                  cursor:       "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Stats bar ─────────────────────────────────────────────────────── */}
        <div
          data-testid="listing-stats-bar"
          style={{
            display:             "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap:                 "0.85rem",
            marginBottom:        "1.5rem",
          }}
        >
          <StatCard
            icon={<CalendarDays size={14} />}
            label="Days on Market"
            value={dom}
            testId="stat-dom"
          />
          <StatCard
            icon={<MessageSquare size={14} />}
            label="Showing Requests"
            value={showingCount}
            testId="stat-showings"
          />
          <StatCard
            icon={<Eye size={14} />}
            label="Offers"
            value={offerCount}
            testId="stat-offers"
          />
          <StatCard
            icon={<Tag size={14} />}
            label="List Price"
            value={formatPrice(record!.listPriceCents)}
            testId="stat-list-price"
          />
        </div>

        {/* ── Price management ──────────────────────────────────────────────── */}
        <Section testId="price-edit-section" title="List Price">
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" as const, alignItems: "flex-end" }}>
            <div>
              <label
                htmlFor="price-edit"
                style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.3rem" }}
              >
                Asking Price ($)
              </label>
              <input
                id="price-edit"
                data-testid="price-edit-input"
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                style={{
                  padding:      "0.55rem 0.75rem",
                  border:       `1px solid ${UI.rule}`,
                  borderRadius: RADIUS.input,
                  fontFamily:   UI.sans,
                  fontSize:     "1rem",
                  fontWeight:   600,
                  color:        UI.ink,
                  width:        "180px",
                }}
              />
            </div>
            <button
              data-testid="save-price-btn"
              onClick={handleSavePrice}
              style={{
                background:   UI.sage,
                color:        "#fff",
                border:       "none",
                borderRadius: RADIUS.pill,
                padding:      "0.55rem 1.25rem",
                fontFamily:   UI.mono,
                fontSize:     "0.75rem",
                fontWeight:   700,
                cursor:       "pointer",
                marginBottom: "0.05rem",
              }}
            >
              Save Price
            </button>
          </div>

          {/* Price history */}
          {priceHistory.length > 0 && (
            <div
              data-testid="price-history-list"
              style={{ marginTop: "1rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "0.75rem" }}
            >
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.5rem" }}>
                Price History
              </div>
              {[...priceHistory].reverse().map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display:        "flex",
                    justifyContent: "space-between",
                    padding:        "0.3rem 0",
                    borderBottom:   i < priceHistory.length - 1 ? `1px solid ${UI.rule}` : "none",
                    fontFamily:     UI.sans,
                    fontSize:       "0.825rem",
                  }}
                >
                  <span style={{ fontWeight: 600, color: UI.ink }}>{formatPrice(entry.priceCents)}</span>
                  <span style={{ color: UI.inkLight }}>{formatDate(entry.recordedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Listing photos ────────────────────────────────────────────────── */}
        <Section testId="listing-photos-section" title="Listing Photos">
          <ListingPhotoManager propertyId={propertyId} isOwner={true} />
        </Section>

        {/* ── Score opt-in ──────────────────────────────────────────────────── */}
        <div style={{ margin: "1rem 0" }}>
          <button
            data-testid="score-optin-toggle"
            onClick={() => setScoreOptIn((v) => !v)}
            style={{
              display:     "inline-flex",
              alignItems:  "center",
              gap:         "0.5rem",
              background:  scoreOptIn ? UI.sageLight : "transparent",
              border:      `1.5px solid ${scoreOptIn ? COLORS.sageMid : UI.rule}`,
              borderRadius: RADIUS.pill,
              padding:     "0.4rem 1rem",
              fontFamily:  UI.mono,
              fontSize:    "0.72rem",
              fontWeight:  scoreOptIn ? 700 : 400,
              color:       scoreOptIn ? "#1E6B1A" : UI.inkLight,
              cursor:      "pointer",
            }}
          >
            <Award size={13} />
            {scoreOptIn ? "Score shown on public listing" : "Score hidden from public listing"}
          </button>
        </div>

        {/* ── Showing inbox ──────────────────────────────────────────────────── */}
        <div data-testid="showing-inbox-section" style={{ marginBottom: "1.25rem" }}>
          <ShowingInbox propertyId={propertyId} />
        </div>

        {/* ── Showing calendar ──────────────────────────────────────────────── */}
        <div data-testid="showing-calendar-section" style={{ marginBottom: "1.25rem" }}>
          <ShowingCalendar propertyId={propertyId} />
        </div>

        {/* ── Offer panel ───────────────────────────────────────────────────── */}
        <div data-testid="offer-panel-section">
          <FsboOfferPanel propertyId={propertyId} listPriceCents={record!.listPriceCents} />
        </div>

      </div>
    </>
  );
}
