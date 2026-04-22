/**
 * Module-level ICP agent store for the mobile app.
 *
 * The HttpAgent is built by useAuth after the user logs in (see auth/useAuth.ts)
 * and stored here so service functions can access it without needing it passed
 * through every call site.
 */
import { HttpAgent } from "@icp-sdk/core/agent";

let _agent: HttpAgent | null = null;

export function setIcpAgent(agent: HttpAgent): void {
  _agent = agent;
}

export function getIcpAgent(): HttpAgent {
  if (!_agent) {
    throw new Error(
      "ICP agent not initialized. Ensure the user is authenticated before calling canister services."
    );
  }
  return _agent;
}
