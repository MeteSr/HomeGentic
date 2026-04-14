/**
 * PublicFooter — shared footer for public-facing pages.
 * Matches the footer used in PrivacyPolicyPage and SupportPage.
 */

import React from "react";
import { Link } from "react-router-dom";
import { COLORS, FONTS } from "@/theme";

export function PublicFooter() {
  return (
    <footer style={{
      borderTop:   `1px solid ${COLORS.rule}`,
      padding:     "2rem 2.5rem",
      display:     "flex",
      alignItems:  "center",
      justifyContent: "space-between",
      flexWrap:    "wrap",
      gap:         "1rem",
      background:  COLORS.white,
    }}>
      <Link
        to="/"
        style={{
          textDecoration: "none",
          fontFamily:     FONTS.serif,
          fontWeight:     900,
          fontSize:       "1rem",
          color:          COLORS.plum,
        }}
      >
        Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
      </Link>

      <nav style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {[
          { label: "Pricing",  href: "/pricing" },
          { label: "Support",  href: "/support" },
          { label: "Privacy",  href: "/privacy" },
          { label: "Check",    href: "/check" },
          { label: "Prices",   href: "/prices" },
        ].map(({ label, href }) => (
          <Link
            key={label}
            to={href}
            style={{
              textDecoration: "none",
              fontFamily:     FONTS.mono,
              fontSize:       "0.65rem",
              letterSpacing:  "0.06em",
              color:          COLORS.plumMid,
            }}
          >
            {label.toUpperCase()}
          </Link>
        ))}
      </nav>

      <p style={{
        fontFamily:    FONTS.mono,
        fontSize:      "0.65rem",
        letterSpacing: "0.04em",
        color:         COLORS.plumMid,
      }}>
        © {new Date().getFullYear()} HomeGentic Inc.
      </p>
    </footer>
  );
}
