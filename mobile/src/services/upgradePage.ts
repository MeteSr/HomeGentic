/**
 * Plans are sold only on homegentic.app (issue #50 — no in-app purchases).
 * The app reads the plan from the payment canister, so a purchase made in the
 * browser unlocks the app with no restore step.
 */
import { Linking } from "react-native";

export const PRICING_URL = "https://homegentic.app/pricing";
export const ACCOUNT_URL = "https://homegentic.app/account";

/** Opens the pricing page in the browser. */
export function openUpgradePage(): Promise<void> {
  return Linking.openURL(PRICING_URL);
}

/** Opens billing management (renewal, card, cancellation) in the browser. */
export function openAccountPage(): Promise<void> {
  return Linking.openURL(ACCOUNT_URL);
}
