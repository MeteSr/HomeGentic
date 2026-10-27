/**
 * FsboListingManagerPage — Owner-side FSBO listing management
 *
 * Route: /my-listing/:propertyId  (protected)
 *
 * Three states based on the seller's FSBO record (listing canister):
 *   null record      → Not activated  — shows activation CTA + FsboPanel wizard
 *   step 1 | 2 | 3   → In progress   — shows FsboPanel wizard to finish setup
 *   step "done"       → Live          — full management dashboard:
 *                          • Stats bar (DOM, showings, offers, price)
 *                          • Price edit + history
 *                          • Score shown/hidden on the public listing
 *                          • Public listing link
 *                          • ShowingInbox + ShowingCalendar
 *                          • FsboOfferPanel
 *                          • Hand off to an agent (Bid to List)
 *                          • Take Down listing (with confirmation)
 *
 * Readiness uses the same score, verified job count and public report check
 * as the property page.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link }                         from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import {
  Eye, TrendingDown, CalendarDays, MessageSquare,
  Tag, Award, AlertTriangle, CheckCircle2, ExternalLink,
} from "lucide-react";

import { V2_COLORS, V2_FONTS, V2_RADIUS }    from "@/theme";
import { useBreakpoint }                      from "@/hooks/useBreakpoint";
import { fsboService, type FsboRecord, type PriceEntry } from "@/services/fsbo";
import { listingService, type PanoramaEntry } from "@/services/listing";
import { showingRequestService, type ShowingRequest } from "@/services/showingRequest";
import type { FsboOffer }                     from "@/services/fsboOffer";
import { propertyService, type Property }     from "@/services/property";
import { jobService }                         from "@/services/job";
import { reportService }                      from "@/services/report";
import { photoService }                       from "@/services/photo";
import { computeScore }                       from "@/services/scoreService";
import { useAuthStore }                       from "@/store/authStore";
import ShowingInbox                           from "@/components/ShowingInbox";
import ShowingCalendar                        from "@/components/ShowingCalendar";
import FsboOfferPanel                         from "@/components/FsboOfferPanel";
import FsboPanel                              from "@/components/FsboPanel";
import ListingPhotoManager                    from "@/components/ListingPhotoManager";

// ─── Design tokens ────────────────────────────────────────────────────────────

const UI = {
  ink:       V2_COLORS.ink,
  inkLight:  V2_COLORS.muted,
  paper:     V2_COLORS.paper,
  rule:      V2_COLORS.border,
  sage:      V2_COLORS.blue,
  sageLight: V2_COLORS.lblue,
  rust:      V2_COLORS.coral,
  butter:    V2_COLORS.attentionBg,
  serif:     V2_FONTS.display,
  sans:      V2_FONTS.body,
  mono:      V2_FONTS.body,
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
    live:          { label: "Live",          bg: V2_COLORS.lblue,       border: V2_COLORS.cobalTint, color: "#1E6B1A" },
    "in-progress": { label: "Activating — In Progress", bg: V2_COLORS.attentionBg, border: "#D4B84A",           color: "#7A5C00" },
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
        borderRadius:  V2_RADIUS.pill,
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
      borderRadius: V2_RADIUS.card,
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
        borderRadius: V2_RADIUS.card,
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
  const profile             = useAuthStore((s) => s.profile);

  const [record,        setRecord]        = useState<FsboRecord | null | undefined>(undefined);
  const [property,      setProperty]      = useState<Property | null>(null);
  const [score,         setScore]         = useState(0);
  const [verifiedJobs,  setVerifiedJobs]  = useState(0);
  const [hasReport,     setHasReport]     = useState(false);
  const [showings,      setShowings]      = useState<ShowingRequest[]>([]);
  const [offers,        setOffers]        = useState<FsboOffer[]>([]);
  const [priceInput,    setPriceInput]    = useState("");
  const [scoreHidden,   setScoreHidden]   = useState(false);
  const [showTakeDown,  setShowTakeDown]  = useState(false);
  const [priceHistory,  setPriceHistory]  = useState<PriceEntry[]>([]);
  const [panoramas,     setPanoramas]     = useState<PanoramaEntry[]>([]);
  const [newRoomLabel,  setNewRoomLabel]  = useState("");
  const [newPhotoFile,  setNewPhotoFile]  = useState<File | null>(null);
  const [addingTour,    setAddingTour]    = useState(false);
  const [agentRequested, setAgentRequested] = useState(false);
  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const listingState = statusForRecord(record ?? null);

  // Single source of truth: one callback that refreshes all derived state
  // from the services so callers can't forget a slice.
  const refreshAll = useCallback(async () => {
    try {
      const rec = await fsboService.getRecord(propertyId);
      setRecord(rec);
      if (rec) setPriceInput(String(Math.round(rec.listPriceCents / 100)));
      if (rec?.step === "done") {
        const [history, reqs, hidden] = await Promise.all([
          fsboService.getPriceHistory(propertyId),
          showingRequestService.getByProperty(propertyId).catch(() => [] as ShowingRequest[]),
          fsboService.isScoreHidden(propertyId).catch(() => false),
        ]);
        setPriceHistory(history);
        setShowings(reqs);
        setScoreHidden(hidden);
      }
    } catch (err) {
      setRecord(null);
      setError(err instanceof Error ? err.message : "Couldn't load your listing.");
    }
  }, [propertyId]);

  // Populate on mount and whenever propertyId changes
  useEffect(() => { void refreshAll(); }, [refreshAll]);
  useEffect(() => { listingService.getPanoramas(propertyId).then(setPanoramas).catch(() => {}); }, [propertyId]);

  // Readiness inputs: the same score and verified-job count as the property page.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      propertyService.getProperty(propertyId).catch(() => null),
      jobService.getByProperty(propertyId).catch(() => []),
      reportService.listShareLinks(propertyId).catch(() => []),
    ]).then(([prop, jobs, links]) => {
      if (cancelled) return;
      setProperty(prop);
      setScore(prop ? computeScore(jobs, [prop]) : 0);
      setVerifiedJobs(jobs.filter((j) => j.verified).length);
      setHasReport(links.some((l) => l.isActive && l.visibility === "Public"));
    });
    return () => { cancelled = true; };
  }, [propertyId]);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSavePrice() {
    const dollars = parseFloat(priceInput);
    if (!record || isNaN(dollars) || dollars <= 0) return;
    void act(async () => {
      await fsboService.updatePrice(propertyId, Math.round(dollars * 100));
      await refreshAll();
    });
  }

  function handleTakeDownConfirm() {
    void act(async () => {
      await fsboService.deactivate(propertyId);
      setShowTakeDown(false);
      setShowings([]);
      setOffers([]);
      setPriceHistory([]);
      await refreshAll();
    });
  }

  function handleToggleScore() {
    const nextHidden = !scoreHidden;
    void act(async () => {
      await fsboService.setScoreVisible(propertyId, !nextHidden);
      setScoreHidden(nextHidden);
    });
  }

  function handleAddTour() {
    const label = newRoomLabel.trim();
    if (!label || !newPhotoFile) { setError("Enter a room label and choose a 360° photo."); return; }
    setAddingTour(true);
    void act(async () => {
      try {
        const photo = await photoService.uploadListingPhoto(newPhotoFile, propertyId, `360° ${label}`);
        await listingService.addPanorama(propertyId, label, photo.id);
        setPanoramas(await listingService.getPanoramas(propertyId));
        setNewRoomLabel("");
        setNewPhotoFile(null);
      } finally {
        setAddingTour(false);
      }
    });
  }

  function handleFindAgent() {
    if (!record) return;
    const days  = daysOnMarket(record.activatedAt);
    const price = Math.round(record.listPriceCents / 100).toLocaleString("en-US");
    const notes = `Previously listed FSBO at $${price}. Days on market: ${days}. Offers received: ${offers.length}.`;
    void act(async () => {
      await listingService.createBidRequest({
        propertyId,
        address:          property?.address ?? "",
        city:             property?.city ?? "",
        county:           "",
        zipCode:          property?.zipCode ?? "",
        homeownerEmail:   profile?.email ?? "",
        sqft:             property?.squareFeet != null ? Number(property.squareFeet) : null,
        targetListDate:   Date.now() + 30 * 86_400_000,
        desiredSalePrice: record.listPriceCents,
        notes,
        windowDays:       "Seven",
      });
      setAgentRequested(true);
    });
  }

  function handleShowingUpdate(updated: ShowingRequest) {
    setShowings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  const pageTitle = record?.step === "done"
    ? `Manage Listing — ${property?.address || propertyId} | HomeGentic™`
    : "Activate FSBO Listing | HomeGentic™";

  if (record === undefined) {
    return (
      <>
        <PageHead><title>{pageTitle}</title></PageHead>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2.5rem 2rem", fontFamily: UI.sans, color: UI.inkLight }}>
          Loading…
        </div>
      </>
    );
  }

  const panel = (
    <FsboPanel
      propertyId={propertyId}
      score={score}
      verifiedJobCount={verifiedJobs}
      hasReport={hasReport}
      property={property}
      record={record}
      onChange={(rec) => { setRecord(rec); if (rec.step === "done") void refreshAll(); }}
    />
  );

  // ── Not activated ────────────────────────────────────────────────────────────
  if (listingState === "not-activated") {
    return (
      <>
        <PageHead><title>{pageTitle}</title></PageHead>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: isMobile ? "1.5rem 1rem" : "2.5rem 2rem", fontFamily: UI.sans }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" as const }}>
            <StatusBadge state="not-activated" />
          </div>

          <div
            data-testid="activate-listing-cta"
            style={{
              background:   UI.sageLight,
              border:       `1.5px solid ${V2_COLORS.cobalTint}`,
              borderRadius: V2_RADIUS.card,
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

          {error && <p role="alert" style={{ color: UI.rust, fontSize: "0.85rem" }}>{error}</p>}
          {panel}
        </div>
      </>
    );
  }

  // ── In progress (steps 1–3) ──────────────────────────────────────────────────
  if (listingState === "in-progress") {
    return (
      <>
        <PageHead><title>{pageTitle}</title></PageHead>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: isMobile ? "1.5rem 1rem" : "2.5rem 2rem", fontFamily: UI.sans }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" as const }}>
            <StatusBadge state="in-progress" />
            <button
              data-testid="discard-setup-btn"
              onClick={() => void act(async () => { await fsboService.deactivate(propertyId); await refreshAll(); })}
              disabled={busy}
              style={{ background: "transparent", border: "none", color: UI.inkLight, fontFamily: UI.mono, fontSize: "0.72rem", textDecoration: "underline", cursor: "pointer" }}
            >
              Discard setup
            </button>
          </div>
          {error && <p role="alert" style={{ color: UI.rust, fontSize: "0.85rem" }}>{error}</p>}
          {panel}
        </div>
      </>
    );
  }

  // ── Live management dashboard ────────────────────────────────────────────────
  const dom = daysOnMarket(record!.activatedAt);
  const showingCount = showings.length;
  const offerCount   = offers.length;

  return (
    <>
      <PageHead><title>{pageTitle}</title></PageHead>

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
                border:      `1px solid ${V2_COLORS.cobalTint}`,
                borderRadius: V2_RADIUS.pill,
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
                borderRadius: V2_RADIUS.pill,
                padding:     "0.35rem 0.85rem",
                cursor:      "pointer",
              }}
            >
              <TrendingDown size={12} />
              Take Down Listing
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ fontFamily: UI.sans, fontSize: "0.85rem", color: UI.rust, margin: "0 0 1rem" }}>{error}</p>
        )}

        {/* ── Take-down confirmation dialog ─────────────────────────────────── */}
        {showTakeDown && (
          <div
            data-testid="take-down-confirm-dialog"
            style={{
              background:   "#FFF5F5",
              border:       `1.5px solid ${UI.rust}60`,
              borderRadius: V2_RADIUS.card,
              padding:      "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <p style={{ fontFamily: UI.sans, fontWeight: 600, color: UI.ink, margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
              Remove this listing from the marketplace?
            </p>
            <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, margin: "0 0 1rem" }}>
              Your listing will be taken down immediately, and its showing requests, logged offers and price history will be deleted.
              You can list the home again at any time.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                data-testid="take-down-confirm"
                onClick={handleTakeDownConfirm}
                disabled={busy}
                style={{
                  background:   UI.rust,
                  color:        "#fff",
                  border:       "none",
                  borderRadius: V2_RADIUS.pill,
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
                  borderRadius: V2_RADIUS.pill,
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
                  borderRadius: V2_RADIUS.input,
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
              disabled={busy}
              style={{
                background:   UI.sage,
                color:        "#fff",
                border:       "none",
                borderRadius: V2_RADIUS.pill,
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

        {/* ── 360° Tour ─────────────────────────────────────────────────────── */}
        <section
          aria-label="360° Tour"
          style={{
            background:   UI.paper,
            border:       `1px solid ${UI.rule}`,
            borderRadius: V2_RADIUS.card,
            overflow:     "hidden",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{
            padding:       "0.85rem 1.25rem",
            borderBottom:  `1px solid ${UI.rule}`,
            fontFamily:    UI.mono,
            fontSize:      "0.72rem",
            fontWeight:    700,
            color:         UI.inkLight,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}>
            360° Tour
          </div>
          <div style={{ padding: "1.25rem" }}>
            {panoramas.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.25rem" }}>
                {panoramas.map((p) => (
                  <li
                    key={p.roomLabel}
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "space-between",
                      padding:        "0.4rem 0",
                      borderBottom:   `1px solid ${UI.rule}`,
                    }}
                  >
                    <span style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.ink }}>{p.roomLabel}</span>
                    <button
                      aria-label={`Remove room ${p.roomLabel}`}
                      onClick={() => void act(async () => {
                        await listingService.removePanorama(propertyId, p.roomLabel);
                        setPanoramas(await listingService.getPanoramas(propertyId));
                      })}
                      style={{
                        background:   "transparent",
                        color:        UI.rust,
                        border:       `1px solid ${UI.rust}60`,
                        borderRadius: V2_RADIUS.pill,
                        padding:      "0.25rem 0.65rem",
                        fontFamily:   UI.mono,
                        fontSize:     "0.65rem",
                        cursor:       "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.75rem" }}>
              <div>
                <label
                  htmlFor="panorama-room-label"
                  style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.3rem" }}
                >
                  Room Label
                </label>
                <input
                  id="panorama-room-label"
                  value={newRoomLabel}
                  onChange={(e) => setNewRoomLabel(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", border: `1px solid ${UI.rule}`, borderRadius: V2_RADIUS.input, fontFamily: UI.sans, fontSize: "0.875rem", width: "220px" }}
                />
              </div>
              <div>
                <label
                  htmlFor="panorama-360-photo"
                  style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.3rem" }}
                >
                  360° Photo
                </label>
                <input
                  id="panorama-360-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewPhotoFile(e.target.files?.[0] ?? null)}
                  style={{ fontFamily: UI.sans, fontSize: "0.875rem" }}
                />
              </div>
              <button
                data-testid="add-panorama-btn"
                onClick={handleAddTour}
                disabled={busy || addingTour}
                style={{
                  alignSelf:    "flex-start",
                  background:   UI.sage,
                  color:        "#fff",
                  border:       "none",
                  borderRadius: V2_RADIUS.pill,
                  padding:      "0.45rem 1.1rem",
                  fontFamily:   UI.mono,
                  fontSize:     "0.72rem",
                  fontWeight:   700,
                  cursor:       "pointer",
                }}
              >
                {addingTour ? "Uploading…" : "Add to Tour"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Score opt-in ──────────────────────────────────────────────────── */}
        <div style={{ margin: "1rem 0" }}>
          <button
            data-testid="score-optin-toggle"
            onClick={handleToggleScore}
            disabled={busy}
            aria-pressed={!scoreHidden}
            style={{
              display:     "inline-flex",
              alignItems:  "center",
              gap:         "0.5rem",
              background:  !scoreHidden ? UI.sageLight : "transparent",
              border:      `1.5px solid ${!scoreHidden ? V2_COLORS.cobalTint : UI.rule}`,
              borderRadius: V2_RADIUS.pill,
              padding:     "0.4rem 1rem",
              fontFamily:  UI.mono,
              fontSize:    "0.72rem",
              fontWeight:  !scoreHidden ? 700 : 400,
              color:       !scoreHidden ? "#1E6B1A" : UI.inkLight,
              cursor:      "pointer",
            }}
          >
            <Award size={13} />
            {!scoreHidden ? "Score shown on public listing" : "Score hidden from public listing"}
          </button>
        </div>

        {/* ── Showing inbox ──────────────────────────────────────────────────── */}
        <div data-testid="showing-inbox-section" style={{ marginBottom: "1.25rem" }}>
          <ShowingInbox requests={showings} onUpdate={handleShowingUpdate} />
        </div>

        {/* ── Showing calendar ──────────────────────────────────────────────── */}
        <div data-testid="showing-calendar-section" style={{ marginBottom: "1.25rem" }}>
          <ShowingCalendar requests={showings} />
        </div>

        {/* ── Offer panel ───────────────────────────────────────────────────── */}
        <div data-testid="offer-panel-section">
          <FsboOfferPanel propertyId={propertyId} listPriceCents={record!.listPriceCents} onOffersChange={setOffers} />
        </div>

        {/* ── 10.7.1 — Agent handoff ────────────────────────────────────────── */}
        <div data-testid="agent-handoff-section" style={{ marginTop: "1.25rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "1rem" }}>
          {agentRequested ? (
            <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.sage }}>
              ✓ Agent request sent. Agents can now send you proposals in Bid to List.
            </p>
          ) : (
            <>
              <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, marginBottom: "0.5rem" }}>
                Changed your mind? Let agents compete for your listing.
              </p>
              <button
                onClick={handleFindAgent}
                disabled={busy}
                style={{ background: "transparent", color: UI.sage, border: `1px solid ${V2_COLORS.cobalTint}`, borderRadius: V2_RADIUS.pill, padding: "0.45rem 1.1rem", fontFamily: UI.mono, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
              >
                Find me an agent
              </button>
            </>
          )}
        </div>

      </div>
    </>
  );
}
