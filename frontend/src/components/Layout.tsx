import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { VoiceAgent } from "./VoiceAgent";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const { principal, profile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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
    </div>
  );
}
