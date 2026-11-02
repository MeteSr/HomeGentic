/**
 * Where the Worker's canister clients send their calls.
 *
 * Read at call time, like the rest of the env: the Worker copies its bindings
 * into process.env per request, after these modules are imported. IC_HOST
 * overrides the host (the PocketIC tests point it at their HTTP gateway);
 * otherwise DFX_NETWORK=local means the local replica, anything else mainnet.
 * A local host has its own root key: ICP_ROOT_KEY (hex, from `icp network
 * status --json`). It is never fetched at runtime (canister-security skill).
 */
import { rootKeyFor } from "../../packages/shared/src/rootKey";

export function icHost(): { host: string; local: boolean; rootKey: Uint8Array | undefined } {
  const local = process.env.DFX_NETWORK === "local";
  const host  = process.env.IC_HOST || (local ? "http://localhost:4943" : "https://ic0.app");
  return { host, local, rootKey: rootKeyFor(host, process.env.ICP_ROOT_KEY) };
}
