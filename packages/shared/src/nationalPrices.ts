/**
 * Typical U.S. price ranges, in cents, for every choice in the job and quote
 * pickers: one per service type and one per subtype of Other.
 *
 * These are fixed national ranges, not local prices and not bids. Anything
 * that shows one must say it is a typical U.S. range. Verified local costs
 * (job.getVerifiedLocalCosts) are preferred once an area has enough homes
 * sharing their finished job costs.
 *
 * The service-type rows are the same numbers as ai_proxy's PRICE_SEEDS
 * (backend/ai_proxy/main.mo); a frontend test fails if they drift. The
 * subtype rows exist only here: subtypes travel as #Other, so the canisters
 * can't tell a septic job from a chimney one.
 */
import { serviceTypeKey, serviceSubtypeKey } from "./serviceTypes";

export interface PriceRange {
  low: number;
  median: number;
  high: number;
}

export const NATIONAL_PRICE_RANGES: Record<string, PriceRange> = {
  // Service types (= ai_proxy PRICE_SEEDS)
  Roofing: { low: 800000, median: 1400000, high: 2200000 },
  HVAC: { low: 350000, median: 650000, high: 1200000 },
  Plumbing: { low: 15000, median: 45000, high: 180000 },
  Electrical: { low: 20000, median: 55000, high: 250000 },
  Flooring: { low: 200000, median: 450000, high: 900000 },
  Painting: { low: 60000, median: 150000, high: 400000 },
  Landscaping: { low: 30000, median: 90000, high: 350000 },
  Windows: { low: 45000, median: 120000, high: 350000 },
  Foundation: { low: 400000, median: 900000, high: 2500000 },
  Gutters: { low: 15000, median: 120000, high: 300000 },
  GeneralHandyman: { low: 10000, median: 40000, high: 120000 },
  Pest: { low: 10000, median: 25000, high: 60000 },
  Concrete: { low: 150000, median: 400000, high: 900000 },
  Fencing: { low: 180000, median: 350000, high: 800000 },
  Insulation: { low: 100000, median: 200000, high: 450000 },
  Solar: { low: 1500000, median: 2200000, high: 3500000 },
  Pool: { low: 15000, median: 80000, high: 400000 },
  Drywall: { low: 30000, median: 80000, high: 250000 },
  KitchenRemodel: { low: 1200000, median: 2700000, high: 6000000 },
  BathroomRemodel: { low: 600000, median: 1200000, high: 2800000 },
  Other: { low: 10000, median: 40000, high: 200000 },
  // Subtypes of Other (#721): from a routine visit or repair at the low end
  // to a replacement or full install at the high end.
  Inspection: { low: 25000, median: 45000, high: 80000 },
  ApplianceRepair: { low: 10000, median: 25000, high: 60000 },
  GarageDoor: { low: 15000, median: 45000, high: 400000 },
  Septic: { low: 30000, median: 60000, high: 1000000 },
  WellWater: { low: 30000, median: 150000, high: 600000 },
  Chimney: { low: 15000, median: 40000, high: 400000 },
  Generator: { low: 50000, median: 1000000, high: 2000000 },
  TreeService: { low: 20000, median: 80000, high: 300000 },
  SecurityAlarm: { low: 20000, median: 80000, high: 250000 },
  MoldRadon: { low: 50000, median: 150000, high: 600000 },
};

/** The typical U.S. range for a service type or subtype, by label or key; undefined if it's neither. */
export function nationalPriceRange(labelOrKey: string): PriceRange | undefined {
  const key = serviceTypeKey(labelOrKey) ?? serviceSubtypeKey(labelOrKey);
  return key ? NATIONAL_PRICE_RANGES[key] : undefined;
}
