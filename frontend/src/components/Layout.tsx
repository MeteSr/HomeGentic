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
  LayoutDashboard, TrendingUp, Users, Cpu, Radio, Home as HomeIcon, PlusSquare,
  Store, PanelLeft, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { jobService, type Job } from "@/services/job";
import { quoteService, type QuoteRequest } from "@/services/quote";
import { paymentService, type PlanTier } from "@/services/payment";
import { billService, type BillRecord } from "@/services/billService";
import { fsboService } from "@/services/fsbo";

// Inline tier→property limit so Layout never imports PLANS from payment,
// keeping the payment mock surface small in tests.
const TIER_PROPERTY_LIMIT: Partial<Record<PlanTier, number>> = {
  Free: 1, Basic: 1, Pro: 5, Premium: 20,
};
import { VoiceAgent } from "./VoiceAgent";
import UpgradeModal from "./UpgradeModal";
import { ActivityFeedDrawer } from "./ActivityFeedDrawer";
import { UserMenuPopover } from "./UserMenuPopover";
import { deriveEvents } from "@/services/activityFeed";
import { COLORS, FONTS } from "@/theme";

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
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout }             = useAuth();
  const { principal, profile } = useAuthStore();
  const { properties }         = usePropertyStore();
  const location               = useLocation();
  const navigate               = useNavigate();

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
  const isRealtor    = profile?.role === "Realtor";
  const isHomeowner  = !isContractor && !isRealtor;

  const atPropertyLimit  = properties.length >= (TIER_PROPERTY_LIMIT[userTier] ?? Infinity);
  const dashboardPath = isContractor ? "/contractor-dashboard" : "/dashboard";

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
        { to: "/agent-dashboard",   label: "Dashboard",  Icon: LayoutDashboard },
        { to: "/agent/marketplace", label: "Marketplace", Icon: Store },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard",    Icon: LayoutDashboard },
        { to: "/market",         label: "Market",       Icon: TrendingUp },
        { to: "/maintenance",    label: "Maintenance",  Icon: Cpu },
        { to: "/contractors", label: "Contractors", Icon: Users },
        { to: "/sensors",        label: "Sensors",      Icon: Radio },
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

  const sidebarW = sidebarOpen ? W_OPEN : W_CLOSED;

  // ── Shared sidebar item style helpers ────────────────────────────────────────

  const itemBase = (active = false): React.CSSProperties => ({
    display:         "flex",
    alignItems:      "center",
    gap:             sidebarOpen ? "0.75rem" : 0,
    height:          "2.75rem",
    paddingLeft:     sidebarOpen ? "1.125rem" : 0,
    justifyContent:  sidebarOpen ? "flex-start" : "center",
    overflow:        "hidden",
    whiteSpace:      "nowrap",
    color:           active ? COLORS.sage : COLORS.plumMid,
    background:      active ? COLORS.sageLight : "transparent",
    borderLeft:      active ? `2px solid ${COLORS.sage}` : "2px solid transparent",
    transition:      "color 0.15s, background 0.15s",
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: FONTS.sans,
    fontSize:   "0.875rem",
    fontWeight: 500,
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: COLORS.white }}>

      {/* ── Left sidebar (desktop) ──────────────────────────────────────────── */}
      <nav
        className="hf-sidebar"
        style={{ width: sidebarW }}
        aria-label="Main navigation"
      >
        {/* Header: branding + add-property + toggle */}
        <div style={{
          height:        "3.5rem",
          display:       "flex",
          alignItems:    "center",
          justifyContent: sidebarOpen ? "space-between" : "center",
          paddingLeft:   sidebarOpen ? "1.25rem" : 0,
          paddingRight:  sidebarOpen ? "0.75rem" : 0,
          flexShrink:    0,
        }}>
          {sidebarOpen && (
            <Link
              to={dashboardPath}
              style={{
                textDecoration: "none",
                fontFamily:     FONTS.serif,
                fontWeight:     900,
                fontSize:       "1.1rem",
                letterSpacing:  "-0.5px",
                color:          COLORS.plum,
                whiteSpace:     "nowrap",
              }}
            >
              Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              display:    "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      COLORS.plumMid,
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
                  navigate("/properties/new");
                }
              }}
              style={{ ...itemBase(), width: "100%", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = COLORS.plum; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = COLORS.plumMid; }}
            >
              <Plus size={17} style={{ flexShrink: 0 }} />
              {sidebarOpen && <span style={labelStyle}>Add property</span>}
            </button>
          )}
          {navLinks.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.to}
                to={link.to}
                title={!sidebarOpen ? link.label : undefined}
                style={{ ...itemBase(active), textDecoration: "none" }}
                onMouseEnter={(e: React.MouseEvent) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = COLORS.plum;
                }}
                onMouseLeave={(e: React.MouseEvent) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = COLORS.plumMid;
                }}
              >
                <link.Icon size={17} style={{ flexShrink: 0 }} />
                {sidebarOpen && (
                  <span style={{ ...labelStyle, fontWeight: active ? 600 : 500 }}>
                    {link.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom: activity bell + user menu button */}
        <div style={{ borderTop: `1px solid ${COLORS.rule}`, flexShrink: 0 }}>

          {/* Activity bell */}
          <button
            onClick={openFeed}
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
                  background:     COLORS.sage,
                  borderRadius:   "50%",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontFamily:     FONTS.sans,
                  fontSize:       "0.45rem",
                  color:          COLORS.white,
                  fontWeight:     700,
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
            {sidebarOpen && <span style={labelStyle}>Activity</span>}
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
                gap:     sidebarOpen ? "0.625rem" : 0,
              }}
            >
              {/* Avatar circle */}
              <div style={{
                width:          "26px",
                height:         "26px",
                borderRadius:   "50%",
                background:     COLORS.plum,
                color:          COLORS.white,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontFamily:     FONTS.sans,
                fontSize:       "0.6rem",
                fontWeight:     700,
                flexShrink:     0,
                letterSpacing:  "0.03em",
              }}>
                {initials}
              </div>
              {sidebarOpen && (
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
        style={{ marginLeft: sidebarW, flex: 1, minWidth: 0 }}
      >
        {/* Mobile-only top header */}
        <header
          className="hf-mobile-header"
          style={{ borderBottom: `1px solid ${COLORS.rule}` }}
        >
          <Link
            to={dashboardPath}
            style={{
              textDecoration: "none",
              fontFamily:     FONTS.serif,
              fontWeight:     900,
              fontSize:       "1.1rem",
              letterSpacing:  "-0.5px",
              color:          COLORS.plum,
              flex:           1,
            }}
          >
            Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </Link>

          {/* Bell */}
          <button
            onClick={openFeed}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}
            aria-label="Activity feed"
          >
            <Bell size={18} color={COLORS.plumMid} />
            {unread > 0 && (
              <span style={{
                position: "absolute", top: "4px", right: "4px",
                width: "14px", height: "14px",
                background: COLORS.sage, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: FONTS.sans, fontSize: "0.45rem", color: COLORS.white, fontWeight: 700,
              }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen
              ? <X    size={20} color={COLORS.plum} />
              : <Menu size={20} color={COLORS.plum} />
            }
          </button>
        </header>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="rsp-mobile-menu open">
            {navLinks.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`rsp-mobile-link${active ? " active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <link.Icon size={15} />
                  {link.label}
                </Link>
              );
            })}
            <div className="rsp-mobile-divider" />
            <button
              className="rsp-mobile-link"
              onClick={() => { logout(); setMobileOpen(false); }}
              style={{ color: COLORS.plum, borderBottom: "none" }}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        )}

        <main>{children}</main>
      </div>

      {/* Floating voice agent */}
      <VoiceAgent />

      {/* Upgrade modal — triggered from user menu */}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

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
