import { webPathFor } from "../links";

describe("webPathFor", () => {
  it("maps app routes to web paths", () => {
    expect(webPathFor(undefined)).toBe("/dashboard");
    expect(webPathFor("jobs/J1")).toBe("/jobs");
    expect(webPathFor("leads/R1")).toBe("/contractor-dashboard");
    expect(webPathFor("quotes/Q 1")).toBe("/quotes/Q%201");
    expect(webPathFor("my-listing/P 1")).toBe("/my-listing/P%201");
  });

  it("sends a review request to the contractor's page with the job filled in", () => {
    expect(webPathFor("review/abc-def/JOB_9")).toBe("/contractor/abc-def?review=JOB_9#review");
  });
});
