/**
 * Insurer Discount Service (Epic #50)
 *
 * Calls /api/insurer-discount on the voice agent proxy to estimate insurance
 * savings based on the homeowner's connected sensor devices and verified
 * maintenance records.
 *
 * The voice agent uses Claude to map devices → discount categories → programs
 * for the homeowner's state. No PII leaves the voice agent; the canister data
 * is already on-chain and controlled by the homeowner.
 */

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:3001";
const VOICE_API_KEY   = (import.meta as any).env?.VITE_VOICE_AGENT_API_KEY || "";

export interface DiscountCategory {
  name:          string;
  discountRange: string;
  basis:         string;
  status:        "qualifying" | "potential" | "missing";
}

export interface InsurerProgram {
  insurer:           string;
  programName:       string;
  estimatedDiscount: string;
  notes:             string;
}

export interface InsurerDiscountResult {
  discountRangeMin:     number;
  discountRangeMax:     number;
  qualifyingCategories: DiscountCategory[];
  programs:             InsurerProgram[];
  recommendations:      string[];
  generatedAt:          number;
}

export interface InsurerDiscountRequest {
  state:              string;
  zipCode:            string;
  properties:         Array<{ address: string; yearBuilt: number; verificationLevel: string }>;
  devices:            Array<{ source: string; name: string }>;
  criticalEventCount: number;
  verifiedJobTypes:   string[];
  totalVerifiedJobs:  number;
}

// ─── Mock (dev fallback) ──────────────────────────────────────────────────────

function mockResult(req: InsurerDiscountRequest): InsurerDiscountResult {
  const hasWater  = req.devices.some((d) => d.source === "MoenFlo");
  const hasHvac   = req.devices.some((d) => d.source === "Ecobee" || d.source === "Nest");
  const hasRoof   = req.verifiedJobTypes.includes("Roofing");
  const hasElec   = req.verifiedJobTypes.includes("Electrical");

  const categories: DiscountCategory[] = [
    {
      name:          "Smart Water Leak Detection",
      discountRange: "5–8%",
      basis:         "Moen Flo water sensor",
      status:        hasWater ? "qualifying" : "potential",
    },
    {
      name:          "Smart Thermostat / HVAC Monitoring",
      discountRange: "2–5%",
      basis:         "Nest or Ecobee connected thermostat",
      status:        hasHvac ? "qualifying" : "potential",
    },
    {
      name:          "Verified Roof Replacement",
      discountRange: "10–20%",
      basis:         "ICP-verified roofing job record",
      status:        hasRoof ? "qualifying" : "missing",
    },
    {
      name:          "Electrical Panel Upgrade",
      discountRange: "3–7%",
      basis:         "ICP-verified electrical job record",
      status:        hasElec ? "qualifying" : "missing",
    },
    {
      name:          "Monitored Security System",
      discountRange: "5–15%",
      basis:         "Central station monitoring subscription",
      status:        "missing",
    },
  ];

  const qualifying = categories.filter((c) => c.status === "qualifying").length;
  const min = qualifying * 3;
  const max = qualifying * 9 + 5;

  return {
    discountRangeMin:     Math.min(min, 5),
    discountRangeMax:     Math.min(max, 35),
    qualifyingCategories: categories,
    programs: [
      {
        insurer:           "Hippo Insurance",
        programName:       "Smart Home Discount",
        estimatedDiscount: "up to 25%",
        notes:             "Submit HomeGentic sensor report + maintenance PDF via Hippo's claims portal.",
      },
      {
        insurer:           "Citizens Property Insurance",
        programName:       "Wind Mitigation Credit",
        estimatedDiscount: "up to 30%",
        notes:             `Available to ${req.state} homeowners with verified roof and opening protection records.`,
      },
      {
        insurer:           "UPC Insurance",
        programName:       "Verified Home Credit",
        estimatedDiscount: "up to 10%",
        notes:             "Present ICP-verified maintenance history at renewal.",
      },
    ],
    recommendations: [
      "Install a Moen Flo or similar whole-home water sensor — water leak discounts are the highest ROI smart home upgrade for insurers.",
      "Submit your HomeGentic Insurance Defense PDF at your next renewal — verified records qualify for immediate credits at most FL insurers.",
      "Add a UL-listed monitored security system to unlock the largest single discount category (5–15%).",
      "Complete an electrical panel inspection and log it as a verified job to qualify for electrical upgrade credits.",
    ],
    generatedAt: Date.now(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function estimateInsurerDiscount(
  req: InsurerDiscountRequest
): Promise<InsurerDiscountResult> {
  // Dev fallback — voice agent not running
  if (!VOICE_AGENT_URL || VOICE_AGENT_URL === "http://localhost:3001") {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (VOICE_API_KEY) headers["x-api-key"] = VOICE_API_KEY;

      const res = await fetch(`${VOICE_AGENT_URL}/api/insurer-discount`, {
        method:  "POST",
        headers,
        body:    JSON.stringify(req),
        signal:  AbortSignal.timeout(20_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      // Voice agent not running in dev — return mock
      return mockResult(req);
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (VOICE_API_KEY) headers["x-api-key"] = VOICE_API_KEY;

  const res = await fetch(`${VOICE_AGENT_URL}/api/insurer-discount`, {
    method:  "POST",
    headers,
    body:    JSON.stringify(req),
    signal:  AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }

  return res.json();
}
