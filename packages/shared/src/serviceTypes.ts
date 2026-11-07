/**
 * The one list of service types — mirrors backend/shared/ServiceType.mo, which
 * the job, quote and contractor canisters all use.
 *
 * The app works in display labels ("Kitchen Remodel"); the canisters take the
 * variant tag (#KitchenRemodel). Services convert at the boundary with
 * serviceTypeVariant() / serviceTypeFromVariant(), and the IDL declarations
 * build their variant from this list so they can't drift.
 */

export const SERVICE_TYPES = [
  { key: "HVAC",            label: "HVAC" },
  { key: "Roofing",         label: "Roofing" },
  { key: "Plumbing",        label: "Plumbing" },
  { key: "Electrical",      label: "Electrical" },
  { key: "Painting",        label: "Painting" },
  { key: "Flooring",        label: "Flooring" },
  { key: "Windows",         label: "Windows" },
  { key: "Landscaping",     label: "Landscaping" },
  { key: "Gutters",         label: "Gutters" },
  { key: "GeneralHandyman", label: "General Handyman" },
  { key: "Pest",            label: "Pest Control" },
  { key: "Concrete",        label: "Concrete" },
  { key: "Fencing",         label: "Fencing" },
  { key: "Insulation",      label: "Insulation" },
  { key: "Solar",           label: "Solar" },
  { key: "Pool",            label: "Pool" },
  { key: "Foundation",      label: "Foundation" },
  { key: "Drywall",         label: "Drywall" },
  { key: "KitchenRemodel",  label: "Kitchen Remodel" },
  { key: "BathroomRemodel", label: "Bathroom Remodel" },
  { key: "Other",           label: "Other" },
] as const;

export type ServiceTypeKey = (typeof SERVICE_TYPES)[number]["key"];

/** Every label, in display order — for job and quote pickers. */
export const SERVICE_TYPE_LABELS: string[] = SERVICE_TYPES.map((s) => s.label);

/** Labels a contractor can list as a specialty ("Other" isn't a trade). */
export const TRADE_LABELS: string[] = SERVICE_TYPES.filter((s) => s.key !== "Other").map((s) => s.label);

const BY_KEY   = new Map<string, ServiceTypeKey>(SERVICE_TYPES.map((s) => [s.key, s.key]));
const BY_LABEL = new Map<string, ServiceTypeKey>(SERVICE_TYPES.map((s) => [s.label.toLowerCase(), s.key]));
const LABEL_OF = new Map<string, string>(SERVICE_TYPES.map((s) => [s.key, s.label]));

/** The variant tag for a label (or tag), or undefined if it isn't a service type. */
export function serviceTypeKey(labelOrKey: string): ServiceTypeKey | undefined {
  return BY_KEY.get(labelOrKey) ?? BY_LABEL.get(labelOrKey.trim().toLowerCase());
}

/** The display label for a tag (or label). Unknown values are returned as-is. */
export function serviceTypeLabel(keyOrLabel: string): string {
  const key = serviceTypeKey(keyOrLabel);
  return key ? LABEL_OF.get(key)! : keyOrLabel;
}

/** Candid variant value for a label, e.g. "Kitchen Remodel" → { KitchenRemodel: null }.
 *  A subtype label ("Septic") is sent as { Other: null }. */
export function serviceTypeVariant(labelOrKey: string): ServiceTypeVariant {
  const key = serviceTypeKey(labelOrKey) ?? (serviceSubtypeKey(labelOrKey) ? "Other" : undefined);
  if (!key) throw new Error(`Unknown service type: ${labelOrKey}`);
  return { [key]: null } as ServiceTypeVariant;
}

/** The Candid ServiceType variant: `{ HVAC: null } | { Roofing: null } | …`. */
export type ServiceTypeVariant = { [K in ServiceTypeKey]: { [P in K]: null } }[ServiceTypeKey];

/** Display label for a decoded Candid variant, e.g. { KitchenRemodel: null } → "Kitchen Remodel". */
export function serviceTypeFromVariant(variant: Record<string, unknown>): string {
  return serviceTypeLabel(Object.keys(variant)[0]);
}

/** The ServiceType IDL variant shared by the job, quote and contractor declarations. */
export function serviceTypeIdl(IDL: any) {
  return IDL.Variant(Object.fromEntries(SERVICE_TYPES.map((s) => [s.key, IDL.Null])));
}

// ─── Subtypes of Other (#721) ────────────────────────────────────────────────
//
// Kinds of work that have no ServiceType tag of their own. Adding a tag would
// change the Candid type every installed mobile app and Worker decodes, so
// these travel as #Other plus a subtype:
//   • a job carries it as its title (the web app already titles a job with its
//     service label), read back with jobServiceLabel();
//   • a quote request keeps it in the quote canister's side map
//     (setQuoteRequestSubtype / getQuoteRequestSubtypes).
// Mirrors backend/shared/ServiceSubtype.mo (the report canister labels jobs
// with it). They count toward the score as Other does, and they aren't
// contractor trades: the directory has no contractors listed under them.

export const SERVICE_SUBTYPES = [
  { key: "Inspection",      label: "Inspection" },
  { key: "ApplianceRepair", label: "Appliance Repair" },
  { key: "GarageDoor",      label: "Garage Door" },
  { key: "Septic",          label: "Septic" },
  { key: "WellWater",       label: "Well & Water Treatment" },
  { key: "Chimney",         label: "Chimney" },
  { key: "Generator",       label: "Generator" },
  { key: "TreeService",     label: "Tree Service" },
  { key: "SecurityAlarm",   label: "Security & Alarm" },
  { key: "MoldRadon",       label: "Mold & Radon" },
] as const;

export type ServiceSubtypeKey = (typeof SERVICE_SUBTYPES)[number]["key"];

const SUB_BY_NAME = new Map<string, ServiceSubtypeKey>(
  SERVICE_SUBTYPES.flatMap((s) => [[s.key.toLowerCase(), s.key], [s.label.toLowerCase(), s.key]] as const),
);
const SUB_LABEL_OF = new Map<string, string>(SERVICE_SUBTYPES.map((s) => [s.key, s.label]));

/** The subtype for a label or key (any case), or undefined if it isn't one. */
export function serviceSubtypeKey(labelOrKey: string): ServiceSubtypeKey | undefined {
  return SUB_BY_NAME.get(labelOrKey.trim().toLowerCase());
}

/** The display label for a subtype key (or label), or undefined if it isn't one. */
export function serviceSubtypeLabel(keyOrLabel: string): string | undefined {
  const key = serviceSubtypeKey(keyOrLabel);
  return key ? SUB_LABEL_OF.get(key) : undefined;
}

/** Job and quote picker choices: the named types, then the subtypes, then Other. */
export const SERVICE_CHOICE_LABELS: string[] = [
  ...SERVICE_TYPE_LABELS.filter((l) => l !== "Other"),
  ...SERVICE_SUBTYPES.map((s) => s.label),
  "Other",
];

/** Display label for a decoded job: its subtype when it is Other and titled with one, else its type. */
export function jobServiceLabel(variant: Record<string, unknown>, title: string): string {
  if ("Other" in variant) return serviceSubtypeLabel(title) ?? "Other";
  return serviceTypeFromVariant(variant);
}
