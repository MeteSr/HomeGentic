/**
 * Layout — collapsible left sidebar + main content
 *
 * Desktop: fixed sidebar (56 px collapsed / 216 px expanded) + scrollable main.
 *   Icons-only when collapsed; icon + label when expanded.
 *   State persisted to localStorage ("hf_sidebar": "open" | "closed").
 * Mobile (≤640 px): sidebar hidden; sticky top bar with hamburger overlay.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Bell, Wrench, ShieldAlert, Clock, CheckCircle2, AlertTriangle,
  LayoutDashboard, TrendingUp, Users, Cpu, Home as HomeIcon, PlusSquare,
  Settings, Store, ChevronLeft, ChevronRight, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { jobService, type Job } from "@/services/job";
import { VoiceAgent } from "./VoiceAgent";
import { COLORS, FONTS } from "@/theme";

// ─── Activity event types ─────────────────────────────────────────────────────

interface ActivityEvent {
  id:        string;
  type:      "pending_verification" | "warranty_expiring" | "job_pending_sig" | "recent_job";
  title:     string;
  detail:    string;
  href:      string;
  timestamp: number;
}

function deriveEvents(properties: any[], jobs: Job[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = Date.now();

  for (const p of properties) {
    if (p.verificationLevel === "PendingReview") {
      events.push({ id: `pv-${p.id}`, type: "pending_verification", title: "Verification pending", detail: `${p.address} — under review`, href: `/properties/${p.id}`, timestamp: Number(p.createdAt ?? now) / 1_000_000 });
    }
  }

  for (const j of jobs) {
    if (!j.verified && !j.homeownerSigned) {
      events.push({ id: `sig-${j.id}`, type: "job_pending_sig", title: "Awaiting your signature", detail: `${j.serviceType} · ${j.date}`, href: `/properties/${j.propertyId}`, timestamp: j.createdAt ?? now });
    }
  }

  for (const j of jobs) {
    if (!j.warrantyMonths || j.warrantyMonths <= 0) continue;
    const expiry   = new Date(j.date).getTime() + j.warrantyMonths * 30.44 * 86400000;
    const daysLeft = Math.round((expiry - now) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 90) {
      events.push({ id: `wty-${j.id}`, type: "warranty_expiring", title: `Warranty expires in ${daysLeft}d`, detail: `${j.serviceType} · ${j.isDiy ? "DIY" : j.contractorName ?? ""}`, href: `/properties/${j.propertyId}`, timestamp: expiry });
    }
  }

  const recent = [...jobs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 5);
  for (const j of recent) {
    if (!events.some((e) => e.id.startsWith(`sig-${j.id}`) || e.id.startsWith(`wty-${j.id}`))) {
      events.push({ id: `job-${j.id}`, type: "recent_job", title: j.serviceType, detail: `${j.isDiy ? "DIY" : j.contractorName ?? ""} · $${(j.amount / 100).toLocaleString()} · ${j.date}`, href: `/properties/${j.propertyId}`, timestamp: j.createdAt ?? now });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
}

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
  const navigate               = useNavigate();
  const location               = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    localStorage.getItem("hf_sidebar") !== "closed"
  );
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [feedOpen,    setFeedOpen]    = useState(false);
  const [feedJobs,    setFeedJobs]    = useState<Job[]>([]);
  const [feedLoaded,  setFeedLoaded]  = useState(false);
  const [lastReadAt,  setLastReadAt]  = useState<number>(() =>
    parseInt(localStorage.getItem("homegentic_feed_read") ?? "0", 10)
  );

  useEffect(() => {
    if (!feedOpen || feedLoaded) return;
    jobService.getAll().then(setFeedJobs).catch(() => {}).finally(() => setFeedLoaded(true));
  }, [feedOpen, feedLoaded]);

  const events = useMemo(() => deriveEvents(properties, feedJobs), [properties, feedJobs]);
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

  const isContractor = profile?.role === "Contractor";
  const isRealtor    = profile?.role === "Realtor";
  const isHomeowner  = !isContractor && !isRealtor;
  const dashboardPath = isContractor ? "/contractor-dashboard" : "/dashboard";

  const singlePropertyId =
    isHomeowner && properties.length === 1 ? String(properties[0].id) : null;
  const singlePropertyPath = singlePropertyId ? `/properties/${singlePropertyId}` : null;

  const navLinks: NavLink[] = isContractor
    ? [
        { to: "/contractor-dashboard", label: "Dashboard", Icon: LayoutDashboard },
        { to: "/settings",             label: "Settings",  Icon: Settings },
      ]
    : isRealtor
    ? [
        { to: "/agent-dashboard",   label: "Dashboard",  Icon: LayoutDashboard },
        { to: "/agent/marketplace", label: "Marketplace", Icon: Store },
        { to: "/settings",          label: "Settings",   Icon: Settings },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard",    Icon: LayoutDashboard },
        { to: "/market",         label: "Market",       Icon: TrendingUp },
        { to: "/maintenance",    label: "Maintenance",  Icon: Wrench },
        { to: "/contractors",    label: "Contractors",  Icon: Users },
        { to: "/sensors",        label: "Sensors",      Icon: Cpu },
        { to: "/listing/new",    label: "List Home",    Icon: HomeIcon },
        { to: "/properties/new", label: "Add Property", Icon: PlusSquare },
        { to: "/settings",       label: "Settings",     Icon: Settings },
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
        {/* Logo */}
        <div style={{
          height:          "3.5rem",
          display:         "flex",
          alignItems:      "center",
          paddingLeft:     sidebarOpen ? "1.25rem" : 0,
          justifyContent:  sidebarOpen ? "flex-start" : "center",
          borderBottom:    `1px solid ${COLORS.rule}`,
          flexShrink:      0,
        }}>
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
            {sidebarOpen
              ? <>Home<span style={{ color: COLORS.sage }}>Fax</span></>
              : <>H<span style={{ color: COLORS.sage }}>F</span></>
            }
          </Link>
        </div>

        {/* Nav links */}
        <div style={{ flex: 1, paddingTop: "0.375rem", overflowY: "auto", overflowX: "hidden" }}>
          {navLinks.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.to}
                to={link.to}
                title={!sidebarOpen ? link.label : undefined}
                style={{ ...itemBase(active), textDecoration: "none" }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = COLORS.plum;
                }}
                onMouseLeave={(e) => {
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

        {/* Bottom: activity, sign out, principal, collapse toggle */}
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
                  position:      "absolute",
                  top:           "-4px",
                  right:         "-5px",
                  width:         "14px",
                  height:        "14px",
                  background:    COLORS.sage,
                  borderRadius:  "50%",
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent:"center",
                  fontFamily:    FONTS.mono,
                  fontSize:      "0.45rem",
                  color:         COLORS.white,
                  fontWeight:    700,
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
            {sidebarOpen && <span style={labelStyle}>Activity</span>}
          </button>

          {/* Sign out */}
          <button
            onClick={logout}
            title={!sidebarOpen ? "Sign Out" : undefined}
            style={{ ...itemBase(), width: "100%", border: "none", cursor: "pointer" }}
          >
            <LogOut size={17} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={labelStyle}>Sign Out</span>}
          </button>

          {/* Principal — expanded only */}
          {sidebarOpen && principal && (
            <div style={{
              padding:        "0.25rem 1.125rem 0.375rem",
              fontFamily:     FONTS.mono,
              fontSize:       "0.55rem",
              color:          COLORS.plumMid,
              letterSpacing:  "0.04em",
              overflow:       "hidden",
              textOverflow:   "ellipsis",
              whiteSpace:     "nowrap",
            }}>
              {principal.slice(0, 14)}…
            </div>
          )}

          {/* Collapse / expand toggle */}
          <button
            onClick={toggleSidebar}
            title={sidebarOpen ? "Collapse" : "Expand"}
            style={{
              ...itemBase(),
              width:       "100%",
              border:      "none",
              borderTop:   `1px solid ${COLORS.rule}`,
              cursor:      "pointer",
            }}
          >
            {sidebarOpen
              ? <ChevronLeft  size={17} style={{ flexShrink: 0 }} />
              : <ChevronRight size={17} style={{ flexShrink: 0 }} />
            }
            {sidebarOpen && (
              <span style={{
                fontFamily:    FONTS.mono,
                fontSize:      "0.6rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>
                Collapse
              </span>
            )}
          </button>
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
            Home<span style={{ color: COLORS.sage }}>Fax</span>
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
                fontFamily: FONTS.mono, fontSize: "0.45rem", color: COLORS.white, fontWeight: 700,
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
            {principal && (
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: COLORS.plumMid, padding: "0.5rem 0" }}>
                {principal.slice(0, 16)}…
              </span>
            )}
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

      {/* ── Activity feed drawer ─────────────────────────────────────────────── */}
      {feedOpen && (
        <>
          <div
            onClick={() => setFeedOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(46,37,64,0.3)", zIndex: 200 }}
          />
          <div style={{
            position:       "fixed",
            top:            0,
            right:          0,
            bottom:         0,
            width:          "22rem",
            maxWidth:       "100vw",
            background:     COLORS.white,
            borderLeft:     `1px solid ${COLORS.rule}`,
            zIndex:         201,
            display:        "flex",
            flexDirection:  "column",
            overflowY:      "auto",
          }}>
            {/* Header */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "1rem 1.25rem",
              borderBottom:   `1px solid ${COLORS.rule}`,
              background:     COLORS.white,
              flexShrink:     0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Bell size={14} color={COLORS.sage} />
                <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: COLORS.plum }}>
                  Activity
                </span>
              </div>
              <button onClick={() => setFeedOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid }}>
                <X size={16} />
              </button>
            </div>

            {/* Events */}
            {!feedLoaded ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                <div className="spinner-lg" />
              </div>
            ) : events.length === 0 ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
                <CheckCircle2 size={32} color={COLORS.sageMid} style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: COLORS.plumMid }}>
                  Nothing to catch up on.
                </p>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                {events.map((event) => {
                  const icons: Record<ActivityEvent["type"], React.ReactNode> = {
                    pending_verification: <ShieldAlert size={14} color={COLORS.plumMid} />,
                    warranty_expiring:    <AlertTriangle size={14} color={COLORS.sage} />,
                    job_pending_sig:      <Clock size={14} color={COLORS.sage} />,
                    recent_job:           <Wrench size={14} color={COLORS.plumMid} />,
                  };
                  const isUnread = event.timestamp > lastReadAt;
                  return (
                    <div
                      key={event.id}
                      onClick={() => { setFeedOpen(false); navigate(event.href); }}
                      style={{
                        display:        "flex",
                        alignItems:     "flex-start",
                        gap:            "0.875rem",
                        padding:        "0.875rem 1.25rem",
                        borderBottom:   `1px solid ${COLORS.rule}`,
                        background:     isUnread ? COLORS.sageLight : "transparent",
                        cursor:         "pointer",
                        transition:     "background 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? COLORS.sageLight : "transparent"; }}
                    >
                      <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icons[event.type]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.125rem" }}>
                          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: COLORS.plum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {event.title}
                          </p>
                          {isUnread && (
                            <span style={{ width: "6px", height: "6px", background: COLORS.sage, borderRadius: "50%", flexShrink: 0 }} />
                          )}
                        </div>
                        <p style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: COLORS.plumMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {event.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
