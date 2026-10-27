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

/** Forgets the agent on sign-out so a later call can't use the old identity. */
export function clearIcpAgent(): void {
  _agent = null;
}

export function getIcpAgent(): HttpAgent {
  if (!_agent) {
    throw new Error(
      "You're signed out. Sign in again to continue."
    );
  }
  return _agent;
}
