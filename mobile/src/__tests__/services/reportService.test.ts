/**
 * @jest-environment node
 */
import { buildReportUrl, HOMEGENTIC_WEB_URL } from "../../services/reportService";

describe("buildReportUrl", () => {
  it("returns a URL containing the token", () => {
    const url = buildReportUrl("abc123");
    expect(url).toContain("abc123");
  });

  it("returns a URL starting with the web base URL", () => {
    const url = buildReportUrl("abc123");
    expect(url).toMatch(/^https?:\/\//);
  });

  it("includes the /report/ path segment", () => {
    const url = buildReportUrl("abc123");
    expect(url).toContain("/report/");
  });

  it("uses HOMEGENTIC_WEB_URL as the base", () => {
    const url = buildReportUrl("tok");
    expect(url).toContain(HOMEGENTIC_WEB_URL.replace(/\/$/, ""));
  });
});
