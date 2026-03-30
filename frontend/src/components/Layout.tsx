import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, Bell, Wrench, ShieldAlert, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { jobService, type Job } from "@/services/job";
import { VoiceAgent } from "./VoiceAgent";
import { COLORS, FONTS } from "@/theme";

// ─── Activity event types ──────────────────────────────────────────────────────

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

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const { principal, profile } = useAuthStore();
  const { properties } = usePropertyStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [feedOpen,    setFeedOpen]    = useState(false);
  const [feedJobs,    setFeedJobs]    = useState<Job[]>([]);
  const [feedLoaded,  setFeedLoaded]  = useState(false);
  const [lastReadAt,  setLastReadAt]  = useState<number>(() => {
    return parseInt(localStorage.getItem("homefax_feed_read") ?? "0", 10);
  });

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
    localStorage.setItem("homefax_feed_read", String(now));
  };

  const isContractor = profile?.role === "Contractor";
  const isRealtor    = profile?.role === "Realtor";
  const dashboardPath = isContractor ? "/contractor-dashboard" : "/dashboard";

  const navLinks = isContractor
    ? [
        { to: "/contractor-dashboard", label: "Dashboard" },
        { to: "/settings",             label: "Settings" },
      ]
    : isRealtor
    ? [
        { to: "/agent-dashboard",   label: "Dashboard" },
        { to: "/agent/marketplace", label: "Marketplace" },
        { to: "/settings",          label: "Settings" },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard" },
        { to: "/market",         label: "Market" },
        { to: "/maintenance",    label: "Maintenance" },
        { to: "/contractors",    label: "Contractors" },
        { to: "/sensors",        label: "Sensors" },
        { to: "/listing/new",    label: "List Home" },
        { to: "/properties/new", label: "Add Property" },
        { to: "/settings",       label: "Settings" },
      ];

  const linkStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: FONTS.sans,
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 500,
    textDecoration: "none",
    color: active ? COLORS.sage : COLORS.plumMid,
    padding: "0 1.125rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    transition: "color 0.15s",
    borderBottom: active ? `2px solid ${COLORS.sage}` : "2px solid transparent",
  });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: COLORS.white }}>
      {/* Nav */}
      <header
        style={{
          backgroundColor: COLORS.white,
          borderBottom: `1px solid ${COLORS.rule}`,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            height: "3.5rem",
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 1.5rem",
          }}
        >
          {/* Logo */}
          <Link
            to={dashboardPath}
            style={{
              display: "flex",
              alignItems: "center",
              paddingRight: "1.75rem",
              marginRight: "0.5rem",
              textDecoration: "none",
              fontFamily: FONTS.serif,
              fontWeight: 900,
              fontSize: "1.1rem",
              letterSpacing: "-0.5px",
              color: COLORS.plum,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Home<span style={{ color: COLORS.sage }}>Fax</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="rsp-nav-desktop" style={{ flex: 1 }}>
            {navLinks.map((link) => {
              const active = location.pathname === link.to || location.pathname.startsWith(link.to + "/");
              return (
                <Link key={link.to} to={link.to} style={linkStyle(active)}>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Activity feed bell */}
          <button
            onClick={openFeed}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.75rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Activity feed"
          >
            <Bell size={18} color={feedOpen ? COLORS.sage : COLORS.plumMid} />
            {unread > 0 && (
              <span style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.375rem",
                width: "0.875rem",
                height: "0.875rem",
                background: COLORS.sage,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTS.mono,
                fontSize: "0.45rem",
                color: COLORS.white,
                fontWeight: 700,
              }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Desktop user area */}
          <div
            className="rsp-nav-user"
            style={{ paddingLeft: "1rem" }}
          >
            {principal && (
              <span style={{
                fontFamily: FONTS.mono,
                fontSize: "0.65rem",
                color: COLORS.plumMid,
                letterSpacing: "0.04em",
              }}>
                {principal.slice(0, 8)}…
              </span>
            )}
            <button
              onClick={logout}
              style={{
                fontFamily: FONTS.sans,
                fontSize: "0.8rem",
                fontWeight: 500,
                color: COLORS.plumMid,
                background: "none",
                border: `1.5px solid ${COLORS.rule}`,
                padding: "0.35rem 1rem",
                borderRadius: 100,
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = COLORS.plum;
                (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.plum;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = COLORS.plumMid;
                (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.rule;
              }}
            >
              Sign Out
            </button>
          </div>

          {/* Hamburger — mobile */}
          <button
            className="rsp-hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            style={{ marginLeft: "auto", padding: "0 0.5rem" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={20} color={COLORS.plum} /> : <Menu size={20} color={COLORS.plum} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        <div className={`rsp-mobile-menu${menuOpen ? " open" : ""}`}>
          {navLinks.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`rsp-mobile-link${active ? " active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="rsp-mobile-divider" />
          {principal && (
            <span style={{
              fontFamily: FONTS.mono,
              fontSize: "0.65rem",
              color: COLORS.plumMid,
              padding: "0.5rem 0",
            }}>
              {principal.slice(0, 16)}…
            </span>
          )}
          <button
            className="rsp-mobile-link"
            onClick={() => { logout(); setMenuOpen(false); }}
            style={{ color: COLORS.plum, borderBottom: "none" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main>{children}</main>

      {/* Floating voice agent */}
      <VoiceAgent />

      {/* Activity feed drawer */}
      {feedOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setFeedOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(46,37,64,0.3)", zIndex: 200 }}
          />
          {/* Drawer */}
          <div style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "22rem",
            maxWidth: "100vw",
            background: COLORS.white,
            borderLeft: `1px solid ${COLORS.rule}`,
            zIndex: 201,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              borderBottom: `1px solid ${COLORS.rule}`,
              background: COLORS.white,
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Bell size={14} color={COLORS.sage} />
                <span style={{
                  fontFamily: FONTS.sans,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: COLORS.plum,
                }}>
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
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.875rem",
                        padding: "0.875rem 1.25rem",
                        borderBottom: `1px solid ${COLORS.rule}`,
                        background: isUnread ? COLORS.sageLight : "transparent",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? COLORS.sageLight : "transparent"; }}
                    >
                      <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icons[event.type]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.125rem" }}>
                          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: COLORS.plum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</p>
                          {isUnread && <span style={{ width: "6px", height: "6px", background: COLORS.sage, borderRadius: "50%", flexShrink: 0 }} />}
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
