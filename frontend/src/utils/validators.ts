/**
 * Pure validation utilities — no side effects, no imports.
 * All functions trim their input before testing.
 */

/** RFC-5322-lite: local@domain.tld */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Accepts common US/international formats:
 *   (512) 555-0100  512-555-0100  +1 512 555 0100  5125550100
 * Requires at least 7 digits; total string ≤ 20 characters;
 * only digits, spaces, dashes, dots, parentheses, and a leading + allowed.
 */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (v.length > 20) return false;
  if (!/^\+?[\d\s\-().]+$/.test(v)) return false;
  return v.replace(/\D/g, "").length >= 7;
}

/** US ZIP code: 5 digits or ZIP+4 (e.g. 78701 or 78701-1234). */
export function isValidZip(value: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(value.trim());
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

/** Two-letter US state abbreviation (case-insensitive). */
export function isValidUsState(value: string): boolean {
  return US_STATES.has(value.trim().toUpperCase());
}

/** Must be a valid URL with https: scheme. Used for logo/image URLs. */
export function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Accepts either a valid email OR a valid phone number. */
export function isValidEmailOrPhone(value: string): boolean {
  return isValidEmail(value) || isValidPhone(value);
}
