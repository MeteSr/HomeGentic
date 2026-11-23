import { matchPath, useLocation } from "react-router-dom";
import { PageHead } from "@/components/PageHead";

/**
 * Token links shared privately (reports, badges, score certificates, claim
 * and verify links).
 * They carry a home's address and history, so search engines are told not to
 * index them or follow their links, whichever page renders them.
 */
export const NOINDEX_ROUTES: string[] = [
  "/report/:token",
  "/badge/:token",
  "/cert/:token",
  "/transfer/claim/:token",
  "/successor/:token",
  "/manage/claim/:token",
  "/verify/:token",
  "/guide/:token",
];

/** Token routes that are meant to be found in search. None today. */
export const PUBLIC_TOKEN_ROUTES: string[] = [];

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_ROUTES.some((path) => matchPath({ path, end: true }, pathname));
}

export function PrivateLinkNoindex() {
  const { pathname } = useLocation();
  if (!isNoindexPath(pathname)) return null;
  return (
    <PageHead>
      <meta name="robots" content="noindex, nofollow" />
    </PageHead>
  );
}
