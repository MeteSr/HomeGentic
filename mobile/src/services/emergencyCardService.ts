/**
 * #715: the emergency card on the phone. The card is fetched from the property
 * canister (house guide + insurance policy) while online, and a copy is kept
 * on the phone so it still opens when storms take out power and cell data.
 *
 * The phone copy leaves out alarm notes, since they can hold an alarm code;
 * copies are per signed-in person and are wiped on sign-out.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import { buildEmergencyCard, type EmergencyCard } from "@homegentic/shared/emergency";
import { actorFor, unwrap } from "./canister";

const PROPERTY_CANISTER_ID = process.env.EXPO_PUBLIC_PROPERTY_CANISTER_ID ?? "";
const PREFIX = "homegentic_emergency_card_";
const keyFor = (scope: string, propertyId: string) => `${PREFIX}${scope}_${propertyId}`;

export interface LoadedEmergencyCard {
  card: EmergencyCard;
  /** When this copy was fetched (ms). */
  savedAt: number;
  /** True when the network failed and this is the copy kept on the phone. */
  fromPhone: boolean;
}

export async function fetchEmergencyCard(propertyId: string, agent?: HttpAgent): Promise<EmergencyCard> {
  const a = actorFor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID, agent);
  const [guideRes, policyRes] = await Promise.all([a.getHouseGuide(propertyId), a.getInsurancePolicy(propertyId)]);
  const guide = unwrap(guideRes)[0] ?? null;
  const policy = unwrap(policyRes)[0] ?? null;
  return buildEmergencyCard({
    guide,
    policy: policy ? { carrier: policy.carrier, policyNumber: policy.policyNumber } : null,
    // Setup photos need the network; the phone card is text only.
    photos: [],
  });
}

/** The live card, saved to the phone as it comes in; the saved copy when offline; null when neither. */
export async function loadEmergencyCard(
  propertyId: string,
  scope: string,
  fetcher: (propertyId: string) => Promise<EmergencyCard> = fetchEmergencyCard,
  now: () => number = Date.now,
): Promise<LoadedEmergencyCard | null> {
  const key = keyFor(scope, propertyId);
  try {
    const card = await fetcher(propertyId);
    const savedAt = now();
    await AsyncStorage.setItem(key, JSON.stringify({ card: { ...card, alarm: "" }, savedAt })).catch(() => {});
    return { card, savedAt, fromPhone: false };
  } catch {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { card: EmergencyCard; savedAt: number };
      if (!saved?.card || !Array.isArray(saved.card.shutoffs)) return null;
      return { card: saved.card, savedAt: saved.savedAt, fromPhone: true };
    } catch {
      return null;
    }
  }
}

export async function clearSavedEmergencyCards(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((k) => AsyncStorage.removeItem(k)));
}
