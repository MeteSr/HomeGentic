/**
 * Layout — collapsible left sidebar + main content
 *
 * Desktop: fixed sidebar (56 px collapsed / 216 px expanded) + scrollable main.
 *   Icons-only when collapsed; icon + label when expanded.
 *   State persisted to localStorage ("hf_sidebar": "open" | "closed").
 * Mobile (≤640 px): sidebar hidden; sticky top bar with hamburger overlay.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, LogOut, Plus,
  LayoutDashboard, TrendingUp, Users, Wrench, Radio, Home as HomeIcon, PlusSquare,
  PanelLeft, Menu, X, Briefcase, Users2, User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
// keeping the payment mock surface small in tests.
const TIER_PROPERTY_LIMIT: Partial<Record<PlanTier, number>> = {
  Basic: 1, Pro: 5, Premium: 20,
};
import UpgradeModal from "./UpgradeModal";
import { ActivityFeedDrawer } from "./ActivityFeedDrawer";
import { UserMenuPopover } from "./UserMenuPopover";
import { deriveEvents } from "@/services/activityFeed";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

// Re-export for consumers that imported these from Layout
export type { ActivityEvent } from "@/services/activityFeed";
export { deriveEvents } from "@/services/activityFeed";

// ─── Sidebar dimensions ───────────────────────────────────────────────────────

const W_OPEN   = 216;
const W_CLOSED = 56;

// ─── Nav link definition ──────────────────────────────────────────────────────

interface NavLink {
  to:    string;
  label: string;
  Icon:  React.ElementType;
  badge?: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout }             = useAuth();
  const { principal, profile } = useAuthStore();
  const { properties }         = usePropertyStore();
  const location               = useLocation();
  const navigate               = useNavigate();
  const { isTablet }           = useBreakpoint();

  const [sidebarOpen,  setSidebarOpen]  = useState(() =>
    localStorage.getItem("hf_sidebar") !== "closed"
  );
  const [mobileOpen,   setMobileOpen]   = useState(false);
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

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("hf_sidebar", next ? "open" : "closed");
      return next;
    });
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
  const singlePropertyPath = singlePropertyId ? `/properties/${singlePropertyId}` : null;

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
        { to: "/contractor-dashboard", label: "Dashboard", Icon: LayoutDashboard },
      ]
    : isRealtor
    ? [
        { to: "/agents/browse",  label: "Browse listings", Icon: Briefcase },
        { to: "/agents/bids",    label: "My bids",          Icon: LayoutDashboard },
        { to: "/agents/verify",  label: "Verification",     Icon: User },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard",    Icon: LayoutDashboard },
        ...(singlePropertyId
          ? [{ to: `/properties/${singlePropertyId}`, label: "Property", Icon: HomeIcon }]
          : []),
        { to: "/market",         label: "Market",       Icon: TrendingUp },
        { to: "/maintenance",    label: "Maintenance",  Icon: Wrench },
        { to: "/jobs",           label: "Jobs",         Icon: Briefcase, badge: feedJobs.filter(j => !j.verified && j.status !== "rejected_by_homeowner").length || undefined },
        { to: "/contractors",    label: "Contractors",  Icon: Users },
        { to: "/sensors",        label: "Sensors",      Icon: Radio },
        { to: "/people",         label: "People",       Icon: Users2 },
        ...(singlePropertyId && hasActiveListing
          ? [{ to: `/my-listing/${singlePropertyId}`, label: "My Listing", Icon: HomeIcon }]
          : []),
      ];

  const isActive = (link: NavLink) => {
    const directMatch =
      location.pathname === link.to || location.pathname.startsWith(link.to + "/");
    const singlePropMatch =
      link.to === "/dashboard" &&
      singlePropertyPath !== null &&
      (location.pathname === singlePropertyPath ||
        location.pathname.startsWith(singlePropertyPath + "/"));
    return directMatch || singlePropMatch;
  };

  // On tablet, force icon-only (collapsed) display regardless of localStorage state
  const effectivelyCollapsed = isTablet || !sidebarOpen;
  const sidebarW = isTablet ? W_CLOSED : (sidebarOpen ? W_OPEN : W_CLOSED);

  // ── Shared sidebar item style helpers ────────────────────────────────────────

  const itemBase = (active = false): React.CSSProperties => ({
    display:         "flex",
    alignItems:      "center",
    gap:             effectivelyCollapsed ? 0 : "0.75rem",
    height:          "2.75rem",
    paddingLeft:     effectivelyCollapsed ? 0 : "1.125rem",
    justifyContent:  effectivelyCollapsed ? "center" : "flex-start",
    overflow:        "hidden",
    whiteSpace:      "nowrap",
    color:           active ? V2_COLORS.blue : V2_COLORS.muted,
    background:      active ? V2_COLORS.lblue : "transparent",
    borderLeft:      active ? `3px solid ${V2_COLORS.blue}` : "3px solid transparent",
    transition:      "color 0.15s, background 0.15s",
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: V2_FONTS.body,
    fontSize:   "0.875rem",
    fontWeight: 500,
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: V2_COLORS.paper }}>

      {/* ── Left sidebar (desktop) ──────────────────────────────────────────── */}
      <nav
        className="hf-sidebar"
        style={{ width: sidebarW }}
        aria-label="Main navigation"
        aria-hidden={addPropOpen || undefined}
      >
        {/* Header: branding + add-property + toggle */}
        <div style={{
          height:        "3.5rem",
          display:       "flex",
          alignItems:    "center",
          justifyContent: effectivelyCollapsed ? "center" : "space-between",
          paddingLeft:   effectivelyCollapsed ? 0 : "1.25rem",
          paddingRight:  effectivelyCollapsed ? 0 : "0.75rem",
          flexShrink:    0,
        }}>
          {!effectivelyCollapsed && (
            <Link
              to={dashboardPath}
              style={{
                textDecoration: "none",
                fontFamily:     V2_FONTS.display,
                fontWeight:     900,
                fontSize:       "1.1rem",
                letterSpacing:  "-0.5px",
                color:          V2_COLORS.ink,
                whiteSpace:     "nowrap",
              }}
            >
              Home<span style={{ color: V2_COLORS.blue, fontStyle: "normal", fontWeight: 700 }}>Gentic™</span>
            </Link>
          )}
          <button
            onClick={isTablet ? undefined : toggleSidebar}
            title={effectivelyCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={effectivelyCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              display:    "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      V2_COLORS.muted,
              padding:    "0.375rem",
              borderRadius: "0.25rem",
              flexShrink: 0,
            }}
          >
            <PanelLeft size={18} />
          </button>
        </div>

        {/* Nav links */}
        <div style={{ flex: 1, paddingTop: "0.375rem", overflowY: "auto", overflowX: "hidden" }}>
          {/* Add property button — sits just below the toggle, mirrors Claude's sidebar */}
          {isHomeowner && (
            <button
              aria-label="Add property"
              title={!sidebarOpen ? "Add property" : undefined}
              onClick={() => {
                if (atPropertyLimit && userTier !== "Premium") {
                  setUpgradeOpen(true);
                } else {
                  openAddProp();
                }
              }}
              style={{ ...itemBase(), width: "100%", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = V2_COLORS.blue; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = V2_COLORS.muted; }}
            >
              <Plus size={17} style={{ flexShrink: 0 }} />
              {!effectivelyCollapsed && <span style={labelStyle}>Add property</span>}
            </button>
          )}
          {navLinks.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.to}
                to={link.to}
                title={!sidebarOpen ? link.label : undefined}
                aria-current={active ? "page" : undefined}
                style={{ ...itemBase(active), textDecoration: "none" }}
                onMouseEnter={(e: React.MouseEvent) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = V2_COLORS.blue;
                }}
                onMouseLeave={(e: React.MouseEvent) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = V2_COLORS.muted;
                }}
              >
                  <link.Icon size={17} style={{ flexShrink: 0 }} />
                {!effectivelyCollapsed && (
                  <span style={{ ...labelStyle, fontWeight: active ? 600 : 500, flex: 1 }}>
                    {link.label}
                  </span>
                )}
                {!effectivelyCollapsed && link.badge != null && link.badge > 0 && (
                  <span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#fff", background: V2_COLORS.blue, borderRadius: "1rem", padding: "1px 6px", lineHeight: 1.4 }}>
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom: activity bell + user menu button */}
        <div style={{ borderTop: `1px solid ${V2_COLORS.border}`, flexShrink: 0 }}>

          {/* Activity bell */}
          <button
            onClick={openFeed}
            aria-label="Activity"
            title={!sidebarOpen ? "Activity" : undefined}
            style={{ ...itemBase(), width: "100%", border: "none", cursor: "pointer" }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Bell size={17} />
              {unread > 0 && (
                <span style={{
                  position:       "absolute",
                  top:            "-4px",
                  right:          "-5px",
                  width:          "14px",
                  height:         "14px",
                  background:     V2_COLORS.blue,
                  borderRadius:   "50%",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontFamily:     V2_FONTS.body,
                  fontSize:       "0.45rem",
                  color:          V2_COLORS.paper,
                  fontWeight:     700,
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
            {!effectivelyCollapsed && <span style={labelStyle}>Activity</span>}
          </button>

          {/* User menu anchor */}
          <div ref={userMenuRef} style={{ position: "relative" }}>
            {userMenuOpen && (
              <UserMenuPopover
                displayName={displayName}
                onClose={() => setUserMenuOpen(false)}
                onUpgrade={() => setUpgradeOpen(true)}
              />
            )}

            {/* Avatar button */}
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              aria-label={displayName}
              title={!sidebarOpen ? displayName : undefined}
              style={{
                ...itemBase(),
                width:   "100%",
                border:  "none",
                cursor:  "pointer",
                gap:     effectivelyCollapsed ? 0 : "0.625rem",
              }}
            >
              {/* Avatar circle */}
              <div style={{
                width:          "26px",
                height:         "26px",
                borderRadius:   "50%",
                background:     V2_COLORS.ink,
                color:          V2_COLORS.paper,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontFamily:     V2_FONTS.body,
                fontSize:       "0.6rem",
                fontWeight:     700,
                flexShrink:     0,
                letterSpacing:  "0.03em",
              }}>
                {initials}
              </div>
              {!effectivelyCollapsed && (
                <span style={{ ...labelStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
                  {displayName}
                </span>
              )}
            </button>
          </div>

        </div>
      </nav>

      {/* ── Content column ──────────────────────────────────────────────────── */}
      <div
        className="hf-main"
        style={{ marginLeft: isTablet ? W_CLOSED : sidebarW, flex: 1, minWidth: 0 }}
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
            { to: "/dashboard",                                          label: "Home",        Icon: LayoutDashboard },
            { to: singlePropertyId ? `/properties/${singlePropertyId}` : "/dashboard", label: "Property",    Icon: HomeIcon },
            { to: "/jobs",                                               label: "Jobs",        Icon: Briefcase },
            { to: "/maintenance",                                        label: "Maintenance", Icon: Wrench },
            { to: "/settings",                                           label: "Account",     Icon: User },
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
