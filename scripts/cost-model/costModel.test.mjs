// Tests for the per-user cost model behind docs/UNIT_ECONOMICS.md.
// Run: node --test scripts/cost-model/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  aiCallCost,
  unitCosts,
  emailBill,
  stripeSubscriptionFee,
  userMonthly,
  fixedMonthly,
  scaleRow,
  freeUsersBeforeBudgetBinds,
  breakEvenProUsers,
  blendedMonthly,
  renderGenerated,
  replaceGenerated,
  connectorProfile,
  connectorQuestionCost,
  connectorAbuseCeilingPerDay,
} from "./costModel.mjs";
import { PRICES, PROFILES, MIX, USER_TYPES, CONNECTOR } from "./assumptions.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("a chat call costs input + output tokens at the model's list price", () => {
  const ai = { inputPerM: 3, outputPerM: 15, cacheReadMultiplier: 0.1, tokenizerFactor: 1 };
  // 2,100 in × $3/M + 150 out × $15/M
  near(aiCallCost({ inputTokens: 2100, outputTokens: 150 }, ai), 0.0063 + 0.00225);
});

test("cached input tokens are billed at the cache-read rate", () => {
  const ai = { inputPerM: 3, outputPerM: 15, cacheReadMultiplier: 0.1, tokenizerFactor: 1 };
  near(aiCallCost({ inputTokens: 10_000, cachedInputTokens: 8_000, outputTokens: 0 }, ai), 0.006 + 0.0024);
});

test("the tokenizer factor scales every token count", () => {
  const ai = { inputPerM: 2, outputPerM: 10, cacheReadMultiplier: 0.05, tokenizerFactor: 1.2 };
  near(
    aiCallCost({ inputTokens: 1_000, cachedInputTokens: 500, outputTokens: 100 }, ai),
    (1.2 * (500 * 2 + 500 * 0.1 + 100 * 10)) / 1e6,
  );
});

test("the baseline is Sonnet 5.5 with the agent's tool list cached", () => {
  assert.equal(PRICES.ai.model, "claude-sonnet-5-5");
  // HOMEGENTIC_TOOLS with query_home_records and the multi-step task tools (~32,900 chars of JSON)
  assert.equal(PRICES.tokens.agent.cachedInputTokens, 8_300);
});

test("Pro's yearly Stripe fee is card fee plus Billing fee on $59", () => {
  // 2.9% + $0.30 card, 0.7% Stripe Billing
  near(stripeSubscriptionFee(59, PRICES.stripe), 59 * 0.029 + 0.3 + 59 * 0.007);
});

test("Resend bills by plan step, then per 1,000 over the top plan", () => {
  assert.equal(emailBill(2_000, PRICES.resend), 0);
  assert.equal(emailBill(40_000, PRICES.resend), 20);
  assert.equal(emailBill(90_000, PRICES.resend), 90);
  near(emailBill(1_100_000, PRICES.resend), 90 + 1_000 * 0.9);
});

test("every user type costs more as usage rises from light to heavy", () => {
  for (const type of USER_TYPES) {
    const [l, t, h] = ["light", "typical", "heavy"].map((u) => userMonthly(type, u).cost.total);
    assert.ok(l < t && t < h, `${type}: ${l} ${t} ${h}`);
  }
});

test("a user's cost is the sum of its parts", () => {
  const { cost } = userMonthly("pro", "typical");
  const parts = Object.entries(cost)
    .filter(([k]) => k !== "total")
    .reduce((s, [, v]) => s + v, 0);
  near(cost.total, parts);
});

test("a blended user weights light/typical/heavy by the usage mix", () => {
  const b = blendedMonthly("free");
  const want = ["light", "typical", "heavy"].reduce((s, u) => s + MIX.usage[u] * userMonthly("free", u).cost.total, 0);
  near(b.cost, want);
});

test("Free has no revenue and Pro's monthly revenue is $59 / 12", () => {
  assert.equal(userMonthly("free", "typical").revenue, 0);
  near(userMonthly("pro", "light").revenue, 59 / 12);
});

test("fixed costs grow with scale but per-user cost falls", () => {
  const small = scaleRow(1_000),
    big = scaleRow(100_000);
  assert.ok(fixedMonthly(100_000) > fixedMonthly(1_000));
  assert.ok(big.costPerUser < small.costPerUser);
});

test("the scale mix covers every user type and sums to 100%", () => {
  near(
    Object.values(MIX.types).reduce((a, b) => a + b, 0),
    1,
  );
  near(
    Object.values(MIX.usage).reduce((a, b) => a + b, 0),
    1,
  );
  for (const t of USER_TYPES) assert.ok(t in MIX.types, t);
});

test("the shared free AI budget serves budget / per-user daily demand", () => {
  const u = unitCosts();
  const p = PROFILES.free.typical;
  const daily = (p.agentCalls * u.agentWeighted + p.chatCalls * u.chatWeighted + p.auxAiCalls * u.auxWeighted) / 30.4;
  near(freeUsersBeforeBudgetBinds("typical"), PRICES.ai.freeDailyWeightedBudget / daily, 1e-6);
});

test("break-even Pro count covers fixed costs plus the free users they carry", () => {
  const n = breakEvenProUsers({ freePerPro: 0 });
  const pro = blendedMonthly("pro");
  near(n, fixedMonthly(0) / (pro.revenue - pro.cost), 1e-6);
  assert.ok(breakEvenProUsers({ freePerPro: 10 }) > n);
});

test("docs/UNIT_ECONOMICS.md holds the current generated tables", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const doc = readFileSync(path.join(here, "../../docs/UNIT_ECONOMICS.md"), "utf8");
  assert.equal(
    replaceGenerated(doc, renderGenerated()),
    doc,
    "tables are stale: run `node scripts/cost-model/costModel.mjs --write`",
  );
});

// ── ICP MCP connector (ChatGPT / Claude) ─────────────────────────────────────

test("a connector user's chat and agent questions move off our AI bill; aux AI stays", () => {
  const p = PROFILES.pro.typical;
  const c = connectorProfile(p);
  assert.equal(c.chatCalls, 0);
  assert.equal(c.agentCalls, 0);
  assert.equal(c.auxAiCalls, p.auxAiCalls);
  const questions = (p.chatCalls + p.agentCalls) * CONNECTOR.questionMultiplier;
  near(c.updateCalls, p.updateCalls + questions * CONNECTOR.updateCallsPerQuestion);
});

test("a connector question costs only its update calls (queries are free)", () => {
  near(connectorQuestionCost(), CONNECTOR.updateCallsPerQuestion * unitCosts().updateCall);
  assert.ok(connectorQuestionCost() < unitCosts().chat / 20, "far cheaper than an in-app chat");
});

test("a connector user costs less than the same user in the app, for every type with chat or agent use", () => {
  const connectorProfiles = Object.fromEntries(
    USER_TYPES.map((t) => [
      t,
      Object.fromEntries(Object.entries(PROFILES[t]).map(([u, p]) => [u, connectorProfile(p)])),
    ]),
  );
  for (const type of USER_TYPES) {
    for (const usage of ["light", "typical", "heavy"]) {
      const app = userMonthly(type, usage).cost;
      const mcp = userMonthly(type, usage, PRICES, connectorProfiles).cost;
      near(mcp.ai, PROFILES[type][usage].auxAiCalls * unitCosts().aux);
      assert.ok(mcp.total < app.total, `${type} ${usage}`);
    }
  }
});

test("connector share 0 is the baseline; more connector users means a smaller AI bill", () => {
  const base = scaleRow(100_000);
  near(scaleRow(100_000, PRICES, { connectorShare: 0 }).total, base.total);
  const rows = CONNECTOR.shares.map((s) => scaleRow(100_000, PRICES, { connectorShare: s }));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].total < rows[i - 1].total);
    assert.ok(rows[i].ai < rows[i - 1].ai);
  }
  // Half the users on a connector removes half of the chat + agent AI.
  const chatAgentAi = base.ai - scaleRow(100_000, PRICES, { connectorShare: 1 }).ai;
  near(rows[rows.length - 1].ai, base.ai - 0.5 * chatAgentAi, 1e-3);
});

test("the connector abuse ceiling is every rate-limited exposed canister maxed all day", () => {
  const c = CONNECTOR;
  near(
    connectorAbuseCeilingPerDay(),
    c.rateLimitedCanisters * c.updatesPerMinPerCanister * 1440 * unitCosts().updateCall,
  );
});

test("the generated tables include the connector scenarios at every scale point", () => {
  const md = renderGenerated();
  assert.match(md, /### ChatGPT and Claude connector \(ICP MCP\)/);
  for (const s of CONNECTOR.shares.filter((x) => x > 0))
    assert.match(md, new RegExp(`\\| ${Math.round(s * 100)}% \\|`));
});
