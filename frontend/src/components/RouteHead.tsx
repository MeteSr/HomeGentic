import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { isNoindexPath } from "@/components/PrivateLinkNoindex";
import { DEFAULT_OG_IMAGE, canonicalUrl, publicRoute } from "@/seo/publicRoutes";

/**
 * <head> tags for a public page in PUBLIC_ROUTES: title, description,
 * canonical, Open Graph and Twitter. The build writes the same tags into the
 * page's HTML (scripts/prerender.mjs), so link previews and crawlers that
 * don't run JavaScript see what the app shows. A page may override the title
 * and description for what it is showing (a searched address, say); the
 * canonical always stays the route's own. Extra tags (JSON-LD) go in children.
 */
export function RouteHead({
  path,
  title,
  description,
  children,
}: {
  path: string;
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  const route = publicRoute(path);
  const t = title ?? route.title;
  const d = description ?? route.description;
  const url = canonicalUrl(path);
  return (
    <PageHead>
      <title>{t}</title>
      <meta name="description" content={d} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:image" content={DEFAULT_OG_IMAGE} />
      <meta name="twitter:title" content={t} />
      <meta name="twitter:description" content={d} />
      <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
      {children}
    </PageHead>
  );
}

/**
 * A canonical on homegentic.app for every page, so copies served from the
 * frontend canister's own icp0.io address aren't indexed as duplicates. A
 * page's own canonical (RouteHead, listings) replaces it. Private token links
 * get none: they are noindex.
 */
export function DefaultCanonical() {
  const { pathname } = useLocation();
  if (isNoindexPath(pathname)) return null;
  return (
    <PageHead>
      <link rel="canonical" href={canonicalUrl(pathname)} />
    </PageHead>
  );
}
