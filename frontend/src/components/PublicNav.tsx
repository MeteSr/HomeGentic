/**
 * PublicNav — shared sticky navigation for all public-facing pages.
 *
 * Cobalt/yellow design system:
 *   - Clean paper/white background
 *   - "Home" in C.ink + "Gentic" in C.yellow — Bricolage Grotesque 800
 *   - Blue pill CTA
 *   - Border-bottom: 1px solid C.border
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

const NAV_LINKS = [
  { label: "Features",   href: "/#features" },
  { label: "Pricing",    href: "/pricing" },
  { label: "Check Home", href: "/check" },
  { label: "Support",    href: "/support" },
];

export function PublicNav() {
  const navigate  = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header style={{
        position:        "fixed",
        top:             0,
        left:            0,
        right:           0,
        zIndex:          100,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        padding:         "0 2.5rem",
        height:          "64px",
        background:      scrolled
          ? "rgba(252,252,253,0.96)"
          : "rgba(252,252,253,0.88)",
        backdropFilter:  "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom:    `1px solid ${C.border}`,
        transition:      "background 0.2s",
      }}>
        {/* Logo */}
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontFamily:     F.display,
            fontWeight:     800,
            fontSize:       "1.125rem",
            letterSpacing:  "-0.3px",
            color:          C.ink,
            flexShrink:     0,
          }}
        >
          Home<span style={{ color: C.yellow }}>Gentic</span>
        </Link>

        {/* Desktop nav links */}
        <nav style={{ display: "flex", gap: "2rem", alignItems: "center" }} className="public-nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              to={href}
              style={{
                fontFamily:     F.body,
                fontSize:       "0.875rem",
                fontWeight:     500,
                color:          C.muted,
                textDecoration: "none",
                transition:     "color 0.15s",
              }}
              onMouseEnter={(e: React.MouseEvent) => { (e.target as HTMLElement).style.color = C.ink; }}
              onMouseLeave={(e: React.MouseEvent) => { (e.target as HTMLElement).style.color = C.muted; }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <button
          onClick={() => navigate("/login")}
          style={{
            display:         "flex",
            alignItems:      "center",
            gap:             "6px",
            background:      C.blue,
            color:           C.paper,
            border:          "none",
            borderRadius:    "100px",
            padding:         "9px 20px",
            fontFamily:      F.body,
            fontSize:        "0.8125rem",
            fontWeight:      600,
            cursor:          "pointer",
            flexShrink:      0,
            transition:      "transform 0.15s, box-shadow 0.15s",
            boxShadow:       "0 4px 18px rgba(43,52,255,0.28)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(43,52,255,0.38)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform  = "translateY(0)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 18px rgba(43,52,255,0.28)";
          }}
        >
          Get Started Free
        </button>

        {/* Mobile hamburger */}
        <button
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            display:    "none",
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    "4px",
            color:      C.ink,
          }}
          className="public-nav-hamburger"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{
          position:   "fixed",
          top:        "64px",
          left:       0,
          right:      0,
          zIndex:     99,
          background: C.paper,
          borderBottom: `1px solid ${C.border}`,
          padding:    "1rem 2rem",
          display:    "flex",
          flexDirection: "column",
          gap:        "0.875rem",
        }} className="public-nav-mobile">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              to={href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily:     F.body,
                fontSize:       "0.9375rem",
                fontWeight:     500,
                color:          C.ink,
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => { setMenuOpen(false); navigate("/login"); }}
            style={{
              background:   C.blue,
              color:        C.paper,
              border:       "none",
              borderRadius: "100px",
              padding:      "10px 20px",
              fontFamily:   F.body,
              fontSize:     "0.875rem",
              fontWeight:   600,
              cursor:       "pointer",
              alignSelf:    "flex-start",
              marginTop:    "0.25rem",
              boxShadow:    "0 4px 18px rgba(43,52,255,0.28)",
            }}
          >
            Get Started Free
          </button>
        </div>
      )}

      {/* Spacer so content doesn't hide under fixed nav */}
      <div style={{ height: "64px" }} />

      <style>{`
        @media (max-width: 680px) {
          .public-nav-links { display: none !important; }
          .public-nav-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
