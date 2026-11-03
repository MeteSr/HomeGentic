/**
 * ICP MCP discoverability files (service-discoverability skill, Layers 1 and 5).
 *
 *   /.well-known/ic-architecture       the canisters an AI assistant may read
 *                                      and call through ICP MCP, as JSON
 *   /.well-known/ii-derivation-origin  the Internet Identity origin users'
 *                                      principals are derived for
 *
 * Publishing ic-architecture opts HomeGentic into ICP MCP and is the
 * operator's acceptance of DFINITY's ICP MCP App Operator Terms
 * (https://internetcomputer.org/icp-mcp/app-operator-terms/). Mete, as
 * operator, approved it on 2026-11-02. Every canister listed here can receive
 * query and update calls from assistants acting for signed-in users, so add a
 * canister only after deciding it should be reachable, and give it a
 * getApiDoc() (backend/<name>/ApiDoc.mo). Removing the manifest is the off
 * switch; ending the agreement is a separate notice to mcp@dfinity.org.
 *
 * Deliberately left out: payment, fee and listing (money: payment.subscribe
 * charges ICP and isn't caught by the connector's keyword filter), auth
 * (sessions, account deletion), photo, sensor, agent, market, and the
 * operations canisters. ICP MCP probes at most eight canisters per app.
 *
 * Canister IDs come from CANISTER_ID_* in .env (scripts/deploy.sh writes them
 * before the frontend build), so the manifest always matches the environment
 * being deployed. Nothing is written for a local build, where the IDs are
 * missing or local, or when ICP_MCP_DISABLED=1 (the off switch: rebuild and
 * redeploy the frontend with it set, and ICP MCP stops reaching the canisters).
 */

export const EXPOSED = [
  {
    name: "property",
    role: "properties",
    description:
      "The user's homes, rooms and fixtures, and who may act on each home. Start here for propertyIds. Call getApiDoc() first.",
  },
  {
    name: "job",
    role: "maintenance record",
    description:
      "Jobs done on a home (repairs, servicing, upgrades), signed by homeowner and contractor. Call getApiDoc() first.",
  },
  {
    name: "maintenance",
    role: "maintenance planning",
    description: "System lifespan predictions and the owner's planned maintenance schedule. Call getApiDoc() first.",
  },
  {
    name: "recurring",
    role: "service contracts",
    description: "Recurring service contracts (HVAC, pest, landscaping) and visit logs. Call getApiDoc() first.",
  },
  {
    name: "bills",
    role: "utility bills",
    description:
      "Utility bills and recurring home expenses, with usage trends and spike detection. Call getApiDoc() first.",
  },
  {
    name: "report",
    role: "shareable reports",
    description:
      "Signed snapshots of a home's record with share links for buyers and insurers. Call getApiDoc() first.",
  },
  {
    name: "contractor",
    role: "contractor directory",
    description: "Contractor profiles, trust scores and reviews. Call getApiDoc() first.",
  },
  {
    name: "quote",
    role: "quotes",
    description:
      "Quote requests from homeowners and bids from contractors; accepting a bid can record a referral fee charged to the contractor. Call getApiDoc() first.",
  },
];

const PRINCIPAL = /^[a-z0-9]{5}(-[a-z0-9]{1,5})+$/;
const DEPLOYED = new Set(["testnet", "ic"]);

/**
 * The files to write under dist/.well-known, by name, with their bodies as
 * text. Empty for a local build. Throws when a deployed build (DFX_NETWORK
 * testnet or ic) is missing an ID, so a deploy never ships a partial manifest.
 */
export function discoveryFiles(env) {
  const network = (env.DFX_NETWORK ?? "").trim();
  if (!DEPLOYED.has(network) || (env.ICP_MCP_DISABLED ?? "").trim() === "1") return {};

  const missing = [];
  const canisters = EXPOSED.map(({ name, role, description }) => {
    const id = (env[`CANISTER_ID_${name.toUpperCase()}`] ?? "").trim();
    if (!PRINCIPAL.test(id)) missing.push(`CANISTER_ID_${name.toUpperCase()}`);
    return { id, name, role, description };
  });

  const origin = (env.II_DERIVATION_ORIGIN ?? "").trim();
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) missing.push("II_DERIVATION_ORIGIN");

  if (missing.length) {
    throw new Error(`ICP MCP files for ${network} need ${missing.join(", ")} (set by scripts/deploy.sh)`);
  }

  return {
    "ic-architecture": JSON.stringify({ version: "1.0.0", canisters }, null, 2) + "\n",
    "ii-derivation-origin": origin + "\n",
  };
}
