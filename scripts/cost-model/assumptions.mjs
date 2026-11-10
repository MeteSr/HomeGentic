// Inputs to the per-user cost model (docs/UNIT_ECONOMICS.md).
//
// Every number here is either a list price (with its source and the date it was
// checked) or an estimate of how people use the app. No production usage data
// exists yet (nothing is on mainnet), so the usage profiles are estimates
// bounded by the caps the code enforces; replace them with measured numbers
// once the Worker's usage events and the monitoring canister have real traffic.
// After changing anything here, run `node scripts/cost-model/costModel.mjs --write`.

export const CHECKED = "2026-11-10";

export const PRICES = {
  ai: {
    // AI_MODEL in agents/voice/wrangler.toml. Anthropic list price, per million tokens.
    model: "claude-sonnet-5-5",
    inputPerM: 2,
    outputPerM: 10,
    cacheReadMultiplier: 0.05, // cache reads $0.10/M on Sonnet 5.5
    // Token sizes below were measured for Sonnet 4.6's tokenizer; the newer
    // tokenizer counts the same text as ~1–1.35× the tokens. Re-measure with
    // count_tokens or the Worker's usage logs and replace this factor.
    tokenizerFactor: 1.2,
    // FREE_AI_DAILY_TOKEN_BUDGET (wrangler.toml): input + 5 × output, all free accounts, per UTC day.
    freeDailyWeightedBudget: 10_000_000,
    outputWeight: 5,
  },
  // Tokens per call, measured from the code where possible:
  //  chat:  buildSystemPrompt with 1 home + 10 jobs is ~8,000 chars (~2,000 tokens); maxTokens 200.
  //  agent: HOMEGENTIC_TOOLS is 26,700 chars of JSON (~6,700 tokens) + the same system prompt
  //         + ~1,500 tokens of conversation and tool results; maxTokens 1,024. The tool
  //         list is prompt-cached (anthropicProvider.requestBody) and identical for every
  //         user, so it's billed at the cache-read rate; the cached system prompt's write
  //         and reads roughly cancel out over a question's turns, so it's counted at full price.
  //  aux:   document/bill extraction, classify, negotiate… (a 3–5 page PDF ~6,000 tokens); 400–2,048 out.
  tokens: {
    chat: { inputTokens: 2_100, outputTokens: 150 },
    agent: { inputTokens: 10_200, outputTokens: 300, cachedInputTokens: 6_700 },
    aux: { inputTokens: 6_000, outputTokens: 500 },
  },
  stripe: {
    cardPct: 0.029,
    cardFixed: 0.3, // https://stripe.com/pricing (US cards)
    billingPct: 0.007, // Stripe Billing on subscription volume
    identityCheck: 1.5, // Stripe Identity, document + selfie, per verification
  },
  resend: {
    // https://resend.com/pricing: Free 3,000/mo; Pro $20 for 50,000; Scale $90 for 100,000;
    // $0.90 per 1,000 over the plan.
    steps: [
      { upTo: 3_000, monthly: 0 },
      { upTo: 50_000, monthly: 20 },
      { upTo: 100_000, monthly: 90 },
    ],
    overPer1k: 0.9,
  },
  twilio: {
    sms: 0.0125, // US SMS segment $0.0083 + A2P 10DLC carrier fee (~$0.004)
    verify: 0.05, // Verify, per successful confirmation (+ the SMS itself)
    fixedMonthly: 12, // phone number + 10DLC campaign fee
  },
  r2: {
    // https://developers.cloudflare.com/r2/pricing/ (no egress fees)
    storagePerGBMonth: 0.015,
    classAPerM: 4.5, // writes
    classBPerM: 0.36, // reads
  },
  workers: {
    // Workers Paid: $5/mo incl. 10M requests; Durable Objects 1M requests included.
    base: 5,
    requestsPerM: 0.3,
    doRequestsPerM: 0.15,
    includedRequests: 10_000_000,
    includedDoRequests: 1_000_000,
  },
  icp: {
    usdPerTCycles: 1.35, // 1T cycles = 1 XDR; XDR ≈ $1.35 (floats with the SDR basket)
    updateCallCycles: 20e6, // ingress + 5M base + ~20M instructions + one inter-canister call
    storageTCyclesPerGiBYear: 4.0, // 127k cycles/GiB/s on a 13-node subnet
    heapOverhead: 3, // Motoko heap overhead over raw record bytes (maps, boxing)
    thresholdCallCycles: 26.15e9, // vetkd_derive_key / sign_with_schnorr on key_1
  },
  thirdParty: {
    places: 0.017, // Google Places (New) autocomplete session + Place Details, per address entered
    attom: 0.25, // ATTOM property lookup (contract price; estimate)
    permits: 0.1, // OpenPermit import (contract price; estimate)
    rentcast: 0.074, // Rentcast Foundation plan, $74 / 1,000 calls
  },
  fly: { machine: 3.32, volumeGB: 0.15 }, // shared-cpu-1x 512 MB, iad
};

// What each kind of user does in a month. Caps from the code bound "heavy":
// Free 10 agent calls/week, 3 chats/day; Pro / ContractorPro 10 agent calls/day,
// 200 chats/day, 200 aux AI calls/day (agentLimiter.ts, rateLimiter.ts).
//
// storedGB is what the user has accumulated after about two years.
// emails = weekly Home Pulse (4.3/mo, on by default) + notifications.
// threshold = vetKD score views + signed report links/certificates + sealed-bid reveals.
// oneTimePerYear = Stripe Identity checks, address lookups, ATTOM, permit imports,
// Rentcast prefill, amortised per month.
const p = (o) => ({
  agentCalls: 0,
  chatCalls: 0,
  auxAiCalls: 0,
  photos: 0,
  docs: 0,
  storedGB: 0,
  emails: 0,
  sms: 0,
  updateCalls: 0,
  onChainKB: 50,
  threshold: 0,
  workerRequests: 0,
  identityChecks: 0,
  addressLookups: 0,
  attom: 0,
  permits: 0,
  rentcast: 0,
  phoneVerifies: 0,
  ...o,
});

export const PROFILES = {
  free: {
    light: p({
      chatCalls: 4,
      auxAiCalls: 1,
      photos: 2,
      emails: 4.3,
      updateCalls: 20,
      workerRequests: 60,
      storedGB: 0.01,
      threshold: 1,
      addressLookups: 1 / 24,
      identityChecks: 0.3 / 24,
      attom: 1 / 24,
      rentcast: 1 / 24,
    }),
    typical: p({
      agentCalls: 8,
      chatCalls: 20,
      auxAiCalls: 4,
      photos: 6,
      docs: 2,
      emails: 6,
      updateCalls: 60,
      workerRequests: 200,
      storedGB: 0.05,
      threshold: 3,
      onChainKB: 100,
      addressLookups: 1 / 24,
      identityChecks: 0.5 / 24,
      attom: 1 / 24,
      permits: 1 / 24,
      rentcast: 1 / 24,
    }),
    // Caps maxed on agent (10/week) and chat (3/day); aux AI is 25/day by cap, 2/day here.
    heavy: p({
      agentCalls: 43.5,
      chatCalls: 91,
      auxAiCalls: 60,
      photos: 20,
      docs: 10,
      emails: 10,
      sms: 4,
      updateCalls: 250,
      workerRequests: 800,
      storedGB: 0.15,
      threshold: 8,
      onChainKB: 1_000,
      addressLookups: 1 / 12,
      identityChecks: 1 / 24,
      attom: 1 / 12,
      permits: 1 / 12,
      rentcast: 1 / 12,
      phoneVerifies: 1 / 24,
    }),
  },
  pro: {
    light: p({
      agentCalls: 5,
      chatCalls: 10,
      auxAiCalls: 2,
      photos: 3,
      docs: 2,
      emails: 4.3,
      updateCalls: 40,
      workerRequests: 120,
      storedGB: 0.02,
      threshold: 1,
      addressLookups: 1 / 24,
      identityChecks: 1 / 24,
      attom: 1 / 24,
      rentcast: 1 / 24,
    }),
    typical: p({
      agentCalls: 30,
      chatCalls: 60,
      auxAiCalls: 10,
      photos: 15,
      docs: 5,
      emails: 8,
      sms: 4,
      updateCalls: 150,
      workerRequests: 500,
      storedGB: 0.15,
      threshold: 6,
      onChainKB: 300,
      addressLookups: 1.5 / 24,
      identityChecks: 1.5 / 24,
      attom: 1.5 / 24,
      permits: 1.5 / 24,
      rentcast: 1.5 / 24,
      phoneVerifies: 1 / 24,
    }),
    heavy: p({
      agentCalls: 150,
      chatCalls: 300,
      auxAiCalls: 60,
      photos: 60,
      docs: 20,
      emails: 15,
      sms: 20,
      updateCalls: 600,
      workerRequests: 2_000,
      storedGB: 0.8,
      threshold: 20,
      onChainKB: 3_000,
      addressLookups: 5 / 24,
      identityChecks: 5 / 24,
      attom: 5 / 24,
      permits: 5 / 24,
      rentcast: 5 / 24,
      phoneVerifies: 1 / 24,
    }),
    // Every daily cap maxed every day (abuse ceiling, not a usage forecast).
    ceiling: p({
      agentCalls: 304,
      chatCalls: 6_080,
      auxAiCalls: 6_080,
      photos: 200,
      docs: 50,
      emails: 30,
      sms: 60,
      updateCalls: 3_000,
      workerRequests: 20_000,
      storedGB: 2,
      threshold: 90,
      onChainKB: 11_000,
    }),
  },
  contractorFree: {
    light: p({
      chatCalls: 2,
      auxAiCalls: 1,
      photos: 3,
      emails: 2,
      updateCalls: 20,
      workerRequests: 60,
      storedGB: 0.01,
    }),
    typical: p({
      chatCalls: 10,
      auxAiCalls: 3,
      photos: 10,
      emails: 10,
      updateCalls: 80,
      workerRequests: 250,
      storedGB: 0.05,
      threshold: 1,
    }),
    heavy: p({
      chatCalls: 91,
      auxAiCalls: 30,
      photos: 40,
      emails: 40,
      sms: 10,
      updateCalls: 300,
      workerRequests: 1_000,
      storedGB: 0.15,
      threshold: 4,
      phoneVerifies: 1 / 24,
    }),
  },
  contractorPro: {
    light: p({
      agentCalls: 5,
      chatCalls: 10,
      auxAiCalls: 2,
      photos: 10,
      emails: 5,
      updateCalls: 60,
      workerRequests: 200,
      storedGB: 0.05,
      threshold: 1,
    }),
    typical: p({
      agentCalls: 40,
      chatCalls: 80,
      auxAiCalls: 15,
      photos: 40,
      docs: 4,
      emails: 20,
      sms: 10,
      updateCalls: 300,
      workerRequests: 1_000,
      storedGB: 0.3,
      threshold: 4,
      onChainKB: 200,
      phoneVerifies: 1 / 24,
    }),
    heavy: p({
      agentCalls: 200,
      chatCalls: 400,
      auxAiCalls: 80,
      photos: 150,
      docs: 15,
      emails: 60,
      sms: 40,
      updateCalls: 1_000,
      workerRequests: 4_000,
      storedGB: 1.5,
      threshold: 12,
      onChainKB: 600,
      phoneVerifies: 1 / 24,
    }),
  },
  // Realtors have no tier: they resolve to Free limits and pay per Bid to List award.
  realtor: {
    light: p({ chatCalls: 3, auxAiCalls: 1, emails: 3, updateCalls: 20, workerRequests: 80 }),
    typical: p({
      agentCalls: 8,
      chatCalls: 20,
      auxAiCalls: 4,
      photos: 5,
      emails: 12,
      updateCalls: 80,
      workerRequests: 300,
      storedGB: 0.03,
      threshold: 2,
    }),
    heavy: p({
      agentCalls: 43.5,
      chatCalls: 91,
      auxAiCalls: 40,
      photos: 20,
      emails: 40,
      sms: 10,
      updateCalls: 300,
      workerRequests: 1_000,
      storedGB: 0.1,
      threshold: 6,
      phoneVerifies: 1 / 24,
    }),
  },
  // A Free homeowner with an active FSBO listing: the Free profile plus listing
  // photos served publicly (cached by Cloudflare; 1 in 10 views reaches R2),
  // showing-request and offer emails, and a signed report link for buyers.
  fsbo: {
    light: p({
      chatCalls: 4,
      auxAiCalls: 1,
      photos: 15,
      emails: 8,
      updateCalls: 60,
      workerRequests: 1_500,
      storedGB: 0.05,
      threshold: 2,
      addressLookups: 1 / 24,
      identityChecks: 1 / 24,
      attom: 1 / 24,
    }),
    typical: p({
      agentCalls: 8,
      chatCalls: 20,
      auxAiCalls: 6,
      photos: 25,
      docs: 4,
      emails: 20,
      updateCalls: 150,
      workerRequests: 6_000,
      storedGB: 0.12,
      threshold: 5,
      onChainKB: 150,
      addressLookups: 1 / 24,
      identityChecks: 1 / 24,
      attom: 1 / 24,
      rentcast: 1 / 24,
    }),
    heavy: p({
      agentCalls: 43.5,
      chatCalls: 91,
      auxAiCalls: 30,
      photos: 40,
      docs: 10,
      emails: 60,
      sms: 20,
      updateCalls: 400,
      workerRequests: 25_000,
      storedGB: 0.2,
      threshold: 12,
      onChainKB: 500,
      addressLookups: 1 / 12,
      identityChecks: 1 / 12,
      attom: 1 / 12,
      rentcast: 1 / 12,
      phoneVerifies: 1 / 24,
    }),
  },
};

export const USER_TYPES = ["free", "pro", "contractorFree", "contractorPro", "realtor", "fsbo"];

export const LABELS = {
  free: "Free homeowner",
  pro: "Pro homeowner ($59/yr)",
  contractorFree: "Contractor Free",
  contractorPro: "Contractor Pro ($40/mo)",
  realtor: "Realtor (Bid to List)",
  fsbo: "FSBO seller (Free + listing)",
};

// Revenue. ContractorFree pays 3% of each winning bid, $20 minimum (fee canister);
// realtors pay $399 per Bid to List award (listing.platformFeeCents). Win rates
// and bid sizes are estimates.
export const REVENUE = {
  free: { light: {}, typical: {}, heavy: {} },
  pro: { all: { subscriptionYearly: 59 } },
  contractorFree: {
    light: { referralWins: 0 },
    typical: { referralWins: 0.1, avgBid: 2_500 },
    heavy: { referralWins: 0.5, avgBid: 2_500 },
  },
  contractorPro: { all: { subscriptionMonthly: 40 } },
  realtor: {
    light: { awards: 0 },
    typical: { awards: 0.05 },
    heavy: { awards: 0.25 },
  },
  fsbo: { light: {}, typical: {}, heavy: {} },
};

// Fixed monthly platform costs (production + testnet unless noted).
export const FIXED = {
  workersPlan: 5, // one Cloudflare account covers both Workers
  flyMachines: 4, // notifications + IoT gateway, prod + testnet
  flyVolumeGB: 4,
  icpBaselineTCycles: 4, // 2 × 21 canisters: code + empty heap storage, monitoring's 5-min timer
  appleDeveloper: 99 / 12,
  expoEas: 19, // EAS Starter (builds + submissions)
  sentry: 26, // Team plan (mobile + web errors)
  domainsAndDns: 5,
};

// Who the users are at scale, and how hard they use the app.
export const MIX = {
  types: { free: 0.8, pro: 0.08, contractorFree: 0.05, contractorPro: 0.02, realtor: 0.02, fsbo: 0.03 },
  usage: { light: 0.55, typical: 0.35, heavy: 0.1 },
};

export const SCALE_POINTS = [1_000, 10_000, 100_000, 1_000_000];
