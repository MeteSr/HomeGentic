/**
 * Minimal client for the auth canister's voice-agent session lookup.
 *
 * resolveAgentSession is a public query (the token is the secret), so this
 * uses an anonymous agent — no admin identity needed. Env is read at call
 * time because the Cloudflare Worker copies its bindings into process.env
 * per request, after this module is imported.
 */
import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

const idlFactory = ({ IDL }: { IDL: any }) =>
  IDL.Service({
    resolveAgentSession: IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], ["query"]),
  });

type AuthActor = { resolveAgentSession(token: string): Promise<[] | [Principal]> };

const agents = new Map<string, Promise<HttpAgent>>();

function agentFor(local: boolean): Promise<HttpAgent> {
  const host = local ? "http://localhost:4943" : "https://ic0.app";
  let agent = agents.get(host);
  if (!agent) {
    agent = HttpAgent.create({ host, shouldFetchRootKey: local });
    agents.set(host, agent);
  }
  return agent;
}

/** Principal (text) that owns a live session token, or null. Throws if the canister can't be reached. */
export async function resolveAgentSessionOwner(token: string): Promise<string | null> {
  const canisterId = process.env.CANISTER_ID_AUTH;
  if (!canisterId) throw new Error("CANISTER_ID_AUTH is not set — cannot resolve agent sessions");
  const actor = Actor.createActor(idlFactory, {
    agent: await agentFor(process.env.DFX_NETWORK === "local"),
    canisterId,
  }) as unknown as AuthActor;
  const owner = await actor.resolveAgentSession(token);
  return owner.length ? owner[0].toText() : null;
}
