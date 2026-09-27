import { describe, it, expect } from "vitest";
import { billsPermissions } from "@/services/billsAccess";

const ME = "me-principal";
const OTHER = "someone-else";

describe("billsPermissions (mirrors the bills canister's rules)", () => {
  it.each(["Owner", "CoOwner"] as const)("%s adds anything and manages everyone's records", (role) => {
    const p = billsPermissions(role, ME);
    expect(p.canAdd).toBe(true);
    expect(p.canAddMortgage).toBe(true);
    expect(p.canModify(OTHER)).toBe(true);
  });

  it("Manager adds bills but not the mortgage, and manages only their own records", () => {
    const p = billsPermissions("Manager", ME);
    expect(p.canAdd).toBe(true);
    expect(p.canAddMortgage).toBe(false);
    expect(p.canModify(ME)).toBe(true);
    expect(p.canModify(OTHER)).toBe(false);
  });

  it("Viewer is read-only for others' records", () => {
    const p = billsPermissions("Viewer", ME);
    expect(p.canAdd).toBe(false);
    expect(p.canAddMortgage).toBe(false);
    expect(p.canModify(OTHER)).toBe(false);
  });

  it("NoAccess cannot add", () => {
    expect(billsPermissions("NoAccess", ME).canAdd).toBe(false);
  });

  it("unknown role keeps full controls (the canister shows only the caller's own records)", () => {
    const p = billsPermissions(null, ME);
    expect(p.canAdd).toBe(true);
    expect(p.canAddMortgage).toBe(true);
    expect(p.canModify(OTHER)).toBe(true);
  });

  it("never treats records as the caller's own when the caller is unknown", () => {
    expect(billsPermissions("Manager", null).canModify("")).toBe(false);
  });
});
