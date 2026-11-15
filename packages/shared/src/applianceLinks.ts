/**
 * Manual and parts links for a saved appliance (a room fixture with a model
 * number). No lookup service and no cost: the manual link is a web search for
 * the model's manual, kept to the manufacturer's own site when the brand is
 * one we know, so the owner lands on the maker's copy rather than a
 * look-alike download site. The parts link is a search for the model's
 * replacement parts. The app never says it found the manual itself.
 */

/** Manufacturer sites, by lowercase brand (punctuation and extra spaces removed). */
export const MANUFACTURER_SITES: Record<string, string> = {
  whirlpool: "whirlpool.com",
  ge: "geappliances.com",
  "ge appliances": "geappliances.com",
  samsung: "samsung.com",
  lg: "lg.com",
  frigidaire: "frigidaire.com",
  electrolux: "electrolux.com",
  kitchenaid: "kitchenaid.com",
  maytag: "maytag.com",
  amana: "amana.com",
  bosch: "bosch-home.com",
  kenmore: "kenmore.com",
  miele: "mieleusa.com",
  haier: "haier.com",
  "sub zero": "subzero-wolf.com",
  rheem: "rheem.com",
  ruud: "ruud.com",
  "a o smith": "hotwater.com",
  "ao smith": "hotwater.com",
  "bradford white": "bradfordwhite.com",
  rinnai: "rinnai.us",
  carrier: "carrier.com",
  trane: "trane.com",
  lennox: "lennox.com",
  goodman: "goodmanmfg.com",
  generac: "generac.com",
  liftmaster: "liftmaster.com",
  chamberlain: "chamberlain.com",
  moen: "moen.com",
  kohler: "kohler.com",
  delta: "deltafaucet.com",
  insinkerator: "insinkerator.com",
  ecobee: "ecobee.com",
  honeywell: "honeywellhome.com",
  "honeywell home": "honeywellhome.com",
  pentair: "pentair.com",
};

const brandKey = (brand: string) =>
  brand
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const search = (q: string) => `https://www.google.com/search?${new URLSearchParams({ q })}`;

export interface ApplianceLinks {
  manualUrl: string;
  partsUrl: string;
  /** The maker's site the manual search is kept to, or null for a brand we don't know. */
  manufacturerSite: string | null;
}

/** Links for one appliance, or null without a model number (a brand alone is too broad). */
export function applianceLinks(brand: string, model: string): ApplianceLinks | null {
  const b = brand.trim();
  const m = model.trim();
  if (!m) return null;
  const site = MANUFACTURER_SITES[brandKey(b)] ?? null;
  return {
    manualUrl: search(site ? `${m} manual site:${site}` : `${b ? `${b} ` : ""}${m} owner's manual`),
    partsUrl: search(`${b ? `${b} ` : ""}${m} replacement parts`),
    manufacturerSite: site,
  };
}
