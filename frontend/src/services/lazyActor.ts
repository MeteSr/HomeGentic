import { Actor, type HttpAgent } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import { getAgent } from "./actor";

/**
 * A lazily created actor for one canister, shared by a service module.
 *
 * The actor is rebuilt whenever `getAgent()` hands back a different agent.
 * login() and logout() replace the agent, so a service never keeps calling
 * with the identity of whoever was signed in when it first ran (an anonymous
 * visitor, or the previous user in the same tab).
 *
 *   const getActor = lazyActor(idlFactory, JOB_CANISTER_ID);
 *   const a = await getActor();
 *   getActor.reset();   // tests: drop the cached actor
 */
export function lazyActor(
  idlFactory: IDL.InterfaceFactory,
  canisterId: string | (() => string),
) {
  let cached: { agent: HttpAgent; actor: any } | null = null;
  const get = async (): Promise<any> => {
    const agent = await getAgent();
    if (!cached || cached.agent !== agent) {
      const id = typeof canisterId === "function" ? canisterId() : canisterId;
      cached = { agent, actor: Actor.createActor(idlFactory, { agent, canisterId: id }) };
    }
    return cached.actor;
  };
  return Object.assign(get, { reset: () => { cached = null; } });
}
