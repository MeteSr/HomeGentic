import type { PushSubscription } from "web-push";
import { loadSection, saveSection } from "./persist";

// principal → list of browser push subscriptions
const registry = new Map<string, PushSubscription[]>(
  Object.entries(loadSection<Record<string, PushSubscription[]>>("subscriptions", {})),
);

function save(): void {
  saveSection("subscriptions", Object.fromEntries(registry));
}

export function registerSubscription(principal: string, subscription: PushSubscription): void {
  // One browser endpoint, one user (see store.ts registerToken).
  for (const [other, subs] of registry.entries()) {
    if (other === principal) continue;
    const kept = subs.filter((s) => s.endpoint !== subscription.endpoint);
    if (kept.length === subs.length) continue;
    if (kept.length === 0) registry.delete(other); else registry.set(other, kept);
  }
  const existing = registry.get(principal) ?? [];
  const idx = existing.findIndex((s) => s.endpoint === subscription.endpoint);
  if (idx >= 0) {
    existing[idx] = subscription;
  } else {
    existing.push(subscription);
  }
  registry.set(principal, existing);
  save();
}

export function getSubscriptionsForPrincipal(principal: string): PushSubscription[] {
  return registry.get(principal) ?? [];
}

export function removeSubscription(endpoint: string): void {
  let changed = false;
  for (const [principal, subs] of registry.entries()) {
    const filtered = subs.filter((s) => s.endpoint !== endpoint);
    if (filtered.length === subs.length) continue;
    changed = true;
    if (filtered.length === 0) {
      registry.delete(principal);
    } else {
      registry.set(principal, filtered);
    }
  }
  if (changed) save();
}
