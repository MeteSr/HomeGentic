import { describe, it, expect, beforeEach } from "vitest";
import { safeReturnPath, setReturnPath, takeReturnPath, hasReturnPath } from "@/utils/returnPath";

beforeEach(() => sessionStorage.clear());

describe("returnPath", () => {
  it("keeps same-site paths only", () => {
    expect(safeReturnPath("/manage/claim/abc")).toBe("/manage/claim/abc");
    expect(safeReturnPath("/gift/redeem?token=cs_test_1")).toBe("/gift/redeem?token=cs_test_1");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnPath(bad as any)).toBeNull();
    }
  });

  it("stores, reports and takes the path once", () => {
    setReturnPath("/manage/claim/abc");
    expect(hasReturnPath()).toBe(true);
    expect(takeReturnPath()).toBe("/manage/claim/abc");
    expect(takeReturnPath()).toBeNull();
    expect(hasReturnPath()).toBe(false);
  });

  it("never stores an off-site path", () => {
    setReturnPath("//evil.example");
    expect(hasReturnPath()).toBe(false);
  });
});
