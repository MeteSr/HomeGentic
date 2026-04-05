/**
 * Market Timing Service — 5.3.2 / 5.3.3
 *
 * Combines HomeGentic score × zip code × season × local market conditions
 * into a listing recommendation and estimated price premium.
 */

import { premiumEstimateByZip } from "@/services/scoreService";
import { marketDataService }     from "@/services/marketDataService";
import { climateService, type Season } from "@/services/climateService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketCondition      = "hot" | "balanced" | "cool";
export type RecommendationType   = "list_now" | "wait" | "neutral";
export type UrgencyLevel         = "high" | "medium" | "low";

export interface TimingAnalysis {
  zip:               string;
  score:             number;
  season:            Season;
  marketCondition:   MarketCondition;
  estimatedPremium:  { low: number; high: number };
  listingScore:      number;          // 0–100 composite
  recommendation:    RecommendationType;
  headline:          string;
  reasoning:         string[];
  daysOnMarket:      number;
  activeListings:    number;
  generatedAt:       number;
}

export interface ListingRecommendation {
  shouldListNow: boolean;
  message:       string;
  urgency:       UrgencyLevel;
  analysis:      TimingAnalysis;
}

// ─── Scoring weights ──────────────────────────────────────────────────────────

// Season multiplier on listing score (spring is peak selling season)
const SEASON_MULTIPLIER: Record<Season, number> = {
  spring: 1.15,
  summer: 1.05,
  fall:   0.95,
  winter: 0.85,
};

// Market condition from DOM and inventory trend
function deriveMarketCondition(
  dom: number,
  listToSaleRatio: number,
  inventoryTrend: "rising" | "falling" | "stable"
): MarketCondition {
  if (dom <= 20 && listToSaleRatio >= 1.00) return "hot";
  if (dom >= 50 || (inventoryTrend === "rising" && listToSaleRatio < 0.97)) return "cool";
  return "balanced";
}

const MARKET_LISTING_BONUS: Record<MarketCondition, number> = {
  hot:      15,
  balanced:  0,
  cool:    -10,
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMarketTimingService() {

  async function getAnalysis(params: {
    score:  number;
    zip:    string;
    nowMs?: number;
  }): Promise<TimingAnalysis> {
    const { score, zip, nowMs = Date.now() } = params;

    const snap   = await marketDataService.getSnapshot(zip);
    const season = climateService.getSeason(new Date(nowMs).getMonth());

    // Premium estimate
    const premiumRange = score >= 40
      ? (premiumEstimateByZip(score, zip) ?? { low: 0, high: 0 })
      : { low: 0, high: 0 };

    // Market condition
    const marketCondition = deriveMarketCondition(
      snap.daysOnMarket, snap.listToSaleRatio, snap.inventoryTrend
    );

    // Composite listing score (0–100)
    const baseScore      = Math.min(score, 100);
    const seasonMult     = SEASON_MULTIPLIER[season];
    const marketBonus    = MARKET_LISTING_BONUS[marketCondition];
    const rawListingScore = baseScore * seasonMult + marketBonus;
    const listingScore   = Math.max(0, Math.min(100, Math.round(rawListingScore)));

    // Recommendation
    let recommendation: RecommendationType;
    if (score < 40)             recommendation = "wait";
    else if (listingScore >= 70) recommendation = "list_now";
    else if (listingScore < 45)  recommendation = "wait";
    else                         recommendation = "neutral";

    // Reasoning
    const reasoning: string[] = [];
    if (marketCondition === "hot")
      reasoning.push(`Homes in ${zip} are selling in ~${snap.daysOnMarket} days — a fast market favors sellers.`);
    else if (marketCondition === "cool")
      reasoning.push(`Inventory in ${zip} is elevated — buyers have more choices, which may compress your price.`);
    else
      reasoning.push(`The ${zip} market is balanced with ~${snap.daysOnMarket} days on market.`);

    if (snap.inventoryTrend === "rising")
      reasoning.push(`Active listings are growing (+${Math.abs(
        (await marketDataService.getInventoryTrend(zip)).monthOverMonthPct
      ).toFixed(1)}% MoM) — more supply competition ahead.`);
    else if (snap.inventoryTrend === "falling")
      reasoning.push(`Inventory is shrinking — fewer competing listings benefits your listing.`);

    if (season === "spring")
      reasoning.push("Spring is historically the strongest selling season with the most active buyers.");
    else if (season === "winter")
      reasoning.push("Winter listings typically see fewer showings — spring may yield a better result.");

    if (score >= 70)
      reasoning.push(`Your HomeGentic score of ${score} demonstrates verified maintenance history, supporting an estimated $${premiumRange.low.toLocaleString()}–$${premiumRange.high.toLocaleString()} premium.`);
    else if (score >= 40)
      reasoning.push(`Improving your HomeGentic score could add $${premiumRange.low.toLocaleString()}–$${premiumRange.high.toLocaleString()} in buyer confidence premium.`);
    else
      reasoning.push("Logging verified maintenance records before listing will strengthen buyer confidence.");

    // Headline
    let headline: string;
    if (recommendation === "list_now" && premiumRange.high > 0) {
      headline = `Listing now could yield an estimated $${premiumRange.low.toLocaleString()}–$${premiumRange.high.toLocaleString()} above market — ${season} conditions favor sellers in ${zip}.`;
    } else if (recommendation === "wait") {
      headline = score < 40
        ? "Build your HomeGentic score before listing to maximize your sale price."
        : `${season.charAt(0).toUpperCase() + season.slice(1)} market conditions in ${zip} suggest waiting for a better window.`;
    } else {
      const pct = Math.round((snap.listToSaleRatio - 1) * 100);
      headline = pct >= 0
        ? `Market is balanced in ${zip} — homes are selling at ${pct > 0 ? `${pct}% above` : ""} list price.`
        : `Market conditions in ${zip} are mixed — your HomeGentic score adds an estimated $${premiumRange.low.toLocaleString()} premium.`;
    }

    return {
      zip,
      score,
      season,
      marketCondition,
      estimatedPremium: premiumRange,
      listingScore,
      recommendation,
      headline,
      reasoning,
      daysOnMarket:   snap.daysOnMarket,
      activeListings: snap.activeListings,
      generatedAt:    Date.now(),
    };
  }

  async function getRecommendation(params: {
    score: number;
    zip:   string;
    nowMs?: number;
  }): Promise<ListingRecommendation> {
    const analysis     = await getAnalysis(params);
    const shouldListNow = analysis.recommendation === "list_now";
    const urgency: UrgencyLevel =
      analysis.listingScore >= 80 ? "high" :
      analysis.listingScore >= 55 ? "medium" : "low";

    return {
      shouldListNow,
      message:  analysis.headline,
      urgency,
      analysis,
    };
  }

  return { getAnalysis, getRecommendation };
}

export const marketTimingService = createMarketTimingService();
