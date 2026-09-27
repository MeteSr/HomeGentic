import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { IDL } from "@icp-sdk/core/candid";
import {
  SERVICE_TYPES, SERVICE_TYPE_LABELS, TRADE_LABELS,
  serviceTypeKey, serviceTypeLabel, serviceTypeVariant, serviceTypeFromVariant, serviceTypeIdl,
} from "@/services/serviceTypes";
import { idlFactory as jobIdl } from "@/declarations/job";
import { idlFactory as quoteIdl } from "@/declarations/quote";
import { idlFactory as contractorIdl } from "@/declarations/contractor";

const ROOT = resolve(__dirname, "../../../../");

describe("service type catalog", () => {
  it("has exactly the tags of backend/shared/ServiceType.mo", () => {
    const mo = readFileSync(resolve(ROOT, "backend/shared/ServiceType.mo"), "utf-8");
    const body = mo.slice(mo.indexOf("public type ServiceType = {"), mo.indexOf("};"));
    const tags = [...body.matchAll(/#(\w+);/g)].map((m) => m[1]).sort();
    expect(SERVICE_TYPES.map((s) => s.key).sort()).toEqual(tags);
  });

  it("maps every label to its tag and back", () => {
    for (const { key, label } of SERVICE_TYPES) {
      expect(serviceTypeKey(label)).toBe(key);
      expect(serviceTypeKey(key)).toBe(key);
      expect(serviceTypeLabel(key)).toBe(label);
      expect(serviceTypeFromVariant(serviceTypeVariant(label))).toBe(label);
    }
  });

  it("converts the multi-word labels the job and quote forms use", () => {
    expect(serviceTypeVariant("Kitchen Remodel")).toEqual({ KitchenRemodel: null });
    expect(serviceTypeVariant("Bathroom Remodel")).toEqual({ BathroomRemodel: null });
    expect(serviceTypeVariant("General Handyman")).toEqual({ GeneralHandyman: null });
    expect(serviceTypeFromVariant({ Pest: null })).toBe("Pest Control");
  });

  it("rejects an unknown service type before it reaches the canister", () => {
    expect(serviceTypeKey("Kitchen")).toBeUndefined();
    expect(() => serviceTypeVariant("Kitchen")).toThrow(/Unknown service type/);
  });

  it("offers every type in the pickers, and every type but Other as a trade", () => {
    expect(SERVICE_TYPE_LABELS).toHaveLength(SERVICE_TYPES.length);
    expect(TRADE_LABELS).not.toContain("Other");
    expect(TRADE_LABELS).toHaveLength(SERVICE_TYPES.length - 1);
  });

  it("job, quote and contractor IDLs all use the catalog's variant", () => {
    const expected = serviceTypeIdl(IDL).display();
    const serviceTypeArg = (factory: any, method: string, argIndex: number) =>
      (factory({ IDL }) as any)._fields.find(([n]: [string]) => n === method)[1].argTypes[argIndex].display();
    expect(serviceTypeArg(jobIdl, "createJob", 2)).toBe(expected);
    expect(serviceTypeArg(quoteIdl, "createQuoteRequest", 1)).toBe(expected);
    expect(serviceTypeArg(contractorIdl, "getBySpecialty", 0)).toBe(expected);
  });
});
