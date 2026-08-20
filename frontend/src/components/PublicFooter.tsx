/**
 * PublicFooter — shared footer for public-facing pages.
 * Cobalt/yellow design system: dark C.ink background with muted white links.
 */

import React from "react";
import { Link } from "react-router-dom";

const C = {
  ink: "#0B0D1A",
};
const F = {
  body: "'Hanken Grotesk', 'Inter', sans-serif",
};

const FOOTER_LINKS = [
  { label: "Security",        href: "/security" },
  { label: "Privacy",         href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Contact Us",      href: "/support" },
];

export function PublicFooter() {
  return (
    <footer style={{
      background:     C.ink,
      padding:        "1.25rem 2.5rem",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      flexWrap:       "wrap",
      gap:            "0.75rem",
    }}>
      <p style={{
        fontFamily: F.body,
        fontSize:   "0.8125rem",
        fontWeight: 400,
        color:      "rgba(255,255,255,0.35)",
        margin:     0,
      }}>
        © {new Date().getFullYear()} HomeGentic. All rights reserved.
      </p>

      <nav style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {FOOTER_LINKS.map(({ label, href }) => (
          <Link
            key={label}
            to={href}
            style={{
              textDecoration: "none",
              fontFamily:     F.body,
              fontSize:       "0.8125rem",
              fontWeight:     400,
              color:          "rgba(255,255,255,0.35)",
              transition:     "color 0.15s",
            }}
            onMouseEnter={(e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
            onMouseLeave={(e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"; }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
