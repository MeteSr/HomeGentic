/**
 * @jest-environment node
 */
import {
  buildTokenPayload,
  parseNotificationRoute,
} from "../../services/notificationService";

describe("buildTokenPayload", () => {
  it("returns an object with all three fields", () => {
    const result = buildTokenPayload("principal-abc", "expo-push-token-xyz", "ios");
    expect(result).toEqual({
      principal: "principal-abc",
      token:     "expo-push-token-xyz",
      platform:  "ios",
    });
  });

  it("works for android platform", () => {
    const result = buildTokenPayload("p1", "fcm-token", "android");
    expect(result.platform).toBe("android");
  });
});

describe("parseNotificationRoute", () => {
  it("returns the route string when present", () => {
    expect(parseNotificationRoute({ route: "jobs/abc123" })).toBe("jobs/abc123");
  });

  it("returns null for missing route", () => {
    expect(parseNotificationRoute({})).toBeNull();
  });

  it("returns null for non-string route", () => {
    expect(parseNotificationRoute({ route: 42 })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseNotificationRoute(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseNotificationRoute(undefined)).toBeNull();
  });

  it("handles leads route", () => {
    expect(parseNotificationRoute({ route: "leads/lead_99" })).toBe("leads/lead_99");
  });
});
