/**
 * Where an incoming link or notification tap should go.
 *
 * Routes come from the notification relay (agents/notifications/events.ts):
 * jobs/<id>, quotes/<id>, leads, leads/<id>, my-listing/<propertyId> and
 * review/<contractor>/<jobId>. Most open a screen in the app (App.tsx maps the
 * paths); a contractor review is written on the web, so that one opens the
 * web page. Keep in step with agents/notifications/links.ts.
 */
export const APP_SCHEME = "homegentic://";

/** Internet Identity sign-in callbacks share the scheme but aren't navigation. */
export function isAuthCallback(url: string): boolean {
  return url.startsWith(`${APP_SCHEME}auth`);
}

export type LinkTarget =
  | { kind: "app"; url: string }
  | { kind: "web"; path: string };

const APP_ROUTES = [/^jobs(\/[^/]+)?$/, /^quotes\/[^/]+$/, /^leads(\/[^/]+)?$/, /^my-listing\/[^/]+$/, /^report(\/[^/]+)?$/, /^plan$/, /^people$/, /^dashboard$/];

/** Maps a notification route to an app URL or a web path; null when there's nothing to open. */
export function targetForRoute(route: string | null | undefined): LinkTarget | null {
  const r = (route ?? "").trim().replace(/^\/+/, "");
  if (!r) return null;
  if (r.startsWith("review/")) {
    const [contractor, jobId = ""] = r.slice("review/".length).split("/");
    if (!contractor) return null;
    return { kind: "web", path: `/contractor/${encodeURIComponent(contractor)}?review=${encodeURIComponent(jobId)}#review` };
  }
  if (APP_ROUTES.some((re) => re.test(r))) return { kind: "app", url: `${APP_SCHEME}${r}` };
  return null;
}
