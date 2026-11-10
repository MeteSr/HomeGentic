#!/usr/bin/env node
// Per-user cost model for HomeGentic. Generates the tables in
// docs/UNIT_ECONOMICS.md between the cost-model markers.
//
//   node scripts/cost-model/costModel.mjs           print the tables
//   node scripts/cost-model/costModel.mjs --write   rewrite the doc's generated block
//   node scripts/cost-model/costModel.mjs --check   exit 1 if the doc is stale
//
// Inputs live in assumptions.mjs. Tests: node --test scripts/cost-model/
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PRICES,
  PROFILES,
  REVENUE,
  FIXED,
  MIX,
  USER_TYPES,
  LABELS,
  SCALE_POINTS,
  CHECKED,
  CONNECTOR,
} from "./assumptions.mjs";

const USAGES = ["light", "typical", "heavy"];
const DAYS_PER_MONTH = 30.4;

// ── unit prices ──────────────────────────────────────────────────────────────

/** Dollar cost of one Claude request. */
export function aiCallCost({ inputTokens, outputTokens, cachedInputTokens = 0 }, ai = PRICES.ai) {
  const fresh = inputTokens - cachedInputTokens;
  return (
    (ai.tokenizerFactor ?? 1) *
    ((fresh * ai.inputPerM + cachedInputTokens * ai.inputPerM * ai.cacheReadMultiplier + outputTokens * ai.outputPerM) /
      1e6)
  );
}

// The free budget's weighting (aiGuard.weightedTokens): input + 0.1 × cache reads + 5 × output.
const weighted = (t, ai) =>
  (ai.tokenizerFactor ?? 1) *
  (t.inputTokens - (t.cachedInputTokens ?? 0) + 0.1 * (t.cachedInputTokens ?? 0) + ai.outputWeight * t.outputTokens);

/** Dollar cost of one of each billable event. */
export function unitCosts(prices = PRICES) {
  const { ai, tokens, icp, twilio, r2, workers } = prices;
  const usdPerCycle = icp.usdPerTCycles / 1e12;
  return {
    chat: aiCallCost(tokens.chat, ai),
    agent: aiCallCost(tokens.agent, ai),
    aux: aiCallCost(tokens.aux, ai),
    chatWeighted: weighted(tokens.chat, ai),
    agentWeighted: weighted(tokens.agent, ai),
    auxWeighted: weighted(tokens.aux, ai),
    updateCall: icp.updateCallCycles * usdPerCycle,
    thresholdCall: icp.thresholdCallCycles * usdPerCycle,
    icpGiBMonth: (icp.storageTCyclesPerGiBYear * icp.usdPerTCycles) / 12,
    r2GBMonth: r2.storagePerGBMonth,
    r2Write: r2.classAPerM / 1e6,
    r2Read: r2.classBPerM / 1e6,
    workerRequest: workers.requestsPerM / 1e6,
    email: prices.resend.overPer1k / 1000,
    sms: twilio.sms,
    phoneVerify: twilio.verify + twilio.sms,
  };
}

/** Resend's monthly bill for `emails` sent. */
export function emailBill(emails, resend = PRICES.resend) {
  for (const s of resend.steps) if (emails <= s.upTo) return s.monthly;
  const top = resend.steps[resend.steps.length - 1];
  return top.monthly + ((emails - top.upTo) / 1000) * resend.overPer1k;
}

/** Stripe's cut of one subscription charge of `amount` dollars. */
export function stripeSubscriptionFee(amount, stripe = PRICES.stripe) {
  return amount * (stripe.cardPct + stripe.billingPct) + stripe.cardFixed;
}

const cardFee = (amount, stripe) => amount * stripe.cardPct + stripe.cardFixed;

// ── one user ─────────────────────────────────────────────────────────────────

function revenueFor(type, usage, prices) {
  const r = REVENUE[type].all ?? REVENUE[type][usage] ?? {};
  const s = prices.stripe;
  let revenue = 0,
    fees = 0;
  if (r.subscriptionYearly) {
    revenue += r.subscriptionYearly / 12;
    fees += stripeSubscriptionFee(r.subscriptionYearly, s) / 12;
  }
  if (r.subscriptionMonthly) {
    revenue += r.subscriptionMonthly;
    fees += stripeSubscriptionFee(r.subscriptionMonthly, s);
  }
  if (r.referralWins) {
    const fee = Math.max(20, 0.03 * r.avgBid);
    revenue += r.referralWins * fee;
    fees += r.referralWins * cardFee(fee, s);
  }
  if (r.awards) {
    revenue += r.awards * 399;
    fees += r.awards * cardFee(399, s);
  }
  return { revenue, fees };
}

/** Monthly cost and revenue of one user of `type` at `usage` (light/typical/heavy/ceiling). */
export function userMonthly(type, usage, prices = PRICES, profiles = PROFILES) {
  const p = profiles[type][usage];
  const u = unitCosts(prices);
  const tp = prices.thirdParty;
  const { revenue, fees } = revenueFor(type, usage, prices);
  const onChainGiB = (p.onChainKB * prices.icp.heapOverhead) / 1024 / 1024;
  const cost = {
    ai: p.agentCalls * u.agent + p.chatCalls * u.chat + p.auxAiCalls * u.aux,
    storage: p.storedGB * u.r2GBMonth + onChainGiB * u.icpGiBMonth,
    icpCompute: p.updateCalls * u.updateCall + p.threshold * u.thresholdCall,
    messaging: p.emails * u.email + p.sms * u.sms + p.phoneVerifies * u.phoneVerify,
    payments: fees,
    lookups:
      p.identityChecks * prices.stripe.identityCheck +
      p.addressLookups * tp.places +
      p.attom * tp.attom +
      p.permits * tp.permits +
      p.rentcast * tp.rentcast,
    edge: p.workerRequests * u.workerRequest + (p.photos + p.docs) * u.r2Write + p.workerRequests * 0.1 * u.r2Read,
  };
  cost.total = Object.values(cost).reduce((a, b) => a + b, 0);
  return { cost, revenue, margin: revenue - cost.total, emails: p.emails };
}

// ── platform ─────────────────────────────────────────────────────────────────

/** Fixed monthly cost at `users` accounts (steps up as the relays and error volume grow). */
export function fixedMonthly(users) {
  const f = FIXED,
    fly = PRICES.fly;
  let total =
    f.workersPlan +
    f.flyMachines * fly.machine +
    f.flyVolumeGB * fly.volumeGB +
    f.icpBaselineTCycles * PRICES.icp.usdPerTCycles +
    f.appleDeveloper +
    f.expoEas +
    f.sentry +
    f.domainsAndDns +
    PRICES.twilio.fixedMonthly;
  if (users > 50_000) total += 60; // larger production relay machines
  if (users > 100_000) total += 54; // Sentry Business volume
  if (users > 500_000) total += 200; // second relay region / DB for relay state (see Scale limits)
  return total;
}

// ── ICP MCP connector ────────────────────────────────────────────────────────

/** Profile `p` with its chat and agent questions asked through ChatGPT or Claude instead. */
export function connectorProfile(p, connector = CONNECTOR) {
  const questions = (p.chatCalls + p.agentCalls) * connector.questionMultiplier;
  return {
    ...p,
    chatCalls: 0,
    agentCalls: 0,
    updateCalls: p.updateCalls + questions * connector.updateCallsPerQuestion,
  };
}

/** PROFILES with every user asking through a connector. */
export const CONNECTOR_PROFILES = Object.fromEntries(
  Object.entries(PROFILES).map(([t, us]) => [
    t,
    Object.fromEntries(Object.entries(us).map(([u, p]) => [u, connectorProfile(p)])),
  ]),
);

/** What one connector question costs HomeGentic (its update calls; queries are free). */
export function connectorQuestionCost(prices = PRICES, connector = CONNECTOR) {
  return connector.updateCallsPerQuestion * unitCosts(prices).updateCall;
}

/** One principal driving every rate-limited exposed canister at its per-minute cap all day. */
export function connectorAbuseCeilingPerDay(prices = PRICES, connector = CONNECTOR) {
  return connector.rateLimitedCanisters * connector.updatesPerMinPerCanister * 1440 * unitCosts(prices).updateCall;
}

/** Totals for `users` accounts in the MIX, `connectorShare` of them asking through a connector. */
export function scaleRow(users, prices = PRICES, { connectorShare = 0 } = {}) {
  let variable = 0,
    revenue = 0,
    emails = 0,
    ai = 0,
    subscriptions = 0;
  const groups = [
    [1 - connectorShare, PROFILES],
    [connectorShare, CONNECTOR_PROFILES],
  ];
  for (const type of USER_TYPES) {
    for (const usage of USAGES) {
      for (const [share, profiles] of groups) {
        if (share === 0) continue;
        const n = users * MIX.types[type] * MIX.usage[usage] * share;
        const m = userMonthly(type, usage, prices, profiles);
        variable += n * (m.cost.total - m.emails * unitCosts(prices).email);
        ai += n * m.cost.ai;
        revenue += n * m.revenue;
        if (type === "pro" || type === "contractorPro") subscriptions += n * m.revenue;
        emails += n * m.emails;
      }
    }
  }
  const email = emailBill(emails, prices.resend);
  const fixed = fixedMonthly(users);
  const total = variable + email + fixed;
  return {
    users,
    variable,
    email,
    fixed,
    total,
    revenue,
    ai,
    subscriptions,
    net: revenue - total,
    costPerUser: total / users,
    revenuePerUser: revenue / users,
    margin: revenue > 0 ? (revenue - total) / revenue : -Infinity,
  };
}

/** Free users the shared FREE_AI_DAILY_TOKEN_BUDGET can serve before it runs out each day. */
export function freeUsersBeforeBudgetBinds(usage, prices = PRICES) {
  const p = PROFILES.free[usage],
    u = unitCosts(prices);
  const daily =
    (p.agentCalls * u.agentWeighted + p.chatCalls * u.chatWeighted + p.auxAiCalls * u.auxWeighted) / DAYS_PER_MONTH;
  return prices.ai.freeDailyWeightedBudget / daily;
}

/** One user of `type` averaged over the usage mix (light/typical/heavy). */
export function blendedMonthly(type, prices = PRICES) {
  let cost = 0,
    revenue = 0;
  for (const usage of USAGES) {
    const m = userMonthly(type, usage, prices);
    cost += MIX.usage[usage] * m.cost.total;
    revenue += MIX.usage[usage] * m.revenue;
  }
  return { cost, revenue, margin: revenue - cost };
}

/** Pro users (usage mix) needed to cover fixed costs and `freePerPro` Free users (usage mix) each. */
export function breakEvenProUsers({ freePerPro, users = 0 } = {}) {
  const pro = blendedMonthly("pro"),
    free = blendedMonthly("free");
  const contribution = pro.revenue - pro.cost - freePerPro * free.cost;
  return contribution > 0 ? fixedMonthly(users) / contribution : Infinity;
}

// ── rendering ────────────────────────────────────────────────────────────────

const usd = (v) => {
  if (!Number.isFinite(v)) return "never";
  const a = Math.abs(v),
    s = v < 0 ? "−" : "";
  if (a >= 1000) return `${s}$${Math.round(a).toLocaleString("en-US")}`;
  if (a >= 10) return `${s}$${a.toFixed(0)}`;
  if (a >= 0.1) return `${s}$${a.toFixed(2)}`;
  if (a >= 0.001) return `${s}$${a.toFixed(3)}`;
  return a === 0 ? "$0" : `${s}<$0.001`;
};
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "n/a");
const int = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "never");

function sensitivity() {
  const base = PRICES;
  const noCache = { ...base.tokens, agent: { ...base.tokens.agent, cachedInputTokens: 0 } };
  const scenarios = [
    ["Baseline (Sonnet 5.5, agent tool list cached)", base],
    ["Sonnet 5.5 without prompt caching", { ...base, tokens: noCache }],
    [
      "Before PR #764 (Sonnet 4.6 at $3/$15, no caching)",
      { ...base, ai: { ...base.ai, inputPerM: 3, outputPerM: 15, tokenizerFactor: 1 }, tokens: noCache },
    ],
    ["Tokenizer counts 1.35× (top of the range)", { ...base, ai: { ...base.ai, tokenizerFactor: 1.35 } }],
    ["AI token use 2× the estimate", { ...base, ai: { ...base.ai, tokenizerFactor: base.ai.tokenizerFactor * 2 } }],
    ["Cycles 25% dearer (XDR rate)", { ...base, icp: { ...base.icp, usdPerTCycles: base.icp.usdPerTCycles * 1.25 } }],
    [
      "Email via Amazon SES ($0.10 / 1,000) instead of Resend",
      { ...base, resend: { steps: [{ upTo: 0, monthly: 0 }], overPer1k: 0.1 } },
    ],
  ];
  const rows = scenarios.map(([name, prices]) => {
    const pro = userMonthly("pro", "typical", prices);
    const free = userMonthly("free", "typical", prices);
    const at = scaleRow(100_000, prices);
    return `| ${name} | ${usd(free.cost.total)} | ${usd(pro.cost.total)} | ${pct(pro.margin / pro.revenue)} | ${usd(at.total)} | ${usd(at.net)} |`;
  });
  return [
    "| Scenario | Free typical cost/mo | Pro typical cost/mo | Pro typical margin | Total cost/mo at 100k users | Net/mo at 100k users |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function connectorTables() {
  const u = unitCosts();
  const out = [];
  out.push("| Event | Cost to HomeGentic |\n|---|---|");
  out.push(
    `| One question through ChatGPT or Claude (${CONNECTOR.updateCallsPerQuestion} update calls; queries free; the model is on the user's subscription) | $${connectorQuestionCost().toFixed(5)} |`,
  );
  out.push(`| The same question in the app: chat answer / one agent call | ${usd(u.chat)} / ${usd(u.agent)} |`);
  out.push(
    `| One principal maxing every rate-limited exposed canister (${CONNECTOR.rateLimitedCanisters} × ${CONNECTOR.updatesPerMinPerCanister}/min) all day | ${usd(connectorAbuseCeilingPerDay())}/day |`,
  );

  out.push("\nTypical user, all questions in the app vs all through a connector:\n");
  out.push("| User type | In the app | Through a connector | Saving |\n|---|---|---|---|");
  for (const type of USER_TYPES) {
    const app = userMonthly(type, "typical").cost.total;
    const mcp = userMonthly(type, "typical", PRICES, CONNECTOR_PROFILES).cost.total;
    out.push(`| ${LABELS[type]} | ${usd(app)} | ${usd(mcp)} | ${pct((app - mcp) / app)} |`);
  }

  out.push(
    `\nShare of users asking through a connector (they ask ${CONNECTOR.questionMultiplier}× as many questions there; document and bill AI stays in the app). Total cost a month:\n`,
  );
  out.push(
    `| Connector users | ${SCALE_POINTS.map(int).join(" | ")} | Cost per account at 100k | AI share at 100k | Saving at 100k | Saving at 1M |`,
  );
  out.push(`|---|${SCALE_POINTS.map(() => "---").join("|")}|---|---|---|---|`);
  const base = Object.fromEntries(SCALE_POINTS.map((n) => [n, scaleRow(n).total]));
  for (const share of CONNECTOR.shares) {
    const rows = SCALE_POINTS.map((n) => scaleRow(n, PRICES, { connectorShare: share }));
    const at = (n) => rows[SCALE_POINTS.indexOf(n)];
    const saving = (n) =>
      share === 0 ? "—" : `${usd(base[n] - at(n).total)} (${pct((base[n] - at(n).total) / base[n])})`;
    out.push(
      `| ${pct(share)} | ${rows.map((r) => usd(r.total)).join(" | ")} | ${usd(at(100_000).costPerUser)} | ${pct(at(100_000).ai / at(100_000).total)} | ${saving(100_000)} | ${saving(1_000_000)} |`,
    );
  }
  return out.join("\n");
}

/** The markdown that goes between the cost-model markers. */
export function renderGenerated() {
  const u = unitCosts();
  const out = [];
  out.push(
    `_Generated by \`scripts/cost-model/costModel.mjs\` from \`assumptions.mjs\` (prices checked ${CHECKED}). Edit the assumptions, then run \`node scripts/cost-model/costModel.mjs --write\`._`,
  );

  out.push("\n### Unit costs\n");
  out.push("| Event | Cost |\n|---|---|");
  out.push(`| Chat answer (\`/api/chat\`, ${PRICES.ai.model}) | ${usd(u.chat)} |`);
  out.push(`| Agent call (one \`/api/agent\` request; up to 5 per question) | ${usd(u.agent)} |`);
  out.push(`| Document / bill / other AI call (avg) | ${usd(u.aux)} |`);
  out.push(
    `| Threshold-key call (vetKD score view, signed report link, sealed-bid reveal) | ${usd(u.thresholdCall)} |`,
  );
  out.push(`| Canister update call (avg, incl. one inter-canister call) | ${usd(u.updateCall)} |`);
  out.push(`| 1 GB stored in R2 / on-chain (per month) | ${usd(u.r2GBMonth)} / ${usd(u.icpGiBMonth)} |`);
  out.push(`| Email (Resend, over the plan) | ${usd(u.email)} |`);
  out.push(`| SMS alert / phone confirmation | ${usd(u.sms)} / ${usd(u.phoneVerify)} |`);
  out.push(`| Stripe Identity check (property claim) | ${usd(PRICES.stripe.identityCheck)} |`);
  out.push(
    `| Stripe on a Pro year ($59) / a ContractorPro month ($40) | ${usd(stripeSubscriptionFee(59))} / ${usd(stripeSubscriptionFee(40))} |`,
  );

  out.push("\n### Monthly cost per user\n");
  out.push(
    "| User type | Usage | AI | Storage | Canister calls | Email + SMS | Stripe fees | Lookups + ID | Edge | **Cost/mo** | Revenue/mo | **Margin/mo** |",
  );
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const type of USER_TYPES) {
    const usages = type === "pro" ? [...USAGES, "ceiling"] : USAGES;
    for (const usage of usages) {
      const m = userMonthly(type, usage),
        c = m.cost;
      const label = usage === "ceiling" ? "every cap maxed" : usage;
      out.push(
        `| ${LABELS[type]} | ${label} | ${usd(c.ai)} | ${usd(c.storage)} | ${usd(c.icpCompute)} | ${usd(c.messaging)} | ${usd(c.payments)} | ${usd(c.lookups)} | ${usd(c.edge)} | **${usd(c.total)}** | ${usd(m.revenue)} | **${usd(m.margin)}** |`,
      );
    }
  }

  out.push("\n### Cost at scale\n");
  out.push(
    `Mix: ${USER_TYPES.map((t) => `${pct(MIX.types[t])} ${LABELS[t]}`).join(", ")}. Usage: ${USAGES.map((x) => `${pct(MIX.usage[x])} ${x}`).join(", ")}.\n`,
  );
  out.push(
    "| Users | Variable | Email (Resend) | Fixed | **Total cost/mo** | Of which AI | Cost per user | Revenue/mo | Of which subscriptions | Revenue per user | **Net/mo** | Margin |",
  );
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const n of SCALE_POINTS) {
    const r = scaleRow(n);
    out.push(
      `| ${int(n)} | ${usd(r.variable)} | ${usd(r.email)} | ${usd(r.fixed)} | **${usd(r.total)}** | ${pct(r.ai / r.total)} | ${usd(r.costPerUser)} | ${usd(r.revenue)} | ${pct(r.subscriptions / r.revenue)} | ${usd(r.revenuePerUser)} | **${usd(r.net)}** | ${pct(r.margin)} |`,
    );
  }

  const pro = userMonthly("pro", "typical"),
    free = userMonthly("free", "typical");
  const bPro = blendedMonthly("pro"),
    bFree = blendedMonthly("free");
  const freePerPro = MIX.types.free / MIX.types.pro;
  const freeAi100k = USAGES.reduce(
    (s, x) => s + 100_000 * MIX.types.free * MIX.usage[x] * userMonthly("free", x).cost.ai,
    0,
  );
  out.push("\n### Key metrics\n");
  out.push("| Metric | Value |\n|---|---|");
  out.push(`| Fixed platform cost (launch) | ${usd(fixedMonthly(0))}/mo |`);
  out.push(
    `| Typical Pro contribution (revenue − cost) | ${usd(pro.margin)}/mo (${pct(pro.margin / pro.revenue)} of revenue) |`,
  );
  out.push(
    `| Average Pro / average Free user (usage mix) | ${usd(bPro.cost)} cost, ${usd(bPro.margin)} margin / ${usd(bFree.cost)} cost |`,
  );
  out.push(
    `| Average Free users one average Pro user pays for | ${(bPro.margin / bFree.cost).toFixed(1)} (typical vs typical: ${(pro.margin / free.cost.total).toFixed(1)}) |`,
  );
  out.push(`| Pro users to cover fixed costs alone | ${int(breakEvenProUsers({ freePerPro: 0 }))} |`);
  out.push(
    `| Pro users to break even carrying ${freePerPro.toFixed(0)} Free users each (the mix), no contractor or realtor revenue | ${int(breakEvenProUsers({ freePerPro }))} |`,
  );
  out.push(`| Free-tier AI spend at 100k accounts (budget would need raising to match) | ${usd(freeAi100k)}/mo |`);
  out.push(
    `| Typical Free users the shared free AI budget serves before it runs out daily | ${int(freeUsersBeforeBudgetBinds("typical"))} (heavy: ${int(freeUsersBeforeBudgetBinds("heavy"))}) |`,
  );
  out.push(
    `| Free AI spend ceiling (FREE_AI_DAILY_TOKEN_BUDGET) | ${usd(((PRICES.ai.freeDailyWeightedBudget * PRICES.ai.inputPerM) / 1e6) * DAYS_PER_MONTH)}/mo |`,
  );
  out.push(
    `| Blended cost per account at 100k / 1M | ${usd(scaleRow(100_000).costPerUser)} / ${usd(scaleRow(1_000_000).costPerUser)} |`,
  );

  out.push("\n### ChatGPT and Claude connector (ICP MCP)\n");
  out.push(connectorTables());

  out.push("\n### Sensitivity\n");
  out.push(sensitivity());
  return out.join("\n");
}

const BEGIN = "<!-- cost-model:begin -->";
const END = "<!-- cost-model:end -->";

/** `doc` with its generated block replaced by `generated`. */
export function replaceGenerated(doc, generated) {
  const a = doc.indexOf(BEGIN),
    b = doc.indexOf(END);
  if (a < 0 || b < a) throw new Error("cost-model markers not found");
  return `${doc.slice(0, a + BEGIN.length)}\n${generated}\n${doc.slice(b)}`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const docPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/UNIT_ECONOMICS.md");
  const generated = renderGenerated();
  const mode = process.argv[2];
  if (mode === "--write" || mode === "--check") {
    const doc = readFileSync(docPath, "utf8");
    const next = replaceGenerated(doc, generated);
    if (mode === "--write") writeFileSync(docPath, next);
    else if (next !== doc) {
      console.error("docs/UNIT_ECONOMICS.md is stale: run node scripts/cost-model/costModel.mjs --write");
      process.exit(1);
    }
  } else {
    console.log(generated);
  }
}
