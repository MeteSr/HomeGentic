/**
 * Shared helpers for PocketIC canister upgrade tests.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 * 1. WSL 2 with the PocketIC binary:
 *      export POCKET_IC_BIN=~/.local/bin/pocket-ic
 *    (see ../../scripts/setup-pocketic.sh)
 *
 * 2. Compiled Wasm files — produced by dfx build at the project root:
 *      dfx build <canister>        # one canister
 *      dfx build                   # all canisters
 *    Wasm lands at: .dfx/local/canisters/<name>/<name>.wasm
 *
 * 3. Install this package's deps (first time only):
 *      cd tests/upgrade && npm install
 */

import { PocketIc } from "@dfinity/pic";
import { IDL }      from "@icp-sdk/core/candid";
import { existsSync } from "fs";
import { resolve }    from "path";

// Project root relative to this file (tests/upgrade/__helpers__/)
const ROOT = resolve(__dirname, "../../..");

// ── Wasm resolution ───────────────────────────────────────────────────────────

export function wasmPath(canisterName: string): string {
  const p = resolve(ROOT, `.dfx/local/canisters/${canisterName}/${canisterName}.wasm`);
  if (!existsSync(p)) {
    throw new Error(
      `\nWasm not found: ${p}\n` +
      `Run 'dfx build ${canisterName}' (or 'dfx build') from the project root first.\n`
    );
  }
  return p;
}

// ── PocketIC factory ──────────────────────────────────────────────────────────

export async function createPic(): Promise<PocketIc> {
  const bin = process.env.POCKET_IC_BIN;
  if (!bin) {
    throw new Error(
      `\nPOCKET_IC_BIN env var not set.\n` +
      `Run: export POCKET_IC_BIN=~/.local/bin/pocket-ic\n` +
      `See ../../scripts/setup-pocketic.sh for one-step installation.\n`
    );
  }
  return PocketIc.create(bin);
}

// ── IDL factories (inline — isolates upgrade tests from frontend dep graph) ───

/** Auth canister — methods used in upgrade tests only. */
export const authIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const UserRole = I.Variant({
    Homeowner: I.Null, Contractor: I.Null, Realtor: I.Null, Builder: I.Null,
  });
  const UserProfile = I.Record({
    principal:    I.Principal,
    role:         UserRole,
    email:        I.Text,
    phone:        I.Text,
    createdAt:    I.Int,
    updatedAt:    I.Int,
    isActive:     I.Bool,
    lastLoggedIn: I.Opt(I.Int),
  });
  const Error = I.Variant({
    NotFound: I.Null, AlreadyExists: I.Null, NotAuthorized: I.Null,
    Paused: I.Null, InvalidInput: I.Text,
  });
  const UserStats = I.Record({
    total: I.Nat, newToday: I.Nat, newThisWeek: I.Nat, activeThisWeek: I.Nat,
    homeowners: I.Nat, contractors: I.Nat, realtors: I.Nat, builders: I.Nat,
  });
  return I.Service({
    register:     I.Func([I.Record({ role: UserRole, email: I.Text, phone: I.Text })],
                         [I.Variant({ ok: UserProfile, err: Error })], []),
    getProfile:   I.Func([], [I.Variant({ ok: UserProfile, err: Error })], ["query"]),
    recordLogin:  I.Func([], [], []),
    getUserStats: I.Func([], [UserStats], ["query"]),
    getMetrics:   I.Func([], [I.Record({
      totalUsers: I.Nat, homeowners: I.Nat, contractors: I.Nat,
      realtors: I.Nat, builders: I.Nat, isPaused: I.Bool,
    })], ["query"]),
  });
};

/** Payment canister — methods used in upgrade tests only. */
export const paymentIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Tier = I.Variant({
    Free: I.Null, Pro: I.Null, Premium: I.Null, ContractorPro: I.Null,
  });
  const Subscription = I.Record({
    owner: I.Principal, tier: Tier, expiresAt: I.Int, createdAt: I.Int,
  });
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, PaymentFailed: I.Text,
  });
  const SubscriptionStats = I.Record({
    total: I.Nat, free: I.Nat, pro: I.Nat, premium: I.Nat,
    contractorPro: I.Nat, activePaid: I.Nat, estimatedMrrUsd: I.Nat,
  });
  return I.Service({
    subscribe:            I.Func([Tier], [I.Variant({ ok: Subscription, err: Error })], []),
    getMySubscription:    I.Func([], [I.Variant({ ok: Subscription, err: Error })], ["query"]),
    getSubscriptionStats: I.Func([], [SubscriptionStats], ["query"]),
  });
};
