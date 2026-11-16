import type { UserRole } from "./authTypes";

export type NewPropertyType = "SingleFamily" | "Townhouse" | "Condo" | "MultiFamily";

export const PROPERTY_TYPES: { value: NewPropertyType; label: string }[] = [
  { value: "SingleFamily", label: "Single-family" },
  { value: "Townhouse",    label: "Townhouse" },
  { value: "Condo",        label: "Condo" },
  { value: "MultiFamily",  label: "Multi-family" },
];

export interface NewPropertyForm {
  address:      string;
  city:         string;
  state:        string;
  zipCode:      string;
  propertyType: NewPropertyType;
  yearBuilt:    string;
  squareFeet:   string;
}

export interface NewPropertyArgs {
  address:      string;
  city:         string;
  state:        string;
  zipCode:      string;
  propertyType: NewPropertyType;
  yearBuilt:    number;
  squareFeet:   number;
  /** The caller's plan; the canister reads the live tier from payment either way. */
  tier:         string;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isPhone = (v: string) => {
  const t = v.trim();
  return t.length <= 20 && /^\+?[\d\s\-().]+$/.test(t) && t.replace(/\D/g, "").length >= 7;
};
const wholeNumber = (v: string) => Number(v.replace(/[,\s]/g, ""));

/** Pure — the first problem with the sign-up form, or null. */
export function validateRegistration(f: { role: UserRole | null; email: string; phone: string; agreed: boolean }): string | null {
  if (!f.role) return "Choose how you'll use HomeGentic.";
  if (!f.email.trim()) return "Enter your email address.";
  if (!isEmail(f.email)) return "Enter a valid email address.";
  if (f.phone.trim() && !isPhone(f.phone)) return "Enter a valid phone number, or leave it blank.";
  if (!f.agreed) return "Agree to the Terms of Service and Privacy Policy to continue.";
  return null;
}

export function emptyPropertyForm(): NewPropertyForm {
  return { address: "", city: "", state: "", zipCode: "", propertyType: "SingleFamily", yearBuilt: "", squareFeet: "" };
}

/** Pure — the first problem with the new-home form, or null. */
export function validateNewProperty(f: NewPropertyForm, currentYear = new Date().getFullYear()): string | null {
  if (!f.address.trim()) return "Enter the street address.";
  if (!f.city.trim()) return "Enter the city.";
  if (!US_STATES.has(f.state.trim().toUpperCase())) return "Use the two-letter state, like FL.";
  if (!/^\d{5}(-\d{4})?$/.test(f.zipCode.trim())) return "Enter a 5-digit ZIP code.";
  const year = wholeNumber(f.yearBuilt);
  if (!Number.isInteger(year) || year < 1800 || year > currentYear) {
    return `Enter the year the house was built, between 1800 and ${currentYear}.`;
  }
  const sqft = wholeNumber(f.squareFeet);
  if (!Number.isInteger(sqft) || sqft <= 0) return "Enter the square footage.";
  return null;
}

/** Pure — a validated form as registerProperty's arguments. */
export function buildPropertyArgs(f: NewPropertyForm, tier: string): NewPropertyArgs {
  return {
    address:      f.address.trim(),
    city:         f.city.trim(),
    state:        f.state.trim().toUpperCase(),
    zipCode:      f.zipCode.trim(),
    propertyType: f.propertyType,
    yearBuilt:    wholeNumber(f.yearBuilt),
    squareFeet:   wholeNumber(f.squareFeet),
    tier,
  };
}
