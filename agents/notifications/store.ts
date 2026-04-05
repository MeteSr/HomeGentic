import type { Platform, TokenRecord } from "./types";

// principal → list of device tokens (one user may have multiple devices)
const registry = new Map<string, TokenRecord[]>();

export function registerToken(principal: string, token: string, platform: Platform): void {
  const existing = registry.get(principal) ?? [];
  const idx      = existing.findIndex((r) => r.token === token);
  const record: TokenRecord = { token, platform, updatedAt: Date.now() };
  if (idx >= 0) {
    existing[idx] = record;
  } else {
    existing.push(record);
  }
  registry.set(principal, existing);
}

export function getTokensForPrincipal(principal: string): TokenRecord[] {
  return registry.get(principal) ?? [];
}

export function getAllPrincipals(): string[] {
  return Array.from(registry.keys());
}

export function removeToken(token: string): void {
  for (const [principal, records] of registry.entries()) {
    const filtered = records.filter((r) => r.token !== token);
    if (filtered.length === 0) {
      registry.delete(principal);
    } else if (filtered.length < records.length) {
      registry.set(principal, filtered);
    }
  }
}
