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

/** Candid variant value for a label, e.g. "Kitchen Remodel" → { KitchenRemodel: null }. */
export function serviceTypeVariant(labelOrKey: string): Record<string, null> {
  const key = serviceTypeKey(labelOrKey);
  if (!key) throw new Error(`Unknown service type: ${labelOrKey}`);
  return { [key]: null };
}

/** Display label for a decoded Candid variant, e.g. { KitchenRemodel: null } → "Kitchen Remodel". */
export function serviceTypeFromVariant(variant: Record<string, unknown>): string {
  return serviceTypeLabel(Object.keys(variant)[0]);
}

/** The ServiceType IDL variant shared by the job, quote and contractor declarations. */
export function serviceTypeIdl(IDL: any) {
  return IDL.Variant(Object.fromEntries(SERVICE_TYPES.map((s) => [s.key, IDL.Null])));
}
