import * as Sentry from "@sentry/react-native";
import { crashReportingEnabled, redact, scrubEvent } from "../../services/crashReporting";

describe("crash reporting", () => {
  it("is off without a DSN and always off in development", () => {
    expect(crashReportingEnabled("", false)).toBe(false);
    expect(crashReportingEnabled("https://k@o.ingest.sentry.io/1", true)).toBe(false);
    expect(crashReportingEnabled("https://k@o.ingest.sentry.io/1", false)).toBe(true);
  });

  it("redacts share, invite and claim tokens from paths and queries", () => {
    expect(redact("https://homegentic.app/report/abc123?x=1")).toBe("https://homegentic.app/report/[redacted]?x=1");
    expect(redact("homegentic://verify/INV_ff00")).toBe("homegentic://verify/[redacted]");
    expect(redact("/oauth?code=secret&state=s2&ok=1")).toBe("/oauth?code=[redacted]&state=[redacted]&ok=1");
    expect(redact("my-listing/PROP_1")).toBe("my-listing/PROP_1");
  });

  it("drops the user and redacts nested strings in events", () => {
    const e = scrubEvent({
      user: { id: "principal-x", ip_address: "1.2.3.4" },
      message: "failed to open transfer/claim/tok_9",
      breadcrumbs: [{ data: { to: "report/r_1" } }],
    });
    expect(e.user).toBeUndefined();
    expect(e.message).toBe("failed to open transfer/claim/[redacted]");
    expect(e.breadcrumbs[0].data.to).toBe("report/[redacted]");
  });

  it("does not send anything when off (tests run as development)", () => {
    const { reportError } = require("../../services/crashReporting");
    reportError(new Error("x"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
