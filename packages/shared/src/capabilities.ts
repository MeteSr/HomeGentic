/**
 * What an AI assistant can find in HomeGentic and what it may do there, one
 * entry per capability (part of a home's record), so agents discover it from
 * one place and the permission rules can't drift apart.
 *
 * Two kinds of assistant read this:
 *  - Outside assistants (ChatGPT, Claude) through ICP MCP: they find each
 *    capability through the canister's line in the ic-architecture manifest
 *    (frontend/scripts/icArchitecture.mjs, which must name every
 *    `manifestTerms` entry, tested), then its getApiDoc() and OQL schema().
 *    What they may do is set by the canister's own access checks and the
 *    consent mode the user picked: "Questions only" allows queries,
 *    "Actions & questions" allows changes too.
 *  - The in-app assistant: every tool it has gets one scope below, and the
 *    browser enforces it (READ_ONLY_TOOLS in useVoiceAgent.ts, PLAN_STEP_TOOLS
 *    in assistantPlan.ts are both derived from it). `appOnly` lists what it
 *    has no tool for, so it can point the user to the right page instead.
 *
 * Every OQL entity a canister serves belongs to exactly one capability
 * (tested against the backend's *Oql.mo catalogues), so a new entity can't
 * ship without someone deciding where it belongs.
 */

/**
 * read: runs without asking (it can't change anything).
 * ask:  asks the user before each call.
 * plan: asks before each call, and may also be a step of a reviewed
 *       multi-step plan (one card, the user ticks what runs).
 */
export type AssistantScope = "read" | "ask" | "plan";

export const ASSISTANT_TOOL_SCOPES: Readonly<Record<string, AssistantScope>> = {
  // Reads
  query_home_records: "read",
  get_home_checkup: "read",
  prepare_home_task: "read",
  classify_home_issue: "read",
  draft_work_order: "read",
  search_contractors: "read",
  list_bids: "read",
  list_leads: "read",
  get_earnings_summary: "read",
  get_maintenance_forecast: "read",
  get_price_benchmark: "read",
  // Writes that may be steps of a reviewed plan
  schedule_maintenance_task: "plan",
  create_quote_request: "plan",
  create_insurance_claim: "plan",
  share_report: "plan",
  // Everything else asks first, every time
  propose_plan: "ask",
  get_score: "ask",
  create_maintenance_job: "ask",
  propose_job: "ask",
  confirm_job_proposal: "ask",
  sign_job_verification: "ask",
  update_job_status: "ask",
  upload_photos: "ask",
  accept_bid: "ask",
  decline_quote: "ask",
  submit_bid: "ask",
  submit_contractor_review: "ask",
  revoke_report_link: "ask",
  add_property: "ask",
  add_room: "ask",
  add_recurring_service: "ask",
};

export interface Capability {
  id: string;
  label: string;
  /** What it holds, in a sentence. */
  about: string;
  /** The canister that stores it and checks who may see it. */
  canister: string;
  /** Words its canister's ICP MCP manifest description must contain. Empty when the canister isn't exposed. */
  manifestTerms: string[];
  /** OQL entities on `canister` that read it (schema/execute; query_home_records in the app). */
  oql: string[];
  /** The in-app assistant's tools that touch it. */
  tools: string[];
  /** What the in-app assistant has no tool for: the user does it in the app. Written for people. */
  appOnly: string[];
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "homes",
    label: "Homes",
    about: "The user's homes, rooms and fixtures, who may act on each home, and the move-in plan.",
    canister: "property",
    manifestTerms: ["homes", "rooms", "fixtures", "move-in"],
    oql: ["homes", "rooms", "fixtures", "move_in_tasks"],
    tools: ["query_home_records", "add_property", "add_room", "get_home_checkup"],
    appOnly: [
      "Transfer a home to a buyer",
      "Verify ownership of a home",
      "Invite or remove co-owners and managers",
      "Read or edit the house guide",
    ],
  },
  {
    id: "insurance",
    label: "Insurance",
    about: "The home insurance policy on file, the household's own claim records and the contents inventory.",
    canister: "property",
    manifestTerms: ["insurance policies", "claims", "inventory"],
    oql: ["insurance_policies", "insurance_claims", "inventory_items"],
    tools: ["query_home_records", "get_home_checkup", "prepare_home_task", "create_insurance_claim"],
    appOnly: ["Save or change the insurance policy on file", "File a claim with the insurer"],
  },
  {
    id: "home-finance",
    label: "Warranty, mortgage, tax, HOA and flood",
    about:
      "Home warranty plans and claims, mortgages and property tax (owner and co-owners only), HOA fees and reviews, and FEMA flood zones.",
    canister: "property",
    manifestTerms: ["warranty", "mortgage", "property tax", "HOA", "flood"],
    oql: [
      "warranty_plans",
      "warranty_claims",
      "mortgages",
      "tax_years",
      "hoa_assessments",
      "hoa_reviews",
      "flood_zones",
    ],
    tools: ["query_home_records"],
    appOnly: ["Change warranty, mortgage, tax, HOA or flood records"],
  },
  {
    id: "jobs",
    label: "Maintenance record",
    about:
      "Work done on a home (repairs, servicing, upgrades), signed by the homeowner and the contractor, with permits, lien waivers and improvement marks.",
    canister: "job",
    manifestTerms: ["jobs", "permits", "lien waivers", "improvements"],
    oql: ["jobs"],
    tools: [
      "query_home_records",
      "classify_home_issue",
      "draft_work_order",
      "create_maintenance_job",
      "propose_job",
      "confirm_job_proposal",
      "sign_job_verification",
      "update_job_status",
      "upload_photos",
    ],
    appOnly: ["Record permit close-outs and lien waivers"],
  },
  {
    id: "maintenance",
    label: "Maintenance plan",
    about: "How long each major system is likely to last, and the tasks the household planned for each month.",
    canister: "maintenance",
    manifestTerms: ["lifespan", "schedule"],
    oql: ["planned_tasks"],
    tools: ["query_home_records", "get_maintenance_forecast", "schedule_maintenance_task", "prepare_home_task"],
    appOnly: [],
  },
  {
    id: "recurring",
    label: "Service contracts",
    about: "Recurring services such as HVAC servicing, pest control and lawn care, and the log of each visit.",
    canister: "recurring",
    manifestTerms: ["service contracts", "visit"],
    oql: ["services", "visits"],
    tools: ["query_home_records", "add_recurring_service"],
    appOnly: [],
  },
  {
    id: "bills",
    label: "Bills",
    about:
      "Utility bills with usage and the jump flag, and fixed home costs such as the mortgage payment, tax, HOA and insurance.",
    canister: "bills",
    manifestTerms: ["utility bills", "recurring home expenses"],
    oql: ["bills", "recurring_expenses"],
    tools: ["query_home_records"],
    appOnly: ["Add or upload utility bills"],
  },
  {
    id: "sensors",
    label: "Smart-home devices",
    about: "Devices linked to a home and the readings and alerts they reported (leaks, HVAC faults, humidity, solar).",
    canister: "sensor",
    manifestTerms: ["devices", "alerts"],
    oql: ["devices", "events"],
    tools: ["query_home_records"],
    appOnly: ["Link or remove smart-home devices"],
  },
  {
    id: "quotes",
    label: "Quotes",
    about:
      "Quote requests the homeowner opens, contractors' bids on them, visit bookings, and price ranges for the work.",
    canister: "quote",
    manifestTerms: ["quote requests", "bids", "referral fee"],
    oql: [],
    tools: [
      "create_quote_request",
      "list_bids",
      "accept_bid",
      "decline_quote",
      "get_price_benchmark",
      "prepare_home_task",
    ],
    appOnly: ["Pay a contractor", "Book a visit time"],
  },
  {
    id: "contractors",
    label: "Contractor directory",
    about: "Contractor profiles, trust scores and reviews.",
    canister: "contractor",
    manifestTerms: ["contractor profiles", "trust scores", "reviews"],
    oql: [],
    tools: ["search_contractors", "submit_contractor_review", "prepare_home_task"],
    appOnly: [],
  },
  {
    id: "leads",
    label: "Contractor leads",
    about: "For contractors: open quote requests that match their trades, their bids and earnings.",
    canister: "quote",
    manifestTerms: ["bids from contractors"],
    oql: [],
    tools: ["list_leads", "submit_bid", "get_earnings_summary"],
    appOnly: [],
  },
  {
    id: "reports",
    label: "Reports",
    about: "The home's HomeGentic score and report snapshots shared by link.",
    canister: "report",
    manifestTerms: [],
    oql: [],
    tools: ["get_score", "share_report", "revoke_report_link"],
    appOnly: [],
  },
  {
    id: "documents",
    label: "Documents",
    about:
      "Papers saved in the home's document vault; the assistant sees their names, kinds and dates, never their contents.",
    canister: "photo",
    manifestTerms: [],
    oql: [],
    tools: ["get_home_checkup", "upload_photos"],
    appOnly: ["Open or read a saved document"],
  },
  {
    id: "account",
    label: "Account and subscription",
    about: "The user's plan, payments to HomeGentic and account settings.",
    canister: "payment",
    manifestTerms: [],
    oql: [],
    tools: [],
    appOnly: ["Change or cancel the subscription", "Delete the account"],
  },
  {
    id: "selling",
    label: "Selling",
    about: "For-sale-by-owner listings and Bid to List, where agents compete to list the home.",
    canister: "listing",
    manifestTerms: [],
    oql: [],
    tools: [],
    appOnly: ["List the home for sale or run Bid to List"],
  },
];

/** The tools with this scope. */
export function toolsWithScope(scope: AssistantScope): string[] {
  return Object.entries(ASSISTANT_TOOL_SCOPES)
    .filter(([, s]) => s === scope)
    .map(([t]) => t);
}

/** Every action only the user can do in the app, in catalogue order, each once. */
export function appOnlyActions(): string[] {
  return [...new Set(CAPABILITIES.flatMap((c) => c.appOnly))];
}
