import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, Bell, Wrench, ShieldAlert, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { jobService, type Job } from "@/services/job";
import { VoiceAgent } from "./VoiceAgent";

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

  // Properties pending review
  for (const p of properties) {
    if (p.verificationLevel === "PendingReview") {
      events.push({ id: `pv-${p.id}`, type: "pending_verification", title: "Verification pending", detail: `${p.address} — under review`, href: `/properties/${p.id}`, timestamp: Number(p.createdAt ?? now) / 1_000_000 });
    }
  }

  // Jobs pending signature
  for (const j of jobs) {
    if (!j.verified && !j.homeownerSigned) {
      events.push({ id: `sig-${j.id}`, type: "job_pending_sig", title: "Awaiting your signature", detail: `${j.serviceType} · ${j.date}`, href: `/properties/${j.propertyId}`, timestamp: j.createdAt ?? now });
    }
  }

  // Warranties expiring within 90 days
  for (const j of jobs) {
    if (!j.warrantyMonths || j.warrantyMonths <= 0) continue;
    const expiry   = new Date(j.date).getTime() + j.warrantyMonths * 30.44 * 86400000;
    const daysLeft = Math.round((expiry - now) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 90) {
      events.push({ id: `wty-${j.id}`, type: "warranty_expiring", title: `Warranty expires in ${daysLeft}d`, detail: `${j.serviceType} · ${j.isDiy ? "DIY" : j.contractorName ?? ""}`, href: `/properties/${j.propertyId}`, timestamp: expiry });
    }
  }

  // 5 most recent jobs
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

  // Load jobs lazily when feed is first opened
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
  const dashboardPath = isContractor ? "/contractor-dashboard" : "/dashboard";

  const navLinks = isContractor
    ? [
        { to: "/contractor-dashboard", label: "Dashboard" },
        { to: "/settings",             label: "Settings" },
      ]
    : [
        { to: "/dashboard",      label: "Dashboard" },
        { to: "/market",         label: "Market" },
        { to: "/maintenance",    label: "Maintenance" },
        { to: "/contractors",    label: "Contractors" },
        { to: "/sensors",        label: "Sensors" },
        { to: "/properties/new", label: "Add Property" },
        { to: "/settings",       label: "Settings" },
      ];

  const linkStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.688rem",
    fontWeight: 500,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textDecoration: "none",
    color: active ? "#C94C2E" : "#7A7268",
    padding: "0 1.25rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    borderRight: "1px solid #C8C3B8",
    transition: "color 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F4F1EB" }}>
      {/* Nav */}
      <header
        style={{
          backgroundColor: "#F4F1EB",
          borderBottom: "1px solid #C8C3B8",
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
          }}
        >
          {/* Logo */}
          <Link
            to={dashboardPath}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 1.5rem",
              borderRight: "1px solid #C8C3B8",
              textDecoration: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 500,
              fontSize: "0.875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#0E0E0C",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Home<span style={{ color: "#C94C2E" }}>Fax</span>
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
            style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "3.5rem", borderLeft: "1px solid #C8C3B8", borderRight: "none", borderTop: "none", borderBottom: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
            aria-label="Activity feed"
          >
            <Bell size={16} color={feedOpen ? "#C94C2E" : "#7A7268"} />
            {unread > 0 && (
              <span style={{ position: "absolute", top: "0.625rem", right: "0.5rem", width: "0.875rem", height: "0.875rem", background: "#C94C2E", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.45rem", color: "#fff", fontWeight: 700 }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Desktop user area */}
          <div
            className="rsp-nav-user"
            style={{ marginLeft: "auto", padding: "0 1.5rem", borderLeft: "1px solid #C8C3B8" }}
          >
            {principal && (
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.65rem",
                color: "#7A7268",
                letterSpacing: "0.06em",
              }}>
                {principal.slice(0, 8)}…
              </span>
            )}
            <button
              onClick={logout}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.688rem",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#7A7268",
                background: "none",
                border: "1px solid #C8C3B8",
                padding: "0.375rem 0.875rem",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#C94C2E";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#C94C2E";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#7A7268";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#C8C3B8";
              }}
            >
              Sign Out
            </button>
          </div>

          {/* Hamburger — mobile */}
          <button
            className="rsp-hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            style={{ marginLeft: "auto", padding: "0 1rem", borderLeft: "1px solid #C8C3B8" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
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
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.65rem",
              color: "#7A7268",
              padding: "0.5rem 0",
            }}>
              {principal.slice(0, 16)}…
            </span>
          )}
          <button
            className="rsp-mobile-link"
            onClick={() => { logout(); setMenuOpen(false); }}
            style={{ color: "#C94C2E", borderBottom: "none" }}
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
            style={{ position: "fixed", inset: 0, background: "rgba(14,14,12,0.35)", zIndex: 200 }}
          />
          {/* Drawer */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: "22rem", maxWidth: "100vw",
            background: "#F4F1EB", borderLeft: "1px solid #C8C3B8", zIndex: 201,
            display: "flex", flexDirection: "column", overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #C8C3B8", background: "#fff", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Bell size={14} color="#C94C2E" />
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#0E0E0C", fontWeight: 600 }}>
                  Activity
                </span>
              </div>
              <button onClick={() => setFeedOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7268" }}>
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
                <CheckCircle2 size={32} color="#C8C3B8" style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.65rem", letterSpacing: "0.08em", color: "#7A7268" }}>
                  Nothing to catch up on.
                </p>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                {events.map((event, i) => {
                  const icons: Record<ActivityEvent["type"], React.ReactNode> = {
                    pending_verification: <ShieldAlert size={14} color="#D4820E" />,
                    warranty_expiring:    <AlertTriangle size={14} color="#C94C2E" />,
                    job_pending_sig:      <Clock size={14} color="#C94C2E" />,
                    recent_job:           <Wrench size={14} color="#7A7268" />,
                  };
                  const isUnread = event.timestamp > lastReadAt;
                  return (
                    <div
                      key={event.id}
                      onClick={() => { setFeedOpen(false); navigate(event.href); }}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: "0.875rem",
                        padding: "0.875rem 1.25rem",
                        borderBottom: "1px solid #C8C3B8",
                        background: isUnread ? "#fff" : "transparent",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? "#fff" : "transparent"; }}
                    >
                      <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icons[event.type]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.125rem" }}>
                          <p style={{ fontSize: "0.813rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</p>
                          {isUnread && <span style={{ width: "6px", height: "6px", background: "#C94C2E", borderRadius: "50%", flexShrink: 0 }} />}
                        </div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", letterSpacing: "0.04em", color: "#7A7268", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
