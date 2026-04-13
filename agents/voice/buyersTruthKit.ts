/**
 * Buyer's Truth Kit — backend service
 *
 * 1. Geocodes address via OpenStreetMap Nominatim (free, no key needed)
 * 2. Looks up the city/county in the permit portal table
 * 3. For cities with Socrata open-data APIs, queries for permits at the address
 * 4. Calls Claude to produce a structured due-diligence kit
 */

import type { AIProvider } from "./provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemClaim {
  status: "replaced" | "original" | "unknown";
  year?: number;           // year of last replacement (if status=replaced)
  brand?: string;          // e.g. "Federal Pacific", "Carrier"
  material?: string;       // e.g. "polybutylene", "copper", "asphalt"
  extraNotes?: string;
}

export interface BuyerTruthKitRequest {
  address: string;
  yearBuilt: number;
  claims: {
    roof:          SystemClaim;
    hvacPrimary:   SystemClaim;
    hvacSecondary: SystemClaim & { present: boolean | "unknown" };
    waterHeater:   SystemClaim & { kind?: "tank" | "tankless" | "unknown" };
    electrical:    SystemClaim;
    plumbing:      SystemClaim;
    windows:       SystemClaim;
    foundation:    SystemClaim;
  };
}

export interface PermitRecord {
  description: string;
  date?: string;
  status?: string;
}

export interface PermitLookupResult {
  searched:     boolean;           // did we attempt an API call?
  found:        boolean;
  count:        number;
  records:      PermitRecord[];
  portalUrl:    string;
  portalName:   string;
  instructions: string;
  note:         string;            // e.g. "Live query" vs "Portal link only"
}

export interface BuyerTruthKitResponse {
  property: {
    address:    string;
    yearBuilt:  number;
    geocoded:   boolean;
    city?:      string;
    state?:     string;
    county?:    string;
  };
  permits: PermitLookupResult;
  kit: KitAnalysis;
}

export interface KitAnalysis {
  overallRisk:    "low" | "medium" | "high";
  overallSummary: string;
  systems:        SystemAnalysis[];
  redFlags:       RedFlag[];
  eraRisks:       EraRisk[];
  generalQuestions:  string[];
  generalDocuments:  string[];
}

export interface SystemAnalysis {
  name:               string;
  claimed:            string;
  credibilityScore:   number;        // 0–100
  credibilityLabel:   "Verified" | "Plausible" | "Questionable" | "High Risk" | "Unknown";
  finding:            string;
  estimatedAge:       string;
  remainingLifespan:  string;
  replacementCost:    string;
  financialRisk:      "low" | "medium" | "high";
  questions:          string[];
  documents:          string[];
  inspectorChecks:    string[];
  permitNote:         string;
}

export interface RedFlag {
  severity:    "critical" | "major" | "minor";
  title:       string;
  description: string;
  action:      string;
}

export interface EraRisk {
  item:        string;
  description: string;
  likelihood:  "common" | "possible" | "rare";
}

// ─── Permit portal table ──────────────────────────────────────────────────────
// Keys are lowercase city/metro names.
// socrataEndpoint: if present, we query live; otherwise portal link only.

interface PortalEntry {
  name:              string;
  url:               string;
  instructions:      string;
  socrataDataset?:   string;   // base URL e.g. https://data.cityofchicago.org/resource/ydr8-5enu.json
  socrataAddrField?: string;   // field name for address search
}

const PERMIT_PORTALS: Record<string, PortalEntry> = {
  // ── Texas ──────────────────────────────────────────────────────────────────
  "dallas":       { name: "City of Dallas Development Hub",    url: "https://developmenthub.dallascityhall.com/",           instructions: "Select 'Permit Search', enter address." },
  "houston":      { name: "Houston Permitting Center",         url: "https://www.houstontx.gov/permits/onlinesearch.html",  instructions: "Use 'Address Search' under Permit Search." },
  "austin":       { name: "City of Austin Open Data",          url: "https://data.austintexas.gov/resource/3syk-w9eu",      instructions: "Filter by address in the permit dataset.", socrataDataset: "https://data.austintexas.gov/resource/3syk-w9eu.json", socrataAddrField: "address" },
  "san antonio":  { name: "San Antonio Electronic Permits",    url: "https://saepermits.sanantonio.gov/",                   instructions: "Search by property address." },
  "fort worth":   { name: "Fort Worth Development Services",   url: "https://www.fortworthtexas.gov/departments/development-services/permits", instructions: "Use the online permit search." },
  "plano":        { name: "City of Plano Building Inspection", url: "https://www.plano.gov/373/Building-Inspection",        instructions: "Contact Building Inspection or search e-permitting." },
  "mckinney":     { name: "City of McKinney Building",         url: "https://www.mckinneytexas.org/339/Building-Inspections", instructions: "Contact Building Inspections for permit history." },
  "frisco":       { name: "City of Frisco Building",           url: "https://www.friscotexas.gov/1163/Building-Inspections", instructions: "Search permit history online." },
  "allen":        { name: "City of Allen Building",            url: "https://www.cityofallen.org/276/Building-Permits",     instructions: "Contact Building Permits for records." },
  "arlington":    { name: "City of Arlington Development",     url: "https://www.arlingtontx.gov/city_hall/departments/planning_and_development_services/permits", instructions: "Search permit records." },
  "garland":      { name: "City of Garland Development",       url: "https://www.garlandtx.gov/389/Building-Inspections",   instructions: "Contact Building Inspections." },
  "irving":       { name: "City of Irving Permits",            url: "https://cityofirving.org/335/Permits",                 instructions: "Search permit history." },
  // ── California ─────────────────────────────────────────────────────────────
  "los angeles":  { name: "LA Department of Building & Safety", url: "https://www.ladbsservices2.lacity.org/OnlineServices/?service=pl", instructions: "Select 'Permit & Inspection Report', search by address." },
  "san francisco":{ name: "SF Open Data — Building Permits",   url: "https://data.sfgov.org/Housing-and-Buildings/Building-Permits/i98e-djp9", instructions: "Filter dataset by address.", socrataDataset: "https://data.sfgov.org/resource/i98e-djp9.json", socrataAddrField: "street_name" },
  "san jose":     { name: "City of San Jose Permits",          url: "https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division/permit-search", instructions: "Use online permit search." },
  "san diego":    { name: "City of San Diego Development",     url: "https://www.sandiego.gov/development-services/permits/find-permit", instructions: "Find permits by address." },
  "sacramento":   { name: "City of Sacramento Building",       url: "https://energov.cityofsacramento.org/",                instructions: "Search permits in the EnerGov portal." },
  "fresno":       { name: "City of Fresno DPU",                url: "https://www.fresno.gov/dpu/permits/",                  instructions: "Contact Development and Resource Management." },
  "long beach":   { name: "Long Beach Development Services",   url: "https://onlineservices.longbeach.gov/",                instructions: "Use the online services portal." },
  // ── New York ────────────────────────────────────────────────────────────────
  "new york":     { name: "NYC Buildings Information System",  url: "https://a810-bisweb.nyc.gov/bisweb/bsqpm01w.jsp",      instructions: "Enter borough and address to view permits.", socrataDataset: "https://data.cityofnewyork.us/resource/ipu4-2q9a.json", socrataAddrField: "street_name" },
  "new york city":{ name: "NYC Buildings Information System",  url: "https://a810-bisweb.nyc.gov/bisweb/bsqpm01w.jsp",      instructions: "Enter borough and address to view permits." },
  "buffalo":      { name: "City of Buffalo Permits",           url: "https://www.buffalony.gov/338/Building-Permits",       instructions: "Contact Building Permits office." },
  // ── Illinois ────────────────────────────────────────────────────────────────
  "chicago":      { name: "Chicago Open Data — Building Permits", url: "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu", instructions: "Filter by street address.", socrataDataset: "https://data.cityofchicago.org/resource/ydr8-5enu.json", socrataAddrField: "street_name" },
  // ── Florida ─────────────────────────────────────────────────────────────────
  "miami":        { name: "City of Miami Permits",             url: "https://www.miamigov.com/Services/Permits-and-Inspections", instructions: "Search permit records by address." },
  "jacksonville": { name: "City of Jacksonville Building",     url: "https://coj.net/departments/planning-and-development/building-inspection-division.aspx", instructions: "Use Building Inspection Division online search." },
  "tampa":        { name: "City of Tampa Construction Services", url: "https://www.tampagov.net/construction-services/permit-search", instructions: "Search permits by address." },
  "orlando":      { name: "City of Orlando Building",          url: "https://orlando.gov/Our-Government/Departments-Offices/Building-Official-Division", instructions: "Contact Building Official Division." },
  // ── Ohio ────────────────────────────────────────────────────────────────────
  "columbus":     { name: "City of Columbus Building Services", url: "https://www.columbusbuildinginspection.com/permits", instructions: "Search permits online." },
  "cleveland":    { name: "City of Cleveland Building",        url: "https://building.clevelandohio.gov/",                  instructions: "Use Building & Housing online portal." },
  "cincinnati":   { name: "City of Cincinnati Building",       url: "https://buildingservices.cincinnati-oh.gov/",          instructions: "Search permit history." },
  // ── Pennsylvania ───────────────────────────────────────────────────────────
  "philadelphia": { name: "Philadelphia L&I Permits",          url: "https://permits.phila.gov/",                           instructions: "Search by address." },
  "pittsburgh":   { name: "Pittsburgh PLI Permits",            url: "https://apps.pittsburghpa.gov/redtail/",               instructions: "Use the online permit search." },
  // ── Washington ─────────────────────────────────────────────────────────────
  "seattle":      { name: "City of Seattle Permits",           url: "https://cosaccela.seattle.gov/portal/welcome.aspx",    instructions: "Search permits by address." },
  // ── Colorado ────────────────────────────────────────────────────────────────
  "denver":       { name: "Denver Open Data — Permits",        url: "https://data.denvergov.org/dataset/city-and-county-of-denver-building-permits", instructions: "Filter dataset by address.", socrataDataset: "https://data.denvergov.org/resource/5jgn-2dp7.json", socrataAddrField: "address" },
  // ── Arizona ─────────────────────────────────────────────────────────────────
  "phoenix":      { name: "City of Phoenix Permit Portal",     url: "https://aca-prod.accela.com/PHOENIX/",                 instructions: "Search by address." },
  "tucson":       { name: "City of Tucson Permits",            url: "https://www.tucsonaz.gov/Departments/Planning-and-Development-Services/Permits-and-Licenses", instructions: "Use online permit portal." },
  "scottsdale":   { name: "City of Scottsdale Permits",        url: "https://secure.scottsdaleaz.gov/permit/",              instructions: "Search permit history." },
  // ── Nevada ──────────────────────────────────────────────────────────────────
  "las vegas":    { name: "City of Las Vegas Online Services", url: "https://onlineservices.lasvegasnevada.gov/",           instructions: "Select permit search." },
  "henderson":    { name: "City of Henderson Building",        url: "https://www.hendersonlive.com/Government/City-Manager/Departments/Community-Development-and-Services/Building-and-Safety", instructions: "Building & Safety permit records." },
  // ── Tennessee ───────────────────────────────────────────────────────────────
  "nashville":    { name: "Metro Nashville Codes",             url: "https://www.nashville.gov/departments/codes/permits",  instructions: "Search permit history." },
  "memphis":      { name: "City of Memphis Code Enforcement",  url: "https://memphistn.gov/government/code-enforcement/",  instructions: "Contact Code Enforcement for permit records." },
  // ── North Carolina ─────────────────────────────────────────────────────────
  "charlotte":    { name: "Mecklenburg County Permits",        url: "https://www.charlottenc.gov/city-government/departments/engineering-and-property-management/permits-and-inspections", instructions: "Search permit records." },
  "raleigh":      { name: "City of Raleigh Permits",           url: "https://raleighnc.gov/permits-and-development/services/permits", instructions: "Use online permit search." },
  // ── Georgia ─────────────────────────────────────────────────────────────────
  "atlanta":      { name: "City of Atlanta Office of Buildings", url: "https://www.atlantaga.gov/government/departments/city-planning/office-of-buildings", instructions: "Search permit records by address." },
  // ── Michigan ────────────────────────────────────────────────────────────────
  "detroit":      { name: "Detroit BSEED",                     url: "https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department", instructions: "Contact BSEED for permit history." },
  // ── Oregon ──────────────────────────────────────────────────────────────────
  "portland":     { name: "Portland Bureau of Development Services", url: "https://www.portland.gov/bds/permits/find-permit", instructions: "Find permits by address." },
  // ── Indiana ─────────────────────────────────────────────────────────────────
  "indianapolis": { name: "Indianapolis Code Enforcement",     url: "https://www.indy.gov/agency/department-of-code-enforcement", instructions: "Search permit records." },
  // ── Missouri ────────────────────────────────────────────────────────────────
  "kansas city":  { name: "Kansas City Permits",               url: "https://www.kcmo.gov/city-hall/departments/neighborhoods-housing-services/permits-licensing", instructions: "Search permits." },
  "st. louis":    { name: "St. Louis Building Division",       url: "https://www.stlouis-mo.gov/government/departments/building-code-enforcement/", instructions: "Contact Building Code Enforcement." },
  // ── Kentucky ────────────────────────────────────────────────────────────────
  "louisville":   { name: "Louisville Metro Codes",            url: "https://louisvilleky.gov/government/codes-regulations/permits-and-licenses", instructions: "Search permit history." },
  // ── Virginia ────────────────────────────────────────────────────────────────
  "virginia beach":{ name: "Virginia Beach Permits",           url: "https://www.vbgov.com/government/departments/planning/division-of-permits-inspections/pages/default.aspx", instructions: "Permits & Inspections portal." },
  // ── Massachusetts ───────────────────────────────────────────────────────────
  "boston":       { name: "Boston ISD Permit Search",          url: "https://www.boston.gov/departments/inspectional-services/permit-search", instructions: "Search by address." },
  // ── DC / Maryland ───────────────────────────────────────────────────────────
  "washington":   { name: "DC DCRA Permits",                   url: "https://dcra.dc.gov/service/pull-permits",             instructions: "Search permit records." },
  "washington dc":{ name: "DC DCRA Permits",                   url: "https://dcra.dc.gov/service/pull-permits",             instructions: "Search permit records." },
  "baltimore":    { name: "Baltimore City Permits",            url: "https://permits.baltimorecity.gov/",                   instructions: "Search by address." },
  // ── Minnesota ───────────────────────────────────────────────────────────────
  "minneapolis":  { name: "City of Minneapolis Permits",       url: "https://www.minneapolismn.gov/permits/",               instructions: "Search permit history." },
  // ── Wisconsin ───────────────────────────────────────────────────────────────
  "milwaukee":    { name: "City of Milwaukee Building",        url: "https://city.milwaukee.gov/dpw/building.htm",          instructions: "Building permits portal." },
};

// Universal fallback resources
const FALLBACK_RESOURCES = {
  name:         "NETR Online Public Records",
  url:          "https://www.netronline.com/publicrecords.htm",
  instructions: "Select your state and county to find the local property records and building department portal.",
};

// ─── Geocoding ────────────────────────────────────────────────────────────────

interface GeoResult {
  city?:   string;
  county?: string;
  state?:  string;
  stateCode?: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HomeGentic-BuyerTruthKit/1.0 (homegentic.app)" },
    });
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!data.length) return null;
    const addr = data[0].address ?? {};
    return {
      city:      addr.city ?? addr.town ?? addr.village ?? addr.municipality,
      county:    addr.county,
      state:     addr.state,
      stateCode: addr.state_code?.toUpperCase(),
    };
  } catch {
    return null;
  }
}

// ─── Permit lookup ────────────────────────────────────────────────────────────

export function findPortal(city?: string, county?: string): PortalEntry | null {
  if (!city && !county) return null;
  const cityKey   = (city   ?? "").toLowerCase().replace(/\s*city\s*$/i, "").trim();
  const countyKey = (county ?? "").toLowerCase().replace(/\s*county\s*$/i, "").trim();
  return PERMIT_PORTALS[cityKey] ?? PERMIT_PORTALS[countyKey] ?? null;
}

async function querySocrata(
  endpoint:   string,
  addrField:  string,
  streetName: string,
): Promise<PermitRecord[]> {
  try {
    // Use a simple $limit=20 query; field-level filtering varies too much by dataset.
    const url = `${endpoint}?$limit=20&$where=${encodeURIComponent(`upper(${addrField}) like upper('%${streetName}%')`)}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const rows = await res.json() as Record<string, string>[];
    return rows.slice(0, 10).map((r) => ({
      description: r.permit_type ?? r.permit_type_mapped ?? r.work_type ?? r.description ?? r.permit_description ?? "Permit record",
      date:        r.issue_date  ?? r.date_issued ?? r.issued_date ?? r.application_date,
      status:      r.current_status ?? r.permit_status ?? r.status,
    }));
  } catch {
    return [];
  }
}

export async function lookupPermits(
  address: string,
  geo: GeoResult | null,
): Promise<PermitLookupResult> {
  const portal = findPortal(geo?.city, geo?.county);

  // Extract street name from address (skip number)
  const streetName = address.replace(/^\d+\s+/, "").split(",")[0].trim();

  if (!portal) {
    return {
      searched:     false,
      found:        false,
      count:        0,
      records:      [],
      portalUrl:    FALLBACK_RESOURCES.url,
      portalName:   FALLBACK_RESOURCES.name,
      instructions: FALLBACK_RESOURCES.instructions,
      note:         "No known portal for this area — use the universal public records directory.",
    };
  }

  // Attempt live Socrata query if endpoint is defined
  if (portal.socrataDataset && portal.socrataAddrField) {
    const records = await querySocrata(portal.socrataDataset, portal.socrataAddrField, streetName);
    return {
      searched:     true,
      found:        records.length > 0,
      count:        records.length,
      records,
      portalUrl:    portal.url,
      portalName:   portal.name,
      instructions: portal.instructions,
      note:         records.length > 0
        ? `${records.length} permit record(s) found via live data query.`
        : "No records matched in the live dataset — search manually using the portal link.",
    };
  }

  // Portal-link only (no live API)
  return {
    searched:     false,
    found:        false,
    count:        0,
    records:      [],
    portalUrl:    portal.url,
    portalName:   portal.name,
    instructions: portal.instructions,
    note:         "Search the portal directly — this city does not expose a public data API.",
  };
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

export function describeClaims(req: BuyerTruthKitRequest): string {
  const { claims } = req;
  const lines: string[] = [];

  const fmt = (label: string, c: SystemClaim) => {
    if (c.status === "replaced" && c.year)   return `${label}: Replaced in ${c.year}${c.brand ? ` (${c.brand})` : ""}${c.material ? `, ${c.material}` : ""}${c.extraNotes ? ` — ${c.extraNotes}` : ""}`;
    if (c.status === "original")             return `${label}: Original to home${c.extraNotes ? ` — ${c.extraNotes}` : ""}`;
    return `${label}: Unknown${c.extraNotes ? ` — ${c.extraNotes}` : ""}`;
  };

  lines.push(fmt("Roof",            claims.roof));
  lines.push(fmt("HVAC (primary)",  claims.hvacPrimary));
  const sec = claims.hvacSecondary;
  if (sec.present === true)         lines.push(fmt("HVAC (secondary)", sec));
  else if (sec.present === "unknown") lines.push("HVAC (secondary): Buyer unsure if a second unit exists");
  else                               lines.push("HVAC (secondary): Seller says there is no secondary unit");
  lines.push(fmt("Water Heater",    { ...claims.waterHeater, extraNotes: [claims.waterHeater.kind ? `type: ${claims.waterHeater.kind}` : "", claims.waterHeater.extraNotes ?? ""].filter(Boolean).join(", ") }));
  lines.push(fmt("Electrical Panel", claims.electrical));
  lines.push(fmt("Plumbing",        claims.plumbing));
  lines.push(fmt("Windows",         claims.windows));
  lines.push(fmt("Foundation",      claims.foundation));

  return lines.join("\n");
}

export async function generateKit(
  req:     BuyerTruthKitRequest,
  permits: PermitLookupResult,
  provider: AIProvider,
): Promise<KitAnalysis> {
  const currentYear = new Date().getFullYear();
  const age = currentYear - req.yearBuilt;

  const permitSummary = permits.searched && permits.found
    ? `Live permit query found ${permits.count} record(s): ${permits.records.map((r) => `${r.description} (${r.date ?? "date unknown"})`).join("; ")}`
    : permits.searched
    ? "Live permit query returned 0 records for this address."
    : `No live query performed. Portal available: ${permits.portalName} — ${permits.portalUrl}`;

  const prompt = `You are HomeGentic's Buyer Truth Analyzer. A prospective home buyer is considering purchasing a home and has provided seller claims about key systems. Your job is to produce a comprehensive, honest, specific due-diligence kit.

HOME DETAILS:
- Address: ${req.address}
- Year Built: ${req.yearBuilt} (${age} years old)
- Current Year: ${currentYear}

PERMIT RECORDS:
${permitSummary}

SELLER CLAIMS (what the buyer has been told):
${describeClaims(req)}

INSTRUCTIONS:
Analyze each system claim against:
1. Plausibility given home age (e.g., claimed "replaced 2012" on 1987 home with no permit is suspicious)
2. Typical system lifespans (asphalt roof 20–25yr; HVAC 15–20yr; water heater 8–12yr tank / 20yr tankless; electrical panel 25–40yr; plumbing depends on material; vinyl windows 20–40yr; foundation 80–100yr)
3. Known brand/material risks (Federal Pacific/Zinsco panels — fire hazard; polybutylene pipe — failure-prone; galvanized steel — interior corrosion; R-22 refrigerant — phased out; aluminum branch wiring — fire risk in pre-1972 homes)
4. Era-specific risks for a ${req.yearBuilt} home
5. Whether the secondary HVAC claim is credible for a home that may have multiple floors

Be specific, direct, and consumer-protective. Treat every unverified claim with appropriate skepticism.

Return ONLY valid JSON matching this exact structure (no markdown, no commentary outside the JSON):
{
  "overallRisk": "low"|"medium"|"high",
  "overallSummary": "2-3 sentence plain-language summary for a first-time buyer",
  "systems": [
    {
      "name": "Roof"|"HVAC (Primary)"|"HVAC (Secondary)"|"Water Heater"|"Electrical Panel"|"Plumbing"|"Windows"|"Foundation",
      "claimed": "plain English description of what seller claimed",
      "credibilityScore": 0-100,
      "credibilityLabel": "Verified"|"Plausible"|"Questionable"|"High Risk"|"Unknown",
      "finding": "1-2 sentences explaining why this score — be specific about what's concerning or reassuring",
      "estimatedAge": "e.g. '13 years (if claim accurate)' or 'Likely 37 years (original)'",
      "remainingLifespan": "e.g. '7–12 years remaining' or 'At or past end of life'",
      "replacementCost": "e.g. '$8,000–$15,000' — use realistic 2024 US contractor prices",
      "financialRisk": "low"|"medium"|"high",
      "questions": ["4–6 specific, pointed questions the buyer should ask seller/agent"],
      "documents": ["3–5 specific documents/records to request"],
      "inspectorChecks": ["3–5 specific things to ask home inspector to check or call out"],
      "permitNote": "What permits should have been pulled for this work and whether records suggest they were"
    }
  ],
  "redFlags": [
    {
      "severity": "critical"|"major"|"minor",
      "title": "Short title",
      "description": "What the issue is and why it matters",
      "action": "What the buyer should do about it"
    }
  ],
  "eraRisks": [
    {
      "item": "e.g. 'Polybutylene Plumbing'",
      "description": "Why it matters for this era home",
      "likelihood": "common"|"possible"|"rare"
    }
  ],
  "generalQuestions": ["5–7 general questions to ask regardless of system"],
  "generalDocuments": ["5–7 general documents to request regardless of system"]
}`;

  const raw = await provider.complete({
    system:    "You are a professional home inspection analyst. Always respond with valid JSON only.",
    messages:  [{ role: "user", content: prompt }],
    maxTokens: 4096,
  });

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  try {
    return JSON.parse(cleaned) as KitAnalysis;
  } catch {
    // Fallback: return a minimal valid structure so the frontend never crashes
    return {
      overallRisk:       "medium",
      overallSummary:    "Analysis could not be fully generated. Please review each system manually and consult a licensed home inspector.",
      systems:           [],
      redFlags:          [{ severity: "major", title: "Analysis Incomplete", description: "The AI analysis encountered an error.", action: "Consult a licensed home inspector for a full evaluation." }],
      eraRisks:          [],
      generalQuestions:  ["Ask for all available maintenance records.", "Request copies of any permits pulled in the last 20 years.", "Ask who performed all major system replacements."],
      generalDocuments:  ["Last 2 years of utility bills", "Previous home inspection reports", "All permit records on file"],
    };
  }
}
