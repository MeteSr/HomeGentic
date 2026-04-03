/**
 * Climate Zone Service — 8.1.2
 *
 * Maps US zip codes to NOAA Building America climate zones (1–8) and provides
 * season-aware maintenance priority lists used by the Home Pulse digest.
 *
 * Reference: NOAA / DOE Building America House Simulation Protocols
 * https://www.energy.gov/eere/buildings/building-america-climate-zones
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Season = "winter" | "spring" | "summer" | "fall";

export interface ClimateZone {
  zone:        number;   // 1–8
  label:       string;   // e.g. "Hot-Humid"
  description: string;   // one-line description
}

// ─── Zone definitions ─────────────────────────────────────────────────────────

export const CLIMATE_ZONES: Record<number, ClimateZone> = {
  1: { zone: 1, label: "Very Hot-Humid",   description: "South Florida, Hawaii — extreme heat and humidity year-round" },
  2: { zone: 2, label: "Hot-Humid",        description: "Gulf Coast, SE Texas — hot summers, mild winters, high humidity" },
  3: { zone: 3, label: "Hot-Mixed",        description: "Central Texas, SE US interior — hot summers, cool winters" },
  4: { zone: 4, label: "Mixed-Humid",      description: "Mid-Atlantic, Carolinas — moderate temperatures, seasonal humidity" },
  5: { zone: 5, label: "Cold",             description: "Great Lakes, New England — cold winters, warm summers" },
  6: { zone: 6, label: "Very Cold",        description: "Northern Plains, Upper Midwest — harsh winters, short summers" },
  7: { zone: 7, label: "Subarctic",        description: "Northern Minnesota, Montana — extreme cold winters" },
  8: { zone: 8, label: "Arctic",           description: "Alaska — permafrost conditions, extreme cold" },
};

// ─── Zip code → zone mapping ──────────────────────────────────────────────────
// Keyed on 3-digit zip prefix for broad coverage without a full 42k-row table.
// Fallback: zone 4 (Mixed-Humid, US population-weighted median).

const ZIP_PREFIX_ZONES: Record<string, number> = {
  // Zone 1 — Very Hot-Humid (South FL, Puerto Rico)
  "330": 1, "331": 1, "332": 1, "333": 1, "334": 1, "335": 1,
  "336": 1, "337": 1, "338": 1, "339": 1, "349": 1,
  // Zone 2 — Hot-Humid (Gulf Coast TX, LA, MS, AL, southern GA/SC)
  "700": 2, "701": 2, "702": 2, "703": 2, "704": 2, "705": 2,
  "706": 2, "707": 2, "708": 2, "709": 2,
  "395": 2, "396": 2, "397": 2,  // MS coast
  "360": 2, "361": 2, "362": 2, "363": 2, "364": 2, "365": 2, "366": 2, "367": 2, "368": 2, // AL
  "770": 2, "771": 2, "772": 2, "773": 2, "774": 2, "775": 2, "776": 2, "777": 2, "778": 2, // Houston TX
  // Zone 3 — Hot-Mixed (Central TX, inland SE)
  "787": 3, "786": 3, "785": 3,  // Austin TX
  "780": 3, "781": 3, "782": 3, "783": 3, "784": 3, // San Antonio TX
  "750": 3, "751": 3, "752": 3, "753": 3, "754": 3, "755": 3, "756": 3, "757": 3, "758": 3, "759": 3, // DFW
  "300": 3, "301": 3, "302": 3, "303": 3, "304": 3, "305": 3, "306": 3, "307": 3, "308": 3, "309": 3, // Atlanta
  // Zone 4 — Mixed-Humid (Mid-Atlantic, Carolinas, TN, KY, VA)
  "270": 4, "271": 4, "272": 4, "273": 4, "274": 4, "275": 4, "276": 4, "277": 4, "278": 4, "279": 4, "280": 4, "281": 4, "282": 4, "283": 4, "284": 4, "285": 4, // NC
  "290": 4, "291": 4, "292": 4, "293": 4, "294": 4, "295": 4, "296": 4, "297": 4, "298": 4, "299": 4, // SC
  "370": 4, "371": 4, "372": 4, "373": 4, "374": 4, "375": 4, "376": 4, "377": 4, "378": 4, "379": 4, "380": 4, "381": 4, "382": 4, "383": 4, "384": 4, "385": 4, // TN
  "200": 4, "201": 4, "202": 4, "203": 4, "204": 4, "205": 4, "206": 4, "207": 4, "208": 4, "209": 4, "210": 4, "211": 4, "212": 4, "214": 4, // DC/MD/VA
  "220": 4, "221": 4, "222": 4, "223": 4, "224": 4, "225": 4, "226": 4, "227": 4, "228": 4, "229": 4, "230": 4, "231": 4, "232": 4, "233": 4, "234": 4, "235": 4, "236": 4, "237": 4, "238": 4, "239": 4, "240": 4, "241": 4, "242": 4, "243": 4, "244": 4, "245": 4, "246": 4, // VA
  // Zone 5 — Cold (Great Lakes, New England, upper Midwest)
  "600": 5, "601": 5, "602": 5, "603": 5, "604": 5, "605": 5, "606": 5, "607": 5, "608": 5, "609": 5, // Chicago IL
  "430": 5, "431": 5, "432": 5, "433": 5, "434": 5, "435": 5, "436": 5, "437": 5, "438": 5, "439": 5, // Columbus OH
  "480": 5, "481": 5, "482": 5, "483": 5, "484": 5, "485": 5, "486": 5, "487": 5, "488": 5, "489": 5, // Detroit MI
  "010": 5, "011": 5, "012": 5, "013": 5, "014": 5, "015": 5, "016": 5, "017": 5, "018": 5, "019": 5, // MA
  "020": 5, "021": 5, "022": 5, "023": 5, "024": 5, "025": 5, "026": 5, "027": 5, // MA/RI
  "030": 5, "031": 5, "032": 5, "033": 5, "034": 5, "035": 5, "036": 5, "037": 5, "038": 5, // NH
  "100": 5, "101": 5, "102": 5, "103": 5, "104": 5, // NYC
  "190": 5, "191": 5, "192": 5, "193": 5, "194": 5, "195": 5, "196": 5, // Philadelphia PA
  // Zone 6 — Very Cold (Northern Plains, upper Midwest)
  "550": 6, "551": 6, "552": 6, "553": 6, "554": 6, "555": 6, "556": 6, "557": 6, "558": 6, "559": 6, // Minneapolis MN
  "580": 6, "581": 6, "582": 6, "583": 6, "584": 6, "585": 6, "586": 6, "587": 6, "588": 6, // ND
  "570": 6, "571": 6, "572": 6, "573": 6, "574": 6, "575": 6, "576": 6, "577": 6, // SD
  "590": 6, "591": 6, "592": 6, "593": 6, "594": 6, "595": 6, "596": 6, "597": 6, "598": 6, "599": 6, // MT
  // Zone 7 — Subarctic (extreme northern states)
  "560": 7, "561": 7, "562": 7, "563": 7, "564": 7, "565": 7, "566": 7, "567": 7, // far north MN
  // Zone 8 — Arctic (Alaska)
  "995": 8, "996": 8, "997": 8, "998": 8, "999": 8,
};

// ─── Seasonal maintenance priorities ─────────────────────────────────────────

const SEASONAL_PRIORITIES: Record<number, Record<Season, string[]>> = {
  1: {
    winter: ["Inspect roof for storm damage", "Check AC refrigerant levels", "Clean gutters after dry season"],
    spring: ["AC tune-up before summer heat", "Inspect windows and door seals", "Check attic ventilation"],
    summer: ["AC filter replacement (monthly)", "Monitor for mold in high-humidity areas", "Inspect exterior caulking"],
    fall:   ["Hurricane prep: secure roof, check shutters", "Inspect plumbing for corrosion", "Service generator"],
  },
  2: {
    winter: ["Inspect heating system (mild but needed)", "Check for moisture intrusion", "Service water heater"],
    spring: ["AC tune-up", "Inspect attic insulation", "Check crawl space for moisture"],
    summer: ["AC filter monthly", "Inspect roof for heat damage", "Check exterior paint for peeling"],
    fall:   ["Hurricane preparedness check", "Clean gutters", "Inspect foundation drainage"],
  },
  3: {
    winter: ["Service heating system", "Inspect weatherstripping", "Check attic insulation R-value"],
    spring: ["AC tune-up", "Inspect roof after hail season", "Check irrigation system"],
    summer: ["AC filter replacement", "Inspect for foundation cracks in dry heat", "Check caulking around windows"],
    fall:   ["HVAC filter replacement", "Inspect roof and gutters", "Seal gaps before winter"],
  },
  4: {
    winter: ["Furnace/heat pump service", "Inspect attic for ice dam risk", "Check weatherstripping"],
    spring: ["HVAC filter replacement", "Clean gutters", "Inspect roof for winter damage"],
    summer: ["AC tune-up", "Check crawl space humidity", "Inspect exterior wood for rot"],
    fall:   ["Weatherize doors and windows", "Service furnace before heating season", "Clean gutters of fall leaves"],
  },
  5: {
    winter: ["Furnace inspection and filter", "Check for ice dams on roof", "Inspect pipes for freeze risk"],
    spring: ["HVAC tune-up", "Inspect roof for winter damage", "Check sump pump operation"],
    summer: ["AC inspection", "Inspect foundation drainage", "Check attic ventilation for heat buildup"],
    fall:   ["Furnace service before winter", "Insulate exposed pipes", "Clean and inspect gutters"],
  },
  6: {
    winter: ["Furnace/boiler service — critical", "Check heating system backup", "Inspect attic insulation for heat loss"],
    spring: ["HVAC filter replacement", "Inspect roof for winter damage", "Check sump pump"],
    summer: ["AC tune-up", "Seal foundation cracks before next freeze", "Inspect exterior for frost damage"],
    fall:   ["Weatherize all openings", "Service furnace or boiler", "Insulate pipes — freeze prevention priority"],
  },
  7: {
    winter: ["Heating system inspection — high priority", "Check pipes for freeze risk", "Inspect roof load capacity for snow"],
    spring: ["Thaw damage inspection — foundation, pipes, roof", "HVAC filter", "Inspect siding for frost damage"],
    summer: ["Roof and structural inspection", "Seal all exterior penetrations", "Check drainage away from foundation"],
    fall:   ["Full winterization", "Furnace/boiler service", "Insulate all exterior pipes immediately"],
  },
  8: {
    winter: ["Heating system — life-safety priority", "Check insulation continuity", "Monitor pipes daily"],
    spring: ["Permafrost movement inspection — foundation", "Roof inspection post-winter", "HVAC filter"],
    summer: ["Full structural inspection", "Drainage and grading check", "Seal all exterior penetrations"],
    fall:   ["Emergency winterization", "Fuel supply check", "Full pipe insulation audit"],
  },
};

// ─── Service ──────────────────────────────────────────────────────────────────

function getZone(zipCode: string): ClimateZone {
  const prefix = zipCode.slice(0, 3).padStart(3, "0");
  const zone = ZIP_PREFIX_ZONES[prefix] ?? 4;
  return CLIMATE_ZONES[zone];
}

function getSeason(month?: number): Season {
  const m = month ?? new Date().getMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4)             return "spring";
  if (m <= 7)             return "summer";
  return "fall";
}

function getSeasonalPriorities(zone: number, season: Season): string[] {
  const z = Math.max(1, Math.min(8, zone));
  return SEASONAL_PRIORITIES[z]?.[season] ?? SEASONAL_PRIORITIES[4][season];
}

export const climateService = { getZone, getSeason, getSeasonalPriorities };
