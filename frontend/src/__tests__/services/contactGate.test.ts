import { describe, it, expect } from "vitest";
import { openRequestInTrades } from "@/services/contactGate";

const req = (id: string, serviceType: string, status: string) => ({ id, serviceType, status }) as any;

describe("openRequestInTrades", () => {
  it("finds an open or quoted request in one of the contractor's trades", () => {
    expect(openRequestInTrades([req("a", "Roofing", "open"), req("b", "HVAC", "quoted")], ["HVAC", "Plumbing"])?.id).toBe("b");
  });

  it("ignores closed, accepted and cancelled requests and other trades", () => {
    const rs = [req("a", "HVAC", "accepted"), req("b", "HVAC", "closed"), req("c", "HVAC", "cancelled"), req("d", "Roofing", "open")];
    expect(openRequestInTrades(rs, ["HVAC"])).toBeNull();
  });
});
