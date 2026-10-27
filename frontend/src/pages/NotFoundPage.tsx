import { Link, useLocation } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { useAuthStore } from "@/store/authStore";
import { V2_COLORS, V2_FONTS } from "@/theme";

/**
 * Shown for any URL that doesn't match a route. Used to silently redirect to
 * the landing page, which left people who followed a stale or mistyped link
 * with no idea what went wrong.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const { isAuthenticated, profile } = useAuthStore();

  const home = !isAuthenticated
    ? { to: "/", label: "Go to the home page" }
    : profile?.role === "Contractor"
    ? { to: "/contractor-dashboard", label: "Go to your dashboard" }
    : profile?.role === "Realtor"
    ? { to: "/agents/browse", label: "Go to your dashboard" }
    : { to: "/dashboard", label: "Go to your dashboard" };

  const UI = {
    page: { minHeight: "100vh", background: V2_COLORS.page, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: V2_FONTS.body },
    card: { background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, maxWidth: 480, width: "100%", padding: "3rem 2.5rem", textAlign: "center" as const, borderRadius: 16 },
    kicker: { fontFamily: V2_FONTS.mono, fontSize: "0.75rem", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: V2_COLORS.muted, margin: "0 0 0.75rem" },
    h1:   { fontFamily: V2_FONTS.display, fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 700, color: V2_COLORS.ink, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
    body: { fontSize: "1rem", color: V2_COLORS.muted, lineHeight: 1.7, margin: "0 0 2rem", overflowWrap: "anywhere" as const },
    cta:  { display: "inline-flex", alignItems: "center", minHeight: 44, fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.9375rem", color: V2_COLORS.paper, background: V2_COLORS.blue, textDecoration: "none", padding: "0.75rem 2rem", borderRadius: 100 },
    link: { display: "inline-flex", alignItems: "center", minHeight: 44, marginTop: "0.5rem", fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted },
  };

  return (
    <>
      <PageHead>
        <title>Page not found | HomeGentic</title>
        <meta name="robots" content="noindex" />
      </PageHead>
      <div style={UI.page}>
        <div style={UI.card}>
          <p style={UI.kicker}>Error 404</p>
          <h1 style={UI.h1}>Page not found</h1>
          <p style={UI.body}>
            There's no page at <code>{pathname}</code>. The link may be mistyped, or the page may have moved.
          </p>
          <Link to={home.to} style={UI.cta}>{home.label}</Link>
          <div><Link to="/support" style={UI.link}>Contact support</Link></div>
        </div>
      </div>
    </>
  );
}
