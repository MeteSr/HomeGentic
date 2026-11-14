/**
 * What Florida DBPR's licensee file says about a contractor's licence number
 * (services/contractor.ts LicenseCheck). The wording only repeats DBPR's
 * file: HomeGentic doesn't vouch for the licence, and "not in the file"
 * isn't called fake, because DBPR leaves lapsed licences out of it.
 */
import { CircleAlert, FileSearch } from "lucide-react";
import type { LicenseCheck } from "@/services/contractor";
import { V2_COLORS, V2_FONTS } from "@/theme";

/** Uppercase, no spaces or dashes, as the Worker and canister compare them. */
export const normLicense = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/** Florida contractor licence numbers: 2–4 letters then digits (CGC1234567, EC13001234). */
export const looksLikeFlLicense = (s: string) => /^[A-Z]{2,4}\d{3,9}$/.test(normLicense(s));

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One-sentence summary of a check, e.g. "DBPR lists CGC1234567 as Current, Active." */
export function licenseCheckSummary(c: LicenseCheck): string {
  if (!c.found) return `${c.licenseNumber} isn't in DBPR's file of current Florida construction licences.`;
  const lines = [`DBPR lists ${c.licenseNumber} as ${c.status || "no status given"}${c.expiresOn ? `, expiring ${c.expiresOn}` : ""}.`];
  if (!c.nameMatches) lines.push(`It's licensed to ${c.licenseeName}${c.dbaName ? ` (${c.dbaName})` : ""}, not the name on this profile.`);
  return lines.join(" ");
}

export function licenseCheckSource(c: LicenseCheck): string {
  return `Checked ${fmtDate(c.checkedAt)} against DBPR's licensee file${c.sourceDate ? ` dated ${c.sourceDate}` : ""}.`;
}

/**
 * "good" only when DBPR's file matches AND HomeGentic verified the profile:
 * the name match compares DBPR's licensee with a name the account chose, so
 * on its own it doesn't show who holds the account (security review
 * 2026-11-11, X-3).
 */
export function licenseCheckTone(c: LicenseCheck, confirmed: boolean): "good" | "neutral" | "warn" {
  if (!(c.found && c.active && c.nameMatches)) return "warn";
  return confirmed ? "good" : "neutral";
}

const TONE_COLOR = { good: "#188038", neutral: V2_COLORS.muted, warn: "#B3261E" } as const;

/**
 * Compact public version for profile pages and bid cards. `confirmed` is the
 * profile's admin verification (isVerified).
 */
export function LicenseCheckBadge({ check, confirmed }: { check: LicenseCheck; confirmed: boolean }) {
  const tone = licenseCheckTone(check, confirmed);
  const Icon = tone === "warn" ? CircleAlert : FileSearch;
  return (
    <div data-testid="license-check" data-tone={tone} style={{ fontFamily: V2_FONTS.body, fontSize: "0.72rem", lineHeight: 1.45, color: V2_COLORS.ink }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: TONE_COLOR[tone] }}>
        <Icon size={12} aria-hidden /> Florida DBPR
      </span>{" "}
      {licenseCheckSummary(check)}{check.found && check.licenseType ? ` ${check.licenseType}.` : ""}
      {tone === "neutral" && " HomeGentic hasn't confirmed that this account holds the licence."}
      <span style={{ display: "block", color: V2_COLORS.muted, fontSize: "0.66rem" }}>{licenseCheckSource(check)}</span>
    </div>
  );
}
