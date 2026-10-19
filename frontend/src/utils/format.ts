/**
 * Display formatting shared by pages and components — no side effects.
 * Amounts are whole US dollars; canisters store money as integer cents.
 */

/** 1234.4 → "$1,234" */
export function formatDollars(dollars: number): string {
  return "$" + Math.round(dollars).toLocaleString("en-US");
}

/** 123_456 cents → "$1,235" */
export function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-06-01" → "Jun 1, 2024". Parsed as text, so no timezone shift. "" → "". */
export function formatIsoDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}
