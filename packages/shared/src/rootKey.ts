/**
 * The root key an agent verifies responses with, for code that runs outside a
 * page served by the asset canister (the voice Worker, the relays, tests).
 *
 * Never fetched from the network at runtime (canister-security skill,
 * pitfall 7): a fetched key is whatever the host answers, so a wrong or
 * hostile host could forge every response. On mainnet this returns undefined
 * and the agent uses its built-in IC root key. For a local network the key is
 * passed in as hex, from `icp network status --json` (`root_key`), usually via
 * an ICP_ROOT_KEY environment variable.
 */

/** True for a local replica or PocketIC gateway address. */
export function isLocalHost(host: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(host);
}

/** Decodes a hex root key, or undefined when it is empty or malformed. */
export function rootKeyFromHex(hex: string | undefined): Uint8Array | undefined {
  const h = (hex ?? "").trim();
  if (!h || !/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0) return undefined;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * The rootKey option for an agent talking to `host`: the given local key for a
 * local host, otherwise undefined (mainnet's key is built into the agent). A
 * mainnet host never takes an injected key, so a stray ICP_ROOT_KEY can't
 * redirect trust.
 */
export function rootKeyFor(host: string, localKeyHex: string | undefined): Uint8Array | undefined {
  return isLocalHost(host) ? rootKeyFromHex(localKeyHex) : undefined;
}
