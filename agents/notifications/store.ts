import { loadSection, saveSection } from "./persist";
import type { Platform, TokenRecord } from "./types";

// principal → list of device tokens (one user may have multiple devices)
const registry = new Map<string, TokenRecord[]>(
  Object.entries(loadSection<Record<string, TokenRecord[]>>("tokens", {})),
);

function save(): void {
  saveSection("tokens", Object.fromEntries(registry));
}

export function registerToken(principal: string, token: string, platform: Platform): void {
  // One device, one user: if another principal signed in on this device
  // before, stop sending them pushes here.
  for (const [other, records] of registry.entries()) {
    if (other === principal) continue;
    const kept = records.filter((r) => r.token !== token);
    if (kept.length === records.length) continue;
    if (kept.length === 0) registry.delete(other); else registry.set(other, kept);
  }
  const existing = registry.get(principal) ?? [];
  const idx      = existing.findIndex((r) => r.token === token);
  const record: TokenRecord = { token, platform, updatedAt: Date.now() };
  if (idx >= 0) {
    existing[idx] = record;
  } else {
    existing.push(record);
  }
  registry.set(principal, existing);
  save();
}

export function getTokensForPrincipal(principal: string): TokenRecord[] {
  return registry.get(principal) ?? [];
}

export function getAllPrincipals(): string[] {
  return Array.from(registry.keys());
}

export function removeToken(token: string): void {
  // A device token belongs to one device; drop it wherever it was registered
  // (it moves to the new principal when a different user signs in).
  let changed = false;
  for (const [principal, records] of registry.entries()) {
    const filtered = records.filter((r) => r.token !== token);
    if (filtered.length === records.length) continue;
    changed = true;
    if (filtered.length === 0) {
      registry.delete(principal);
    } else {
      registry.set(principal, filtered);
    }
  }
  if (changed) save();
}
