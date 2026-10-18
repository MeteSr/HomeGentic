/**
 * Minimal anonymous client for the job canister's invite-token preview.
 *
 * getJobByInviteToken is a public query (the token is the credential), so no
 * identity is needed. The Worker uses it to build contractor-invite emails
 * from canister data instead of trusting text the browser sends. Env is read
 * at call time (the Worker copies its bindings into process.env per request).
 */
import { HttpAgent, Actor } from "@icp-sdk/core/agent";

export interface InvitePreview {
  jobId:           string;
  title:           string;
  serviceType:     string;
  amount:          bigint;
  propertyAddress: string;
  contractorName:  string | null;
  expiresAt:       bigint;   // ns
  alreadySigned:   boolean;
}

const SERVICE_TYPES = [
  "Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows",
  "Landscaping", "Gutters", "GeneralHandyman", "Pest", "Concrete", "Fencing",
  "Insulation", "Solar", "Pool", "Foundation", "Drywall", "KitchenRemodel",
  "BathroomRemodel", "Other",
];

const idlFactory = ({ IDL }: { IDL: any }) => {
  const ServiceType = IDL.Variant(Object.fromEntries(SERVICE_TYPES.map((t) => [t, IDL.Null])));
  const Preview = IDL.Record({
    jobId:           IDL.Text,
    title:           IDL.Text,
    serviceType:     ServiceType,
    description:     IDL.Text,
    amount:          IDL.Nat,
    completedDate:   IDL.Int,
    propertyAddress: IDL.Text,
    contractorName:  IDL.Opt(IDL.Text),
    expiresAt:       IDL.Int,
    alreadySigned:   IDL.Bool,
  });
  return IDL.Service({
    // err is decoded as `reserved` so this client doesn't have to track the
    // job canister's Error variant.
    getJobByInviteToken: IDL.Func([IDL.Text], [IDL.Variant({ ok: Preview, err: IDL.Reserved })], ["query"]),
  });
};

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

/** The invite preview for `token`, or null if the canister doesn't know it. Throws if unreachable. */
export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const canisterId = process.env.CANISTER_ID_JOB;
  if (!canisterId) throw new Error("CANISTER_ID_JOB is not set — cannot look up invite tokens");
  const actor = Actor.createActor(idlFactory, {
    agent: await agentFor(process.env.DFX_NETWORK === "local"),
    canisterId,
  }) as any;
  const res = await actor.getJobByInviteToken(token);
  if (!("ok" in res)) return null;
  const p = res.ok;
  return {
    jobId:           p.jobId,
    title:           p.title,
    serviceType:     Object.keys(p.serviceType)[0] ?? "Other",
    amount:          p.amount,
    propertyAddress: p.propertyAddress,
    contractorName:  p.contractorName.length ? p.contractorName[0] : null,
    expiresAt:       p.expiresAt,
    alreadySigned:   p.alreadySigned,
  };
}
