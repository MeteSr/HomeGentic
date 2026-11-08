/**
 * #714: the owner's property-tax years, kept on the property canister (owner
 * and co-owners only): the market, assessed and taxable values from the TRIM
 * notice or tax bill, the exemption status, and the petition deadline printed
 * on the notice. HomeGentic records what the owner enters; it checks nothing
 * with the county, files nothing and never estimates savings.
 *
 * E2E: window.__e2e_property_tax = { [propertyId]: TaxYear[] }.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import type { TaxExemption } from "@homegentic/shared/propertyTax";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export interface TaxYear {
  year: number;
  /** Dollars, or null when not entered. */
  marketValue: number | null;
  assessedValue: number | null;
  taxableValue: number | null;
  exemption: TaxExemption;
  /** "YYYY-MM-DD" from the TRIM notice, or "". */
  petitionDeadline: string;
  notes: string;
}

export const EMPTY_TAX_YEAR: TaxYear = {
  year: new Date().getUTCFullYear(),
  marketValue: null,
  assessedValue: null,
  taxableValue: null,
  exemption: "Unknown",
  petitionDeadline: "",
  notes: "",
};

const MAX_VALUE = 1_000_000_000;
const optCents = (d: number | null): [] | [bigint] => (d === null ? [] : [BigInt(Math.round(d * 100))]);
const optDollars = (c: [] | [bigint]): number | null => (c.length ? Number(c[0]) / 100 : null);

function toCanister(y: TaxYear): PropertyTypes.PropertyTaxYearInput {
  return {
    year: BigInt(y.year),
    marketValueCents: optCents(y.marketValue),
    assessedValueCents: optCents(y.assessedValue),
    taxableValueCents: optCents(y.taxableValue),
    exemption: { [y.exemption]: null } as PropertyTypes.TaxExemption,
    petitionDeadline: y.petitionDeadline,
    notes: y.notes,
  };
}

function fromCanister(raw: PropertyTypes.PropertyTaxYear): TaxYear {
  return {
    year: Number(raw.year),
    marketValue: optDollars(raw.marketValueCents),
    assessedValue: optDollars(raw.assessedValueCents),
    taxableValue: optDollars(raw.taxableValueCents),
    exemption: Object.keys(raw.exemption)[0] as TaxExemption,
    petitionDeadline: raw.petitionDeadline,
    notes: raw.notes,
  };
}

function e2e(): Record<string, TaxYear[]> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_property_tax : undefined;
}

const newestFirst = (ys: TaxYear[]) => [...ys].sort((a, b) => b.year - a.year);

export const propertyTaxService = {
  /** The saved years, newest first ([] also when the caller isn't the owner or a co-owner). */
  async list(propertyId: string): Promise<TaxYear[]> {
    const s = e2e();
    if (s) return newestFirst(s[propertyId] ?? []);
    const res = await (await getActor()).getPropertyTaxYears(propertyId);
    if ("err" in res) {
      if ("NotAuthorized" in res.err) return [];
      throw canisterError(res.err);
    }
    return res.ok.map(fromCanister);
  },

  /** Save a year, replacing that year if it's saved. */
  async save(propertyId: string, y: TaxYear): Promise<TaxYear> {
    const s = e2e();
    if (s) {
      s[propertyId] = newestFirst([...(s[propertyId] ?? []).filter((r) => r.year !== y.year), y]);
      return y;
    }
    const res = await (await getActor()).setPropertyTaxYear(propertyId, toCanister(y));
    if ("err" in res) throw canisterError(res.err);
    return fromCanister(res.ok);
  },

  /** Delete a saved year. */
  async remove(propertyId: string, year: number): Promise<void> {
    const s = e2e();
    if (s) {
      s[propertyId] = (s[propertyId] ?? []).filter((r) => r.year !== year);
      return;
    }
    const res = await (await getActor()).deletePropertyTaxYear(propertyId, BigInt(year));
    if ("err" in res) throw canisterError(res.err);
  },
};

const badValue = (v: number | null) => v !== null && !(v >= 0 && v <= MAX_VALUE);

/** The canister's rules, checked before saving. Returns the problem, or null. */
export function validateTaxYear(y: TaxYear): string | null {
  if (!Number.isInteger(y.year) || y.year < 1950 || y.year > 2100) return "Tax year must be 1950 to 2100";
  if (badValue(y.marketValue)) return "Market value must be $0 to $1,000,000,000";
  if (badValue(y.assessedValue)) return "Assessed value must be $0 to $1,000,000,000";
  if (badValue(y.taxableValue)) return "Taxable value must be $0 to $1,000,000,000";
  if (y.petitionDeadline !== "") {
    if (isoDateMs(y.petitionDeadline) === null) return "Petition deadline must be a real date written YYYY-MM-DD";
    if (!y.petitionDeadline.startsWith(`${y.year}-`)) return "The petition deadline must be in the tax year it's for";
  }
  if (y.notes.trim().length > 1000) return "Notes are over 1,000 characters";
  return null;
}

/** The change in assessed value from the year before (0.06 = +6%), or null. */
export function assessedChange(years: TaxYear[], y: TaxYear): number | null {
  const prev = years.find((p) => p.year === y.year - 1);
  if (!prev || prev.assessedValue === null || y.assessedValue === null || prev.assessedValue === 0) return null;
  return (y.assessedValue - prev.assessedValue) / prev.assessedValue;
}
