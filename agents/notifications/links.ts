/**
 * Maps a notification's deep-link route (the mobile app's scheme, e.g.
 * "jobs/JOB_1", "leads/REQ_1") to a web app path. Keep in step with
 * frontend/public/push-sw.js, which does the same for browser pushes.
 */
export function webPathFor(route: string | undefined): string {
  if (!route) return "/dashboard";
  if (route === "jobs" || route.startsWith("jobs/")) return "/jobs";
  if (route === "leads" || route.startsWith("leads/")) return "/contractor-dashboard";
  // "review/<contractor>/<jobId>": the contractor's public page, review form filled in.
  if (route.startsWith("review/")) {
    const [contractor, jobId = ""] = route.slice("review/".length).split("/");
    return `/contractor/${encodeURIComponent(contractor)}?review=${encodeURIComponent(jobId)}#review`;
  }
  if (route.startsWith("quotes/")) return `/quotes/${encodeURIComponent(route.slice("quotes/".length))}`;
  return "/dashboard";
}
