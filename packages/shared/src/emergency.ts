/**
 * #715: the storm and emergency card. One page per home with its shutoffs,
 * alarm, insurer and the people to call, built from what the owner already
 * saved (house guide, onboarding photos, insurance policy). Shared by the web
 * page and the mobile app, which keeps a copy on the phone for when the
 * network is down.
 *
 * Copy limit: practical steps only. Nothing here gives life-safety advice
 * beyond "follow local emergency officials", and the page links official
 * sources (NHC, Ready.gov, Florida county emergency management).
 */

export interface EmergencyContact {
  name: string;
  role: string;
  phone: string;
}

/** The parts of the house guide the card uses. */
export interface EmergencyGuide {
  waterShutoff: string;
  gasShutoff: string;
  electricPanel: string;
  alarm: string;
  contacts: EmergencyContact[];
  photoIds: string[];
}

export interface EmergencyPolicy {
  carrier: string;
  policyNumber: string;
}

/** An onboarding photo: `description` is the key it was saved with ("shutoff", "electrical"). */
export interface EmergencyPhoto {
  id: string;
  description: string;
}

export type ShutoffKey = "water" | "gas" | "electric";

export interface Shutoff {
  key: ShutoffKey;
  label: string;
  /** What the guide says about where it is; "" when nothing is written. */
  where: string;
  /** The onboarding photo of it, if there is one. */
  photoId: string | null;
}

export interface EmergencyCard {
  shutoffs: Shutoff[];
  alarm: string;
  insurer: { carrier: string; policyNumber: string; claimLine: EmergencyContact | null } | null;
  /** Everyone else in the guide's contacts, in the order the owner listed them. */
  contacts: EmergencyContact[];
  /** Guide photos not already shown on a shut-off row. */
  otherPhotoIds: string[];
  /** What the owner hasn't saved yet, as short phrases. */
  missing: string[];
  isEmpty: boolean;
}

const SHUTOFFS: {
  key: ShutoffKey;
  label: string;
  field: keyof EmergencyGuide;
  photoKey: string | null;
  missing: string;
}[] = [
  {
    key: "water",
    label: "Main water shut-off",
    field: "waterShutoff",
    photoKey: "shutoff",
    missing: "Where the main water shut-off is",
  },
  { key: "gas", label: "Gas shut-off", field: "gasShutoff", photoKey: null, missing: "Where the gas shut-off is" },
  {
    key: "electric",
    label: "Electrical panel",
    field: "electricPanel",
    photoKey: "electrical",
    missing: "Where the electrical panel is",
  },
];

/** A guide contact whose role reads as the insurer's claim line. */
export function isClaimLineRole(role: string): boolean {
  return /insur|claim/i.test(role);
}

export function buildEmergencyCard(input: {
  guide: EmergencyGuide | null;
  policy: EmergencyPolicy | null;
  photos: EmergencyPhoto[];
}): EmergencyCard {
  const g = input.guide;
  const shutoffs: Shutoff[] = SHUTOFFS.map((s) => ({
    key: s.key,
    label: s.label,
    where: g ? String(g[s.field] ?? "").trim() : "",
    photoId: s.photoKey ? (input.photos.find((p) => p.description === s.photoKey)?.id ?? null) : null,
  }));

  const contacts = (g?.contacts ?? [])
    .map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim() }))
    .filter((c) => c.name !== "");
  const claimLine = input.policy ? (contacts.find((c) => isClaimLineRole(c.role)) ?? null) : null;
  const others = contacts.filter((c) => c !== claimLine);

  const onRows = new Set(shutoffs.map((s) => s.photoId).filter((id): id is string => id !== null));
  const otherPhotoIds = [...new Set(g?.photoIds ?? [])].filter((id) => !onRows.has(id));

  const missing: string[] = [];
  SHUTOFFS.forEach((s, i) => {
    if (shutoffs[i].where === "" && shutoffs[i].photoId === null) missing.push(s.missing);
  });
  if (!input.policy) missing.push("Your insurance policy");
  if (!contacts.some((c) => isClaimLineRole(c.role))) missing.push("Your insurer's claim line");
  if (others.filter((c) => !isClaimLineRole(c.role)).length === 0) missing.push("Emergency contacts");

  const alarm = g?.alarm.trim() ?? "";
  return {
    shutoffs,
    alarm,
    insurer: input.policy
      ? { carrier: input.policy.carrier.trim(), policyNumber: input.policy.policyNumber.trim(), claimLine }
      : null,
    contacts: others,
    otherPhotoIds,
    missing,
    isEmpty:
      shutoffs.every((s) => s.where === "" && s.photoId === null) &&
      alarm === "" &&
      !input.policy &&
      contacts.length === 0 &&
      otherPhotoIds.length === 0,
  };
}

/** A tel: link for a typed phone number, or "" when there's nothing to dial. Drops extensions. */
export function telHref(phone: string): string {
  const main = phone.split(/\b(?:ext|x)\b/i)[0];
  const plus = main.trim().startsWith("+") ? "+" : "";
  const digits = main.replace(/\D/g, "");
  return digits.length >= 3 ? `tel:${plus}${digits}` : "";
}

// ─── Hurricanes ───────────────────────────────────────────────────────────────

/**
 * States and territories on the Atlantic and Gulf coasts, plus Hawaii and the
 * Pacific territories: where the National Hurricane Center or Central Pacific
 * Hurricane Center issues watches. Coarse on purpose (a state, not a flood
 * zone), so the copy says "a hurricane state", not "your home is at risk".
 */
const HURRICANE_STATES = new Set([
  "TX",
  "LA",
  "MS",
  "AL",
  "FL",
  "GA",
  "SC",
  "NC",
  "VA",
  "MD",
  "DE",
  "NJ",
  "NY",
  "CT",
  "RI",
  "MA",
  "NH",
  "ME",
  "HI",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
]);

export function isHurricaneZone(state: string): boolean {
  return HURRICANE_STATES.has(state.trim().toUpperCase());
}

/** The Atlantic season, June 1 through November 30 (local date). */
export function isHurricaneSeason(d: Date): boolean {
  const m = d.getMonth();
  return m >= 5 && m <= 10;
}

/** Where the web page keeps this season's ticks for one home, on this device. */
export function stormPrepKey(propertyId: string, d: Date): string {
  return `hg_storm_prep_${propertyId}_${d.getFullYear()}`;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

/** Before a storm. Practical steps only; evacuation is for local officials. */
export const PRE_STORM_CHECKLIST: ChecklistItem[] = [
  {
    id: "photos",
    text: 'Take photos of every room and the outside of the home, so you have "before" pictures for a claim',
  },
  { id: "policy", text: "Check your hurricane deductible and keep your policy number with you" },
  { id: "claimLine", text: "Save your insurer's claim line as a contact in your house guide" },
  { id: "papers", text: "Put your ID, policy and other important papers in a waterproof bag" },
  { id: "outside", text: "Bring in or tie down patio furniture, grills, planters and anything else loose outside" },
  { id: "shutters", text: "Put up shutters or storm panels if your home has them" },
  { id: "drains", text: "Clear gutters, downspouts and the drains near your home" },
  { id: "shutoffs", text: "Make sure everyone at home knows where the water, gas and electrical shutoffs are" },
  { id: "charge", text: "Charge phones and power banks, and fill your car's tank" },
];

/** After a storm: get the damage on record before cleanup. Feeds the claim kit. */
export const AFTER_STORM_STEPS: ChecklistItem[] = [
  { id: "officials", text: "Go back and go inside only when local emergency officials say you can" },
  { id: "photos", text: "Photograph and video the damage before you clean up, move or throw anything away" },
  { id: "claim", text: "Start a claim in the claim kit: the date of loss, what happened and your photos" },
  { id: "call", text: "Call your insurer's claim line and write down the claim number" },
  { id: "temporary", text: "Stop more damage where you can (a tarp, drying out water) and keep every receipt" },
];

export interface OfficialSource {
  label: string;
  url: string;
}

export function officialSources(state: string): OfficialSource[] {
  const list: OfficialSource[] = [
    { label: "National Hurricane Center (forecasts and watches)", url: "https://www.nhc.noaa.gov/" },
    { label: "Ready.gov: hurricanes", url: "https://www.ready.gov/hurricanes" },
  ];
  if (state.trim().toUpperCase() === "FL") {
    list.push({
      label: "Florida county emergency management offices",
      url: "https://www.floridadisaster.org/counties/",
    });
  }
  return list;
}

/** Sensor events that should offer the emergency card (where the water shut-off is). */
export function isWaterEmergency(eventType: string): boolean {
  return eventType === "WaterLeak" || eventType === "LeakDetected" || eventType === "FloodRisk";
}
