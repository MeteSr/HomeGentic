/**
 * Every route the notification relay sends must open something in the app.
 */
import { getStateFromPath } from "@react-navigation/native";
import { payloadFor } from "../../../../agents/notifications/events";
import { linkingConfig } from "../../navigation/linking";
import { isAuthCallback, targetForRoute } from "../../services/deepLinks";

const KINDS = [
  "job_awaiting_signature", "job_awaiting_contractor_signature", "job_verified", "sensor_alert",
  "quote_received", "bid_accepted", "bid_declined", "review_request", "showing_request", "new_lead",
];

function leafRoute(state: any): { name: string; params?: any } {
  let route = state.routes[state.index ?? state.routes.length - 1];
  while (route.state) route = route.state.routes[route.state.index ?? route.state.routes.length - 1];
  return route;
}

describe("notification routes", () => {
  it.each(KINDS)("%s opens a screen in the app or a page on the web", (kind) => {
    const payload = payloadFor({ seq: 1, kind, recipient: "aaaaa-aa", refId: "REF_1", summary: "C1", createdAt: 0 } as any, "32801");
    expect(payload).not.toBeNull();
    const target = targetForRoute(payload!.route);
    expect(target).not.toBeNull();
    if (target!.kind === "app") {
      const state = getStateFromPath(target!.url.replace("homegentic://", ""), linkingConfig as any);
      expect(state).toBeTruthy();
    }
  });

  it("sends a showing request to My Listing for that property, over the tabs", () => {
    const state = getStateFromPath("my-listing/PROP_9", linkingConfig as any) as any;
    expect(state.routes.map((r: any) => r.name)).toEqual(["Tabs", "MyListing"]);
    expect(leafRoute(state)).toMatchObject({ name: "MyListing", params: { propertyId: "PROP_9" } });
  });

  it("sends job and lead links through the role-aware router screens", () => {
    expect(leafRoute(getStateFromPath("jobs/JOB_1", linkingConfig as any))).toMatchObject({ name: "JobLink", params: { jobId: "JOB_1" } });
    expect(leafRoute(getStateFromPath("leads/REQ_1", linkingConfig as any))).toMatchObject({ name: "LeadLink", params: { leadId: "REQ_1" } });
    expect(leafRoute(getStateFromPath("leads", linkingConfig as any)).name).toBe("LeadLink");
  });

  it("opens a shared report link with its token", () => {
    expect(leafRoute(getStateFromPath("report/TOKEN_1", linkingConfig as any))).toMatchObject({ name: "Report", params: { token: "TOKEN_1" } });
  });

  it("sends review requests to the contractor's page on the web", () => {
    expect(targetForRoute("review/abc-principal/JOB_7")).toEqual({
      kind: "web", path: "/contractor/abc-principal?review=JOB_7#review",
    });
  });

  it("ignores empty and unknown routes", () => {
    expect(targetForRoute("")).toBeNull();
    expect(targetForRoute(null)).toBeNull();
    expect(targetForRoute("admin/delete-everything")).toBeNull();
  });

  it("recognises sign-in callbacks so they aren't treated as navigation", () => {
    expect(isAuthCallback("homegentic://auth?delegation=x&pubkey=y")).toBe(true);
    expect(isAuthCallback("homegentic://jobs/1")).toBe(false);
  });
});
