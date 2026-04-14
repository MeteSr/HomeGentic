/**
 * PublicNav — shared sticky navigation for all public-facing pages.
 *
 * Matches the landing page's nav aesthetic:
 *   - Fraunces serif logo
 *   - Backdrop-blur glass effect
 *   - Sage-tinted bottom border
 *   - "Get Started Free" pill CTA
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { COLORS, FONTS, RADIUS } from "@/theme";

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
        height:          "60px",
        background:      scrolled
          ? "rgba(253,252,250,0.92)"
          : "rgba(253,252,250,0.80)",
        backdropFilter:  "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom:    `1px solid rgba(122,175,118,${scrolled ? "0.25" : "0.15"})`,
        transition:      "background 0.2s, border-color 0.2s",
      }}>
        {/* Logo */}
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontFamily:     FONTS.serif,
            fontWeight:     900,
            fontSize:       "1.25rem",
            letterSpacing:  "-0.5px",
            color:          COLORS.plum,
            flexShrink:     0,
          }}
        >
          Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
        </Link>

        {/* Desktop nav links */}
        <nav style={{ display: "flex", gap: "2rem", alignItems: "center" }} className="public-nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              to={href}
              style={{
                fontFamily:     FONTS.sans,
                fontSize:       "0.875rem",
                fontWeight:     500,
                color:          COLORS.plumMid,
                textDecoration: "none",
                transition:     "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = COLORS.plum; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = COLORS.plumMid; }}
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
            background:      COLORS.plum,
            color:           COLORS.white,
            border:          "none",
            borderRadius:    RADIUS.pill,
            padding:         "9px 20px",
            fontFamily:      FONTS.sans,
            fontSize:        "0.8125rem",
            fontWeight:      600,
            cursor:          "pointer",
            flexShrink:      0,
            transition:      "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(46,37,64,0.28)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform  = "translateY(0)";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
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
            color:      COLORS.plum,
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
          top:        "60px",
          left:       0,
          right:      0,
          zIndex:     99,
          background: COLORS.white,
          borderBottom: `1px solid ${COLORS.rule}`,
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
                fontFamily:     FONTS.sans,
                fontSize:       "0.9375rem",
                fontWeight:     500,
                color:          COLORS.plum,
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => { setMenuOpen(false); navigate("/login"); }}
            style={{
              background:   COLORS.plum,
              color:        COLORS.white,
              border:       "none",
              borderRadius: RADIUS.pill,
              padding:      "10px 20px",
              fontFamily:   FONTS.sans,
              fontSize:     "0.875rem",
              fontWeight:   600,
              cursor:       "pointer",
              alignSelf:    "flex-start",
              marginTop:    "0.25rem",
            }}
          >
            Get Started Free
          </button>
        </div>
      )}

      {/* Spacer so content doesn't hide under fixed nav */}
      <div style={{ height: "60px" }} />

      <style>{`
        @media (max-width: 680px) {
          .public-nav-links { display: none !important; }
          .public-nav-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
