/**
 * Signing for signed-out visitors.
 *
 * Canisters reject anonymous update calls (system func inspect), so a public
 * page that writes something, like a buyer's showing request, signs with a key
 * generated in this browser and kept in localStorage. The key identifies the
 * browser to the canister's per-buyer limits; it carries no account and no
 * personal data. A signed-in user signs as themselves.
 */
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { idlFactory } from "@homegentic/shared/declarations/listing";
import { getAgent } from "./actor";

const KEY_STORAGE = "hg_visitor_key";
const DFX_NETWORK = (process.env as any).DFX_NETWORK || "local";
const IS_LOCAL    = DFX_NETWORK === "local";

let _visitor: HttpAgent | null = null;

function loadOrCreateIdentity(): Ed25519KeyIdentity {
  try {
    const saved = localStorage.getItem(KEY_STORAGE);
    if (saved) return Ed25519KeyIdentity.fromJSON(saved);
  } catch { /* unreadable or blocked storage: make a new key */ }
  const identity = Ed25519KeyIdentity.generate();
  try { localStorage.setItem(KEY_STORAGE, JSON.stringify(identity.toJSON())); } catch { /* private mode */ }
  return identity;
}

/** The signed-in user's agent, or one signing with this browser's visitor key. */
export async function visitorAgent(): Promise<HttpAgent> {
  const agent = await getAgent();
  if (!(await agent.getPrincipal()).isAnonymous()) return agent;
  if (!_visitor) {
    _visitor = await HttpAgent.create({
      identity: loadOrCreateIdentity(),
      host:     IS_LOCAL ? "http://localhost:4943" : "https://ic0.app",
    });
    if (IS_LOCAL) await _visitor.fetchRootKey().catch(() => {});
  }
  return _visitor;
}

export async function visitorListingActor(canisterId: string): Promise<any> {
  return Actor.createActor(idlFactory, { agent: await visitorAgent(), canisterId });
}
