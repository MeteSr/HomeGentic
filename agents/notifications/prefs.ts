/**
 * Per-user notification preferences for push, email and SMS (see channels.ts
 * for which kinds each covers).
 *
 * Preferences live with the rest of the relay's state (persist.ts) and apply
 * to all of the user's devices. Push kinds are on until turned off; email
 * keys default per EMAIL_DEFAULTS; SMS is off until the user confirms a phone
 * number (sms.ts) and turns it on. New-lead pushes aren't here — they're the
 * `notifyPush` flag on the contractor's profile.
 */
import {
  EMAIL_DEFAULTS, EMAIL_PREF_KEYS, PUSH_KINDS, PUSH_PREF_KINDS, SMS_KINDS, emailGroupFor,
  type EmailPrefKey, type PushPrefKind,
} from "./channels";
import { loadSection, saveSection } from "./persist";

export type PushPrefs  = Record<PushPrefKind, boolean>;
export type EmailPrefs = Record<EmailPrefKey, boolean>;

export interface Prefs {
  push:  PushPrefs;
  email: EmailPrefs;
  sms:   { enabled: boolean; phone: string | null };
}

interface Stored {
  push?:  Partial<PushPrefs>;
  email?: Partial<EmailPrefs>;
  sms?:   { enabled?: boolean; phone?: string };
}

const stored: Record<string, Stored> = loadSection<Record<string, Stored>>("prefs", {});

function save(): void {
  saveSection("prefs", stored);
}

/** "+15125550142" → "•••• 0142" — enough for the user to recognise their number. */
export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

export function getPrefs(principal: string): Prefs {
  const mine = stored[principal] ?? {};
  const phone = mine.sms?.phone ?? null;
  return {
    push:  Object.fromEntries(PUSH_PREF_KINDS.map((k) => [k, mine.push?.[k] !== false])) as PushPrefs,
    email: Object.fromEntries(EMAIL_PREF_KEYS.map((k) => [k, mine.email?.[k] ?? EMAIL_DEFAULTS[k]])) as EmailPrefs,
    sms:   { enabled: !!phone && mine.sms?.enabled === true, phone },
  };
}

/** What the API returns: the stored phone number is masked. */
export function publicPrefs(principal: string): Prefs {
  const p = getPrefs(principal);
  return { ...p, sms: { ...p.sms, phone: p.sms.phone ? maskPhone(p.sms.phone) : null } };
}

function isBoolMap(v: unknown, keys: readonly string[]): v is Record<string, boolean> {
  return !!v && typeof v === "object" && !Array.isArray(v) &&
    Object.entries(v).every(([k, b]) => keys.includes(k) && typeof b === "boolean");
}

export type SetPrefsResult = { ok: Prefs } | { error: string };

/**
 * Merge `changes` ({ push?, email?, sms?: { enabled } }) into the user's
 * preferences. Nothing is saved unless every part is valid.
 */
export function setPrefs(principal: string, changes: unknown): SetPrefsResult {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return { error: "prefs must be an object" };
  }
  const { push, email, sms, ...rest } = changes as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { error: `unknown section: ${Object.keys(rest)[0]}` };
  if (push !== undefined && !isBoolMap(push, PUSH_PREF_KINDS)) return { error: "push must map known kinds to booleans" };
  if (email !== undefined && !isBoolMap(email, EMAIL_PREF_KEYS)) return { error: "email must map known keys to booleans" };
  if (sms !== undefined && !isBoolMap(sms, ["enabled"])) return { error: "sms takes { enabled: boolean }" };

  const mine: Stored = { ...stored[principal] };
  const smsChange = sms as { enabled?: boolean } | undefined;
  if (smsChange?.enabled === true && !mine.sms?.phone) {
    return { error: "confirm a phone number before turning on SMS" };
  }
  if (push)  mine.push  = { ...mine.push,  ...(push as Partial<PushPrefs>) };
  if (email) mine.email = { ...mine.email, ...(email as Partial<EmailPrefs>) };
  if (smsChange?.enabled !== undefined) mine.sms = { ...mine.sms, enabled: smsChange.enabled };
  stored[principal] = mine;
  save();
  return { ok: getPrefs(principal) };
}

/** Record a phone number the user just confirmed, and turn SMS on. */
export function setVerifiedPhone(principal: string, phone: string): void {
  stored[principal] = { ...stored[principal], sms: { enabled: true, phone } };
  save();
}

export function clearPhone(principal: string): void {
  const mine = stored[principal];
  if (!mine?.sms) return;
  stored[principal] = { ...mine, sms: { enabled: false } };
  save();
}

/** Whether `principal` wants `kind` pushed. Kinds without a preference always push. */
export function wantsPush(principal: string, kind: string): boolean {
  if (!PUSH_KINDS.includes(kind as never)) return false;
  return (PUSH_PREF_KINDS as readonly string[]).includes(kind)
    ? getPrefs(principal).push[kind as PushPrefKind]
    : true;
}

export function wantsEmail(principal: string, kind: string): boolean {
  const group = emailGroupFor(kind);
  return group !== null && getPrefs(principal).email[group];
}

/** The confirmed phone to text about `kind`, or null. */
export function smsPhoneFor(principal: string, kind: string): string | null {
  if (!SMS_KINDS.includes(kind as never)) return null;
  const { sms } = getPrefs(principal);
  return sms.enabled ? sms.phone : null;
}
