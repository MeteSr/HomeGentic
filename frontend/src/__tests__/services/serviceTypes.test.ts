import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { IDL } from "@icp-sdk/core/candid";
import {
  SERVICE_TYPES, SERVICE_TYPE_LABELS, TRADE_LABELS,
  serviceTypeKey, serviceTypeLabel, serviceTypeVariant, serviceTypeFromVariant, serviceTypeIdl,
} from "@homegentic/shared/serviceTypes";
import { idlFactory as jobIdl } from "@homegentic/shared/declarations/job";
import { idlFactory as quoteIdl } from "@homegentic/shared/declarations/quote";
import { idlFactory as contractorIdl } from "@homegentic/shared/declarations/contractor";

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

// #721: more kinds of work, carried as a subtype of "Other" so the canisters'
// ServiceType variant (and every installed client's declarations) don't change.
import {
  SERVICE_SUBTYPES, SERVICE_CHOICE_LABELS, serviceSubtypeKey, jobServiceLabel,
} from "@homegentic/shared/serviceTypes";

describe("service subtypes under Other (#721)", () => {
  it("has exactly the subtypes of backend/shared/ServiceSubtype.mo, with the same labels", () => {
    const mo = readFileSync(resolve(ROOT, "backend/shared/ServiceSubtype.mo"), "utf-8");
    const pairs = [...mo.matchAll(/\("(\w+)",\s*"([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
    expect(pairs).toEqual(SERVICE_SUBTYPES.map((s) => [s.key, s.label]));
  });

  it("covers the trades the feature-gap review named", () => {
    expect(SERVICE_SUBTYPES.map((s) => s.label)).toEqual([
      "Inspection", "Appliance Repair", "Garage Door", "Septic", "Well & Water Treatment",
      "Chimney", "Generator", "Tree Service", "Security & Alarm", "Mold & Radon",
    ]);
  });

  it("never reuses a service type's key or label", () => {
    for (const s of SERVICE_SUBTYPES) {
      expect(serviceTypeKey(s.key)).toBeUndefined();
      expect(serviceTypeKey(s.label)).toBeUndefined();
    }
  });

  it("finds a subtype by label or key, case-insensitively, and nothing else", () => {
    expect(serviceSubtypeKey("Septic")).toBe("Septic");
    expect(serviceSubtypeKey("well & water treatment")).toBe("WellWater");
    expect(serviceSubtypeKey("WellWater")).toBe("WellWater");
    expect(serviceSubtypeKey("HVAC")).toBeUndefined();
    expect(serviceSubtypeKey("Other")).toBeUndefined();
  });

  it("sends a subtype to the canister as Other", () => {
    expect(serviceTypeVariant("Septic")).toEqual({ Other: null });
    expect(serviceTypeVariant("Appliance Repair")).toEqual({ Other: null });
  });

  it("offers the subtypes in the job and quote pickers, before Other, without duplicates", () => {
    const base = SERVICE_TYPE_LABELS.filter((l) => l !== "Other");
    expect(SERVICE_CHOICE_LABELS).toEqual([...base, ...SERVICE_SUBTYPES.map((s) => s.label), "Other"]);
    expect(new Set(SERVICE_CHOICE_LABELS).size).toBe(SERVICE_CHOICE_LABELS.length);
  });

  it("doesn't list a subtype as a contractor trade (the directory has no such trades yet)", () => {
    for (const s of SERVICE_SUBTYPES) expect(TRADE_LABELS).not.toContain(s.label);
  });

  it("labels an Other job by its subtype title, and every other job by its type", () => {
    expect(jobServiceLabel({ Other: null }, "Septic")).toBe("Septic");
    expect(jobServiceLabel({ Other: null }, "MoldRadon")).toBe("Mold & Radon");
    expect(jobServiceLabel({ Other: null }, "Fixed the shed door")).toBe("Other");
    expect(jobServiceLabel({ HVAC: null }, "Septic")).toBe("HVAC");
    expect(jobServiceLabel({ KitchenRemodel: null }, "Kitchen Remodel")).toBe("Kitchen Remodel");
  });
});
