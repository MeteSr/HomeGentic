/**
 * Interface for resolving an agent-session token with a replicated call.
 *
 * `auth.resolveAgentSession` is a query, and a plain query is answered by a
 * single replica. The Worker, notification relay and IoT gateway act for the
 * principal it returns, so one faulty replica could map any token to any
 * principal (canister-security skill, "IC Security Model" point 2). Declaring
 * the method here without the `query` annotation makes agent-js send it as an
 * update call: every replica runs it, and the answer is certified by the
 * subnet. The canister method itself stays a query, so its Candid interface
 * (and `declarations/auth.ts`) is unchanged.
 */

// oxlint-disable-next-line typescript/no-explicit-any -- same factory shape as declarations/
export const sessionLookupIdl = ({ IDL }: any) =>
  IDL.Service({
    resolveAgentSession: IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], []),
  });
