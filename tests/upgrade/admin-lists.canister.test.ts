/**
 * Every admin-managed principal list (admins, trusted canisters, relays,
 * notifiers, gateways, readers) can be changed only by an admin, and a remove
 * really takes the principal off (test-gap audit 2026-11-03, M6: the
 * remove* half of these pairs had no test at all).
 *
 *  ADM.1 on each canister a stranger can neither add nor remove an admin; an
 *        added admin can act as one, and after removeAdmin it can't
 *  ADM.2 for each other add/remove pair a stranger is refused both ways, the
 *        admin's add and remove succeed, and where the canister lists the
 *        principals the list shows the add and then the remove
 *
 * Run: cd tests/upgrade && npx vitest run admin-lists.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Principal } from "@icp-sdk/core/principal";
import { createPic } from "./__helpers__/setup";
import { deployAll, ALL_CANISTERS, type Deployment, type CanisterName } from "./__helpers__/deployAll";

/** "ok" for an ok result (or a method that returns no Result), else the error tag. */
/** Retired referrals still answers addAdmin with a text error ("unauthorized");
 *  changing it to the common Error would be a Candid break on a dead canister. */
const outcome = (r: unknown): string => {
  if (!(r && typeof r === "object" && "err" in r)) return "ok";
  const err = (r as { err: unknown }).err;
  if (err === "unauthorized") return "NotAuthorized";
  return typeof err === "object" && err ? Object.keys(err)[0] : String(err);
};

/** A call refused by inspect_message (retired referrals turns away non-admins
 *  there) counts as NotAuthorized. */
const refused = async (call: Promise<unknown>): Promise<string> => {
  try {
    return outcome(await call);
  } catch (e) {
    if (String(e).includes("canister_inspect_message explicitly refused")) return "NotAuthorized";
    throw e;
  }
};

/** [canister, add, remove, list getter or null] */
export const PRINCIPAL_LISTS: [CanisterName, string, string, string | null][] = [
  ["auth", "addNotifier", "removeNotifier", null],
  ["ai_proxy", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["property", "addIdentityRelay", "removeIdentityRelay", "listIdentityRelays"],
  ["property", "addNotifier", "removeNotifier", null],
  ["property", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["job", "addInboxRelay", "removeInboxRelay", null],
  ["job", "addNotifier", "removeNotifier", null],
  ["job", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["contractor", "addLicenseRelay", "removeLicenseRelay", null],
  ["contractor", "addNotifier", "removeNotifier", null],
  ["contractor", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["quote", "addNotifier", "removeNotifier", null],
  ["payment", "addStripeRelay", "removeStripeRelay", "listStripeRelays"],
  ["payment", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["photo", "addPhotoRelay", "removePhotoRelay", null],
  ["photo", "addCronRelay", "removeCronRelay", null],
  ["monitoring", "addReporter", "removeReporter", null],
  ["report", "addTrustedCanister", "removeTrustedCanister", "getTrustedCanisters"],
  ["sensor", "addGateway", "removeGateway", null],
  ["sensor", "addTrustedReader", "removeTrustedReader", null],
  ["listing", "addNotifier", "removeNotifier", null],
  ["listing", "addShowingRelay", "removeShowingRelay", null],
  ["agent", "addContactReader", "removeContactReader", null],
  ["fee", "addReferralRelay", "removeReferralRelay", null],
  ["audit", "addTrustedCanister", "removeTrustedCanister", null],
];

describe("admin-managed principal lists", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("adm-admin");
  const stranger = createIdentity("adm-stranger");

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  const addAdminArgs = (c: CanisterName, p: Principal) =>
    new Map(d.svcs[c]._fields).get("addAdmin")!.argTypes.length === 2 ? [p, "n"] : [p];

  it.each(ALL_CANISTERS)(
    "ADM.1 %s: only an admin adds or removes admins, and a removed admin loses the role",
    async (c) => {
      const methods = new Map(d.svcs[c]._fields);
      if (!methods.has("removeAdmin")) return;
      const second = createIdentity(`adm-second-${c}`);
      const someone = createIdentity(`adm-someone-${c}-${++n}`).getPrincipal();

      expect(await refused(d.actor(c, stranger).addAdmin(...addAdminArgs(c, stranger.getPrincipal())))).toBe(
        "NotAuthorized",
      );
      expect(await refused(d.actor(c, stranger).removeAdmin(admin.getPrincipal()))).toBe("NotAuthorized");
      expect(await refused(d.actor(c, second).removeAdmin(someone))).toBe("NotAuthorized");

      expect(await refused(d.actor(c, admin).addAdmin(...addAdminArgs(c, second.getPrincipal())))).toBe("ok");
      expect(await refused(d.actor(c, second).removeAdmin(someone))).toBe("ok");

      expect(await refused(d.actor(c, admin).removeAdmin(second.getPrincipal()))).toBe("ok");
      expect(await refused(d.actor(c, second).removeAdmin(someone))).toBe("NotAuthorized");
      // The original admin is untouched.
      expect(await refused(d.actor(c, admin).removeAdmin(someone))).toBe("ok");
    },
  );

  it.each(PRINCIPAL_LISTS)(
    "ADM.2 %s.%s / %s: admin-only, and the remove takes effect",
    async (c, add, remove, list) => {
      const p = createIdentity(`adm-member-${c}-${add}`).getPrincipal();
      const has = async () =>
        ((await d.actor(c, admin)[list!]()) as Principal[]).some((x) => x.toText() === p.toText());

      expect(await refused(d.actor(c, stranger)[add](p))).toBe("NotAuthorized");
      if (list) expect(await has()).toBe(false);

      expect(await refused(d.actor(c, admin)[add](p))).toBe("ok");
      if (list) expect(await has()).toBe(true);

      expect(await refused(d.actor(c, stranger)[remove](p))).toBe("NotAuthorized");
      if (list) expect(await has()).toBe(true);

      expect(await refused(d.actor(c, admin)[remove](p))).toBe("ok");
      if (list) expect(await has()).toBe(false);
    },
  );
});
