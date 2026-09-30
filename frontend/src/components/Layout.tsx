/**
 * Layout — the app shell for every page except the dashboard.
 *
 * Desktop: the same chrome as the v3 dashboard (components/dashboardV3/chrome):
 *   a top bar (brand, current page, activity, account) and a left rail of
 *   pill chips, so leaving the dashboard doesn't drop you into a different app.
 * Mobile (≤640 px): the rail and top bar are hidden; a sticky top bar and a
 *   bottom tab bar take over (see .hf-* rules in index.css).
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Plus,
  LayoutDashboard, Wrench, Home as HomeIcon,
  Briefcase, User,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import AddPropertyModal from "@/components/AddPropertyModal";
import { jobService, type Job } from "@/services/job";
import { quoteService, type QuoteRequest } from "@/services/quote";
import { paymentService, type PlanTier } from "@/services/payment";
import { billService, type BillRecord } from "@/services/billService";
import { fsboService } from "@/services/fsbo";

// Inline tier→property limit so Layout never imports PLANS from payment,
// keeping the payment mock surface small in tests. Pro (the only paid
// homeowner plan) gets 20 properties; Free gets 1.
const TIER_PROPERTY_LIMIT: Partial<Record<PlanTier, number>> = {
  Free: 1, Pro: 20,
};
import UpgradeModal from "./UpgradeModal";
import { ActivityFeedDrawer } from "./ActivityFeedDrawer";
import { UserMenuPopover } from "./UserMenuPopover";
import { deriveEvents } from "@/services/activityFeed";
import { V2_COLORS, V2_FONTS } from "@/theme";
import {
  BrandMark, HeaderDivider, RailChipCount, railChipStyle,
  RAIL_WIDTH, SHELL_GUTTER, RAIL_GAP,
} from "@/components/dashboardV3/chrome";

// Re-export for consumers that imported these from Layout
export type { ActivityEvent } from "@/services/activityFeed";
export { deriveEvents } from "@/services/activityFeed";

// ─── Shell dimensions ─────────────────────────────────────────────────────────

/** Height of the desktop top bar; the rail and page content sit below it. */
const HEADER_H = 60;
/** Left edge of page content: gutter + rail + gap, matching the dashboard. */
const CONTENT_LEFT = SHELL_GUTTER + RAIL_WIDTH + RAIL_GAP;

// ─── Nav link definition ──────────────────────────────────────────────────────

interface NavLink {
  to:    string;
  label: string;
  badge?: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout({ children, hideSidebar = false }: { children: React.ReactNode; hideSidebar?: boolean }) {
  const { principal, profile } = useAuthStore();
  const { properties }         = usePropertyStore();
  const location               = useLocation();
  const navigate               = useNavigate();

  const [feedOpen,     setFeedOpen]     = useState(false);
  const [feedJobs,     setFeedJobs]     = useState<Job[]>([]);
  const [feedQuotes,   setFeedQuotes]   = useState<QuoteRequest[]>([]);
  const [feedBills,    setFeedBills]    = useState<BillRecord[]>([]);
  const [feedLoaded,   setFeedLoaded]   = useState(false);
  const [lastReadAt,   setLastReadAt]   = useState<number>(() =>
    parseInt(localStorage.getItem("homegentic_feed_read") ?? "0", 10)
  );
  const [userMenuOpen,  setUserMenuOpen]  = useState(false);
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const { isOpen: addPropOpen, open: openAddProp, close: closeAddProp } = useAddPropertyStore();
  const [userTier,        setUserTier]        = useState<PlanTier>("Free");
  const [hasActiveListing, setHasActiveListing] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((err: unknown) => {
      console.error("[Layout] subscription fetch failed — tier will default to Free:", err);
    });
  }, [principal]);

  useEffect(() => {
    if (!feedOpen || feedLoaded) return;
    const propertyIds = properties.map((p: any) => String(p.id));
    Promise.all([
      jobService.getAll().catch(() => [] as Job[]),
      quoteService.getRequests().catch(() => [] as QuoteRequest[]),
      Promise.all(
        propertyIds.map((pid) => billService.getBillsForProperty(pid).catch(() => [] as BillRecord[]))
      ).then((nested) => nested.flat()),
    ]).then(([jobs, quotes, bills]) => {
      setFeedJobs(jobs);
      setFeedQuotes(quotes);
      setFeedBills(bills);
    }).finally(() => setFeedLoaded(true));
  }, [feedOpen, feedLoaded]);

  const events = useMemo(() => deriveEvents(properties, feedJobs, feedQuotes, feedBills), [properties, feedJobs, feedQuotes, feedBills]);
  const unread  = events.filter((e) => e.timestamp > lastReadAt).length;

  const openFeed = () => {
    setFeedOpen(true);
    const now = Date.now();
    setLastReadAt(now);
    localStorage.setItem("homegentic_feed_read", String(now));
  };

  const displayName = profile?.email || (principal ? principal.slice(0, 8) + "…" : "User");
  const initials    = (profile?.email || "U")[0].toUpperCase();

  const isContractor = profile?.role === "Contractor";
  const isRealtor     = profile?.role === "Realtor";
  const isHomeowner  = !isContractor && !isRealtor;

  const atPropertyLimit  = properties.length >= (TIER_PROPERTY_LIMIT[userTier] ?? Infinity);
  const dashboardPath = isContractor ? "/contractor-dashboard" : isRealtor ? "/agents/browse" : "/dashboard";

  const singlePropertyId =
    isHomeowner && properties.length === 1 ? String(properties[0].id) : null;

  // Re-check FSBO state on every navigation so "My Listing" appears as soon as a listing is created.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (singlePropertyId) {
      setHasActiveListing(!!fsboService.getRecord(singlePropertyId)?.isFsbo);
    } else {
      setHasActiveListing(false);
    }
  }, [singlePropertyId, location.pathname]);

  const navLinks: NavLink[] = isContractor
    ? [
        { to: "/contractor-dashboard", label: "Dashboard" },
      ]
    : isRealtor
    ? [
        { to: "/agents/browse",  label: "Browse listings" },
        { to: "/agents/bids",    label: "My bids" },
        { to: "/agents/verify",  label: "Verification" },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard" },
        ...(singlePropertyId
          ? [{ to: `/properties/${singlePropertyId}`, label: "Property" }]
          : []),
        { to: "/market",         label: "Market" },
        { to: "/maintenance",    label: "Maintenance" },
        { to: "/jobs",           label: "Jobs", badge: feedJobs.filter(j => !j.verified && j.status !== "rejected_by_homeowner").length || undefined },
        { to: "/contractors",    label: "Contractors" },
        { to: "/sensors",        label: "Sensors" },
        { to: "/people",         label: "People" },
        ...(singlePropertyId && hasActiveListing
          ? [{ to: `/my-listing/${singlePropertyId}`, label: "My Listing" }]
          : []),
      ];

  const isActive = (link: NavLink) => {
    return location.pathname === link.to || location.pathname.startsWith(link.to + "/");
  };

  const activeLink = navLinks.find(isActive);

  const openAddProperty = () => {
    // Pro is the top homeowner tier — there's no higher plan to offer, so let
    // the add-property flow surface its own at-capacity message instead.
    if (atPropertyLimit && userTier !== "Pro") {
      setUpgradeOpen(true);
    } else {
      openAddProp();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: V2_COLORS.paper }}>

      {/* ── Top bar (desktop) — same chrome as the dashboard's header ─────── */}
      {!hideSidebar && (
      <header
        className="hf-shell-header hg-v3"
        data-theme="light"
        style={{ height: HEADER_H, padding: `0 ${SHELL_GUTTER}px` }}
        aria-hidden={addPropOpen || undefined}
      >
        <Link to={dashboardPath} aria-label="HomeGentic home" style={{ textDecoration: "none" }}>
          <BrandMark />
        </Link>
        <HeaderDivider />
        <div style={{ flex: 1, minWidth: 0, font: "500 10px/1 'JetBrains Mono',monospace", letterSpacing: ".14em", color: "var(--hg-muted)", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeLink?.label ?? ""}
        </div>

        <button
          onClick={openFeed}
          aria-label="Activity"
          title="Activity"
          style={{ position: "relative", flex: "none", width: 32, height: 32, borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Bell size={16} color="var(--hg-ink-3)" strokeWidth={1.8} />
          {unread > 0 && (
            <span style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "#2B34FF", display: "flex", alignItems: "center", justifyContent: "center", font: "700 9px/1 'Hanken Grotesk',sans-serif", color: "#FCFCFD" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <HeaderDivider />
        <div ref={userMenuRef} style={{ position: "relative", flex: "none" }}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-label={displayName}
            title={displayName}
            style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--hg-blue-fill)", border: "1.5px solid var(--hg-blue-edge)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", font: "700 12px/1 'JetBrains Mono',monospace", color: "var(--hg-blue-ink)", padding: 0 }}
          >
            {initials}
          </button>
          {userMenuOpen && (
            <UserMenuPopover
              displayName={displayName}
              onClose={() => setUserMenuOpen(false)}
              onUpgrade={() => setUpgradeOpen(true)}
              anchor="top-right"
            />
          )}
        </div>
      </header>
      )}

      {/* ── Left rail (desktop) — pill chips, as on the dashboard ────────── */}
      {!hideSidebar && (
      <nav
        className="hf-sidebar hg-v3"
        data-theme="light"
        style={{ top: HEADER_H, width: CONTENT_LEFT, padding: `4px ${RAIL_GAP}px 16px ${SHELL_GUTTER}px` }}
        aria-label="Main navigation"
        aria-hidden={addPropOpen || undefined}
      >
        <div style={{ width: RAIL_WIDTH, display: "flex", flexDirection: "column", gap: 3, paddingRight: 8, boxSizing: "border-box" }}>
          {navLinks.map((link) => {
            const active = link === activeLink;
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                style={railChipStyle({ on: active })}
              >
                {link.label}
                <RailChipCount>{link.badge ? link.badge : ""}</RailChipCount>
              </Link>
            );
          })}
          {isHomeowner && (
            <>
              <div style={{ height: 1, background: "var(--hg-line)", margin: "7px 4px" }} />
              <button
                aria-label="Add property"
                onClick={openAddProperty}
                style={{ ...railChipStyle({ dashed: true }), width: "100%" }}
              >
                Add property
                <Plus size={11} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </nav>
      )}

      {/* ── Content column ──────────────────────────────────────────────────── */}
      <div
        className={hideSidebar ? "hf-main" : "hf-main hf-main--shell"}
        style={hideSidebar ? { flex: 1, minWidth: 0 } : { marginLeft: CONTENT_LEFT, paddingTop: HEADER_H, minWidth: 0, "--hf-shell-top": `${HEADER_H}px` } as React.CSSProperties}
        aria-hidden={addPropOpen || undefined}
      >
        {/* Mobile-only top header */}
        <header
          className="hf-mobile-header"
          style={{ borderBottom: `1px solid ${V2_COLORS.border}` }}
        >
          <Link
            to={dashboardPath}
            style={{
              textDecoration: "none",
              fontFamily:     V2_FONTS.display,
              fontWeight:     900,
              fontSize:       "1.1rem",
              letterSpacing:  "-0.5px",
              color:          V2_COLORS.ink,
              flex:           1,
            }}
          >
            Home<span style={{ color: V2_COLORS.blue, fontStyle: "normal", fontWeight: 700 }}>Gentic™</span>
          </Link>

          {/* Bell */}
          <button
            onClick={openFeed}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}
            aria-label="Activity feed"
          >
            <Bell size={18} color={V2_COLORS.muted} />
            {unread > 0 && (
              <span style={{
                position: "absolute", top: "4px", right: "4px",
                width: "14px", height: "14px",
                background: V2_COLORS.blue, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: V2_FONTS.body, fontSize: "0.45rem", color: V2_COLORS.paper, fontWeight: 700,
              }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </header>

        <main className="hf-main-content">{children}</main>

        {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
        {(() => {
          const mobileTabLinks = isContractor ? [] : [
            { to: "/dashboard", label: "Home", Icon: LayoutDashboard },
            // Only shown when there's a single property to point at — otherwise
            // this tab had no real destination of its own and fell back to
            // "/dashboard", colliding with the Home tab above (duplicate React
            // key, and both tabs showing active at once on /dashboard).
            ...(singlePropertyId
              ? [{ to: `/properties/${singlePropertyId}`, label: "Property", Icon: HomeIcon }]
              : []),
            { to: "/jobs",        label: "Jobs",        Icon: Briefcase },
            { to: "/maintenance", label: "Maintenance", Icon: Wrench },
            { to: "/settings",    label: "Account",     Icon: User },
          ];
          return (
            <>
              {/* FAB — log work */}
              <button
                className="hf-mobile-fab"
                onClick={() => navigate("/jobs/new")}
                aria-label="Log maintenance"
              >
                <Plus size={22} color="#FCFCFD" strokeWidth={2.5} />
              </button>

              {/* Bottom nav */}
              <nav className="hf-bottom-nav" aria-label="Main navigation">
                {mobileTabLinks.map(({ to, label, Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`hf-bottom-tab${active ? " active" : ""}`}
                      aria-label={label}
                    >
                      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                      <span className="hf-bottom-tab-label">{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </>
          );
        })()}
      </div>

      {/* Upgrade modal — triggered from user menu */}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
      <AddPropertyModal open={addPropOpen} onClose={closeAddProp} />

      {/* Activity feed drawer */}
      {feedOpen && (
        <ActivityFeedDrawer
          events={events}
          feedLoaded={feedLoaded}
          lastReadAt={lastReadAt}
          onClose={() => setFeedOpen(false)}
        />
      )}
    </div>
  );
}
