/**
 * Where the Worker's canister clients send their calls.
 *
 * Read at call time, like the rest of the env: the Worker copies its bindings
 * into process.env per request, after these modules are imported. IC_HOST
 * overrides the host (the PocketIC tests point it at their HTTP gateway);
 * otherwise DFX_NETWORK=local means the local replica, anything else mainnet.
 * A local host has a self-signed root key, which the agent must fetch.
 */
export function icHost(): { host: string; local: boolean } {
  const local = process.env.DFX_NETWORK === "local";
  return { host: process.env.IC_HOST || (local ? "http://localhost:4943" : "https://ic0.app"), local };
}
