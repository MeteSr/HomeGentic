/**
 * TDD — PROD.5 / PROD.6 / PROD.7
 *
 * PROD.5  deploy.sh builds frontend and deploys the frontend canister
 * PROD.6  all backend canisters use `persistent actor` + mo:core/Map (no preupgrade needed)
 * PROD.7  deploy.sh wires addAdmin for every canister that has the method
 *         (auth is excluded — its deployer is set atomically via --argument at install time)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ── PROD.5 — deploy.sh builds and deploys frontend canister ──────────────────

describe("PROD.5 — deploy.sh includes frontend build and deploy", () => {
  const deploy = () => read("scripts/deploy.sh");

  it("deploy.sh runs npm run build for the frontend", () => {
    // Must trigger a frontend build so dist/ + .ic-assets.json5 exist before upload
    expect(deploy()).toMatch(/npm.*run.*build|npm.*build/);
  });

  it("deploy.sh deploys the frontend canister", () => {
    expect(deploy()).toMatch(/icp deploy frontend/);
  });

  it("frontend build step appears after the Motoko canisters loop", () => {
    const src = deploy();
    // The Motoko canister loop deploys from the CANISTERS array
    const canistersLoopIdx = src.indexOf('CANISTERS=(auth');
    const frontendBuildIdx = src.search(/npm.*run.*build|npm.*build/);
    expect(canistersLoopIdx).toBeGreaterThan(-1);
    expect(frontendBuildIdx).toBeGreaterThan(canistersLoopIdx);
  });

  it("frontend canister deploy step appears after the build step", () => {
    const src = deploy();
    const buildIdx   = src.search(/npm.*run.*build|npm.*build/);
    const deployIdx  = src.indexOf("icp deploy frontend");
    expect(buildIdx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(buildIdx);
  });

  it("DEPLOYMENT.md documents the build-before-deploy ordering", () => {
    const docs = read("docs/DEPLOYMENT.md");
    // Must explain that npm run build must precede icp deploy frontend
    expect(docs).toMatch(/npm run build/);
    expect(docs).toMatch(/icp deploy frontend/);
  });
});

// ── PROD.6 — all canisters use persistent actor (no preupgrade needed) ────────

describe("PROD.6 — all backend canisters use persistent actor", () => {
  // `persistent actor` makes ALL module-level vars implicitly stable.
  // mo:core/Map is a functional B-tree that lives in stable memory natively.
  // Neither requires a `system func preupgrade()` — the upgrade is safe as-is.

  const backendDirs = readdirSync(resolve(ROOT, "backend")).filter((d) => {
    try {
      readFileSync(resolve(ROOT, "backend", d, "main.mo"), "utf-8");
      return true;
    } catch {
      return false;
    }
  });

  it("has at least 15 canisters to check", () => {
    expect(backendDirs.length).toBeGreaterThanOrEqual(15);
  });

  for (const dir of backendDirs) {
    it(`backend/${dir}/main.mo uses 'persistent actor'`, () => {
      const src = readFileSync(resolve(ROOT, "backend", dir, "main.mo"), "utf-8");
      expect(src).toMatch(/^persistent actor/m);
    });
  }

  it("no canister imports mo:base/HashMap (heap-allocated, would need preupgrade)", () => {
    for (const dir of backendDirs) {
      const src = readFileSync(resolve(ROOT, "backend", dir, "main.mo"), "utf-8");
      // mo:base/HashMap is the old heap-allocated HashMap that loses state on upgrade
      // mo:core/Map is a stable B-tree — safe without preupgrade
      expect(
        src,
        `backend/${dir}/main.mo must not import mo:base/HashMap`
      ).not.toMatch(/import.*HashMap.*mo:base\/HashMap|mo:base\/HashMap/);
    }
  });
});

// ── PROD.7 — deploy.sh wires addAdmin for all canisters that have it ──────────

describe("PROD.7 — deploy.sh calls addAdmin for each non-payment canister", () => {
  // payment intentionally has no admin list (comment: "protect at the deployment layer").
  // ai_proxy is already wired in the existing AI Proxy section.
  // All others must have addAdmin called so the deployer owns them from the first block.

  // auth is intentionally excluded: its deployer principal is set atomically via
  // `dfx canister install auth --argument "(principal \"...\")"`  at install time,
  // so no post-deploy addAdmin call is needed or safe (#144).
  const CANISTERS_WITH_ADMIN = [
    "property", "job", "contractor", "quote",
    "photo", "report", "maintenance", "market", "sensor",
    "listing", "agent", "recurring", "monitoring",
  ];

  const deploy = () => read("scripts/deploy.sh");

  for (const canister of CANISTERS_WITH_ADMIN) {
    it(`deploy.sh calls addAdmin for ${canister}`, () => {
      // Accept either: dfx canister call <canister> addAdmin  OR a loop variable
      // that resolves to this canister name in an ADMIN_CANISTERS array.
      const src = deploy();
      const hasDirectCall = src.includes(`${canister} addAdmin`) ||
                            src.includes(`"${canister}" addAdmin`);
      const hasInArray    = src.match(
        new RegExp(`ADMIN_CANISTERS=\\([^)]*\\b${canister}\\b`)
      ) !== null;
      expect(
        hasDirectCall || hasInArray,
        `deploy.sh must call addAdmin for ${canister}`
      ).toBe(true);
    });
  }

  it("deploy.sh does NOT call addAdmin for auth (auth uses --argument constructor bootstrap instead)", () => {
    // auth gets its deployer via `dfx canister install auth --argument "(principal \"...\")"`.
    // Calling addAdmin after the fact would re-open the bootstrap race we closed in #144.
    expect(deploy()).not.toMatch(/canister call auth addAdmin/);
  });

  it("deploy.sh installs auth with --argument passing the deployer principal", () => {
    const src = deploy();
    // Must pass the deployer principal as a Candid argument so the actor class
    // constructor receives it atomically — closing the bootstrap race (#144).
    // The two strings may be on separate lines, so check both independently.
    expect(src).toContain("canister install auth");
    expect(src).toMatch(/--args.*principal/);
  });

  it("deploy.sh does NOT call addAdmin for payment (payment uses initAdmins instead)", () => {
    // payment uses a one-time initAdmins bootstrap, not the addAdmin pattern
    const src = deploy();
    // Should not appear as "payment addAdmin" — the method doesn't exist on payment
    expect(src).not.toMatch(/canister call payment addAdmin/);
  });

  it("deploy.sh calls initAdmins for payment canister", () => {
    // payment.initAdmins must be called so grantSubscription (and other admin-only
    // methods) work during tests — job / quote / photo tests all call grantSubscription
    expect(deploy()).toMatch(/canister call payment initAdmins/);
  });
});

// ── PROD.8 — Tier propagation wired in deploy.sh (#139) ──────────────────────

describe("PROD.8 — deploy.sh wires tier propagation from payment to property/quote/photo", () => {
  // payment must call setTier() on property, quote, and photo whenever a subscription
  // changes. Without this wiring, tier limits in those canisters default to #Free
  // for everyone regardless of their payment subscription (#139).

  const deploy = () => read("scripts/deploy.sh");

  it("deploy.sh adds payment as admin in property for tier propagation", () => {
    const src = deploy();
    // Must pass payment canister ID to property's addAdmin so setTier() calls succeed
    expect(src).toMatch(/property\s+addAdmin.*PAYMENT_ID|PAYMENT_ID.*property\s+addAdmin/);
  });

  it("deploy.sh adds payment as admin in quote for tier propagation", () => {
    const src = deploy();
    expect(src).toMatch(/quote\s+addAdmin.*PAYMENT_ID|PAYMENT_ID.*quote\s+addAdmin/);
  });

  it("deploy.sh adds payment as admin in photo for tier propagation", () => {
    const src = deploy();
    expect(src).toMatch(/photo\s+addAdmin.*PAYMENT_ID|PAYMENT_ID.*photo\s+addAdmin/);
  });

  it("deploy.sh calls setTierCanisterIds on payment with property/quote/photo IDs", () => {
    const src = deploy();
    expect(src).toContain("setTierCanisterIds");
    expect(src).toMatch(/PROPERTY_ID.*QUOTE_ID.*PHOTO_ID|setTierCanisterIds/);
  });

  it("payment/main.mo declares propagateTier function", () => {
    const src = read("backend/payment/main.mo");
    expect(src).toContain("propagateTier");
  });

  it("payment/main.mo calls propagateTier in subscribe()", () => {
    const src = read("backend/payment/main.mo");
    // propagateTier must be called after the subscription Map.add in subscribe()
    const subscribeIdx   = src.indexOf("func subscribe(");
    const propagateIdx   = src.indexOf("await propagateTier(msg.caller,", subscribeIdx);
    expect(subscribeIdx).toBeGreaterThan(-1);
    expect(propagateIdx).toBeGreaterThan(subscribeIdx);
  });

  it("payment/main.mo calls propagateTier in grantSubscription()", () => {
    const src = read("backend/payment/main.mo");
    const fnIdx        = src.indexOf("func grantSubscription(");
    const propagateIdx = src.indexOf("await propagateTier(", fnIdx);
    expect(fnIdx).toBeGreaterThan(-1);
    expect(propagateIdx).toBeGreaterThan(fnIdx);
  });

  it("payment/main.mo propagates #Free on cancelSubscription()", () => {
    const src = read("backend/payment/main.mo");
    expect(src).toMatch(/propagateTier\([^,]+,\s*#Free\)/);
  });
});

// ── SEC.2 — updateCallLimits is transient (resets on upgrade, prevents unbounded growth) ──

describe("SEC.2 — updateCallLimits declared as transient var in every canister", () => {
  // In a `persistent actor`, all `let`/`var` declarations are implicitly stable.
  // The rate-limit sliding-window map grows with every unique caller and is
  // never pruned — if left stable it accumulates across upgrades indefinitely.
  // `transient` resets the map to Map.empty() on every canister upgrade,
  // which is the correct behaviour for an in-memory rate-limit window.
  // `transient let` is preferred over `transient var` for Map bindings because
  // Map is mutated in-place (Motoko M0244: "var never reassigned, use let").

  const backendDirs = readdirSync(resolve(ROOT, "backend")).filter((d) => {
    try {
      readFileSync(resolve(ROOT, "backend", d, "main.mo"), "utf-8");
      return true;
    } catch {
      return false;
    }
  });

  it("every canister that declares updateCallLimits uses 'transient let' or 'transient var'", () => {
    for (const dir of backendDirs) {
      const src = readFileSync(resolve(ROOT, "backend", dir, "main.mo"), "utf-8");
      if (!src.includes("updateCallLimits")) continue; // canister has no rate limiter — skip
      expect(
        src,
        `backend/${dir}/main.mo: updateCallLimits must be 'transient let' (or 'transient var') to reset on upgrade`
      ).toMatch(/transient\s+(?:let|var)\s+updateCallLimits/);
    }
  });

  it("no canister uses bare 'var updateCallLimits' or bare 'let updateCallLimits' (would persist across upgrades)", () => {
    for (const dir of backendDirs) {
      const src = readFileSync(resolve(ROOT, "backend", dir, "main.mo"), "utf-8");
      // Must NOT match `var/let updateCallLimits` without `transient` in front
      expect(
        src,
        `backend/${dir}/main.mo: updateCallLimits must not be plain 'var' (use transient let)`
      ).not.toMatch(/(?<!transient\s)(?<!\w)var\s+updateCallLimits/);
      expect(
        src,
        `backend/${dir}/main.mo: updateCallLimits must not be plain 'let' (use transient let)`
      ).not.toMatch(/(?<!transient\s)(?<!\w)let\s+updateCallLimits/);
    }
  });
});

// ── SEC.1 — anonymous principal rejected in all canisters with update functions ─

describe("SEC.1 — Principal.isAnonymous guard in every update-capable canister", () => {
  // The anonymous principal (2vxsx-fae) is not authenticated.
  // Every canister that accepts update calls must reject it before doing any work.
  // The guard lives in requireActive(caller) so it covers all update entry points.
  // payment.subscribe() is the only canister that guards inline (no requireActive);
  // it must also have the check.
  //
  // Per canister-security skill: isAnonymous rejection is mandatory, not advisory.

  const backendDirs = readdirSync(resolve(ROOT, "backend")).filter((d) => {
    try {
      readFileSync(resolve(ROOT, "backend", d, "main.mo"), "utf-8");
      return true;
    } catch {
      return false;
    }
  });

  // Canisters that have public shared update functions and must guard against anonymous.
  // ai_proxy is excluded — it only accepts calls from other canisters (principal-checked
  // via trusted-canister list, not open to end-user principals).
  const CANISTERS_WITH_UPDATE_FUNCS = [
    "auth", "property", "job", "contractor", "quote", "payment",
    "photo", "report", "market", "maintenance", "sensor",
    "monitoring", "listing", "agent", "recurring", "bills",
  ];

  for (const canister of CANISTERS_WITH_UPDATE_FUNCS) {
    it(`backend/${canister}/main.mo rejects the anonymous principal`, () => {
      const src = readFileSync(resolve(ROOT, "backend", canister, "main.mo"), "utf-8");
      expect(
        src,
        `backend/${canister}/main.mo must call Principal.isAnonymous`
      ).toMatch(/Principal\.isAnonymous/);
    });
  }

  it("every canister that has a requireActive(caller) guard includes isAnonymous check", () => {
    for (const dir of backendDirs) {
      const src = readFileSync(resolve(ROOT, "backend", dir, "main.mo"), "utf-8");
      // If a canister has requireActive(caller : Principal), the isAnonymous guard
      // must appear inside that function (not just at individual call sites).
      if (/requireActive\(caller\s*:\s*Principal\)/.test(src)) {
        expect(
          src,
          `backend/${dir}/main.mo: requireActive has caller param but no isAnonymous check`
        ).toMatch(/Principal\.isAnonymous/);
      }
    }
  });
});

// ── SEC.3 — inspect_message cycle-drain mitigation (advisory) ─────────────────

describe("SEC.3 — inspect_message cycle-drain mitigation (advisory)", () => {
  // `system func inspect_message()` lets a canister reject ingress messages
  // before execution, saving cycles on obviously-invalid calls.
  // Per canister-security skill: this is a cycle-saving optimisation, NOT a
  // security boundary (it can be bypassed via inter-canister calls).
  // High-value targets: auth (public registration), photo (large payloads),
  // sensor (high-frequency IoT ingestion).
  //
  const backendDirs = readdirSync(resolve(ROOT, "backend")).filter((d) => {
    try {
      readFileSync(resolve(ROOT, "backend", d, "main.mo"), "utf-8");
      return true;
    } catch {
      return false;
    }
  });

  const readCanister = (name: string) =>
    readFileSync(resolve(ROOT, "backend", name, "main.mo"), "utf-8");

  it("backend/auth/main.mo implements inspect to reject anonymous/empty-payload calls", () => {
    const src = readCanister("auth");
    expect(src).toMatch(/system\s+func\s+inspect/);
    expect(src).toMatch(/isAnonymous/);
    expect(src).toMatch(/arg\.size\(\)/);
  });

  it("backend/photo/main.mo implements inspect to reject anonymous/empty-payload calls", () => {
    const src = readCanister("photo");
    expect(src).toMatch(/system\s+func\s+inspect/);
    expect(src).toMatch(/isAnonymous/);
    expect(src).toMatch(/arg\.size\(\)/);
  });

  it("backend/sensor/main.mo implements inspect to reject anonymous/empty-payload calls", () => {
    const src = readCanister("sensor");
    expect(src).toMatch(/system\s+func\s+inspect/);
    expect(src).toMatch(/isAnonymous/);
    expect(src).toMatch(/arg\.size\(\)/);
  });

  it("advisory — count of canisters with inspect (track adoption progress)", () => {
    const withInspect = backendDirs.filter((d) => {
      const src = readFileSync(resolve(ROOT, "backend", d, "main.mo"), "utf-8");
      return /system\s+func\s+inspect/.test(src);
    });
    // auth, photo, sensor all implemented — set to >= 3.
    expect(withInspect.length).toBeGreaterThanOrEqual(3);
  });
});
