/**
 * The hourly ops check (scripts/ops/check-ops-alerts.mjs, run by the Cycle
 * Watchdog): its alert rules, and the script itself against a real monitoring
 * canister through PocketIC's HTTP gateway, as the watchdog runs it.
 */
import { PocketIc } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { generateKeyPairSync } from "crypto";
import { createServer, type Server } from "http";
import { execFile } from "child_process";
import { resolve } from "path";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { evaluate } from "../../scripts/ops/opsAlerts.mjs";
import { identityFromPem } from "../../scripts/ops/identity.mjs";

const ROOT = resolve(__dirname, "../..");
const MIN = 60_000_000_000n;

function edPem(): string {
  return generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

function runCheck(env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "scripts/ops/check-ops-alerts.mjs"],
      { cwd: ROOT, env: { PATH: process.env.PATH ?? "", ...env }, timeout: 60_000 },
      (err, stdout, stderr) => done({ code: err ? ((err as any).code ?? 1) : 0, out: stdout + stderr }),
    );
  });
}

describe("ops alert rules", () => {
  const now = 1_000_000n * MIN;
  const err = (o: Record<string, unknown>) => ({
    fingerprint: "fp",
    message: "m",
    errorType: "email",
    count: 1n,
    firstSeen: now - 10n * MIN,
    lastSeen: now - 5n * MIN,
    tierCounts: [],
    release: [],
    resolved: false,
    ...o,
  });

  it("reports only new critical alerts", () => {
    const alerts = [
      {
        id: "1",
        severity: { Critical: null },
        category: { Cycles: null },
        canisterId: [],
        message: "low",
        resolved: false,
        createdAt: now - 10n * MIN,
        resolvedAt: [],
      },
      {
        id: "2",
        severity: { Critical: null },
        category: { Cycles: null },
        canisterId: [],
        message: "old",
        resolved: false,
        createdAt: now - 120n * MIN,
        resolvedAt: [],
      },
      {
        id: "3",
        severity: { Warning: null },
        category: { Memory: null },
        canisterId: [],
        message: "warn",
        resolved: false,
        createdAt: now,
        resolvedAt: [],
      },
      {
        id: "4",
        severity: { Critical: null },
        category: { Cycles: null },
        canisterId: [],
        message: "done",
        resolved: true,
        createdAt: now,
        resolvedAt: [],
      },
    ];
    expect(evaluate({ alerts, nowNs: now }).map((p: any) => p.text)).toEqual(["Critical Cycles alert: low"]);
  });

  it("repeats unresolved service errors while they keep happening", () => {
    const problems = evaluate({
      serviceErrors: [
        err({}),
        err({ fingerprint: "quiet", lastSeen: now - 90n * MIN }),
        err({ fingerprint: "acked", resolved: true }),
      ],
      nowNs: now,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].text).toContain('resolveServiceError("fp")');
  });

  it("reports a frontend error during its first day only", () => {
    const problems = evaluate({
      frontendErrors: [
        err({ errorType: "TypeError", message: "new" }),
        err({ errorType: "TypeError", message: "old", firstSeen: now - 2n * 1440n * MIN }),
        err({ errorType: "TypeError", message: "gone quiet", lastSeen: now - 70n * MIN }),
      ],
      nowNs: now,
    });
    expect(problems.map((p: any) => p.text)).toEqual(["New frontend error TypeError: new (1 so far)"]);
  });

  it("loads both key types dfx and icp-cli write", () => {
    expect(identityFromPem(edPem()).getPrincipal().toText()).toMatch(/-cai$|^[a-z0-9-]+$/);
    const sec1 = generateKeyPairSync("ec", { namedCurve: "secp256k1" })
      .privateKey.export({ format: "pem", type: "sec1" })
      .toString();
    const pkcs8 = generateKeyPairSync("ec", { namedCurve: "secp256k1" })
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString();
    expect(identityFromPem(sec1).getPrincipal().isAnonymous()).toBe(false);
    expect(identityFromPem(pkcs8).getPrincipal().isAnonymous()).toBe(false);
    expect(() => identityFromPem("")).toThrow();
  });
});

describe("check-ops-alerts.mjs against the monitoring canister", () => {
  let pic: PocketIc;
  let host = "";
  let canisterId = "";
  let mon: any;
  let relay: Server;
  let relayUrl = "";
  const adminPem = edPem();
  const strangerPem = edPem();

  beforeAll(async () => {
    pic = await createPic();
    const admin = identityFromPem(adminPem);
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("monitoring"));
    const svc = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    const fx = await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("monitoring"), arg });
    canisterId = fx.canisterId.toText();
    mon = pic.createActor<any>((() => svc) as any, fx.canisterId);
    mon.setIdentity(CONTROLLER);
    await mon.setBootstrapNonce("n");
    mon.setIdentity(admin as any);
    expect(await mon.addAdmin(admin.getPrincipal(), "n")).toEqual({ ok: null });
    host = `http://localhost:${await pic.makeLive()}`;

    let healthy = true;
    relay = createServer((_req, res) => {
      res.statusCode = healthy ? 200 : 503;
      res.end("{}");
    });
    await new Promise<void>((r) => relay.listen(0, r));
    relayUrl = `http://localhost:${(relay.address() as any).port}`;
    (relay as any).setHealthy = (v: boolean) => {
      healthy = v;
    };
  }, 180_000);

  afterAll(async () => {
    relay?.close();
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  const env = (pem: string) => ({
    IC_HOST: host,
    CANISTER_ID_MONITORING: canisterId,
    IDENTITY_PEM: pem,
    NOTIFICATIONS_URL: relayUrl,
  });

  it("passes when nothing is wrong", async () => {
    const r = await runCheck(env(adminPem));
    expect(r.out).toContain("No new ops alerts");
    expect(r.code).toBe(0);
  });

  it("fails on a recent service error and names how to resolve it", async () => {
    const now = BigInt(Date.now()) * 1_000_000n;
    await mon.recordServiceError({
      fingerprint: "stripe-webhook:handler error on invoice.paid",
      message: "handler error on invoice.paid",
      errorType: "stripe-webhook",
      count: 1n,
      firstSeen: now,
      lastSeen: now,
      tierCounts: [],
      release: [],
    });
    const r = await runCheck(env(adminPem));
    expect(r.code).toBe(1);
    expect(r.out).toContain("stripe-webhook: handler error on invoice.paid");
    expect(await mon.resolveServiceError("stripe-webhook:handler error on invoice.paid")).toEqual({ ok: null });
    expect((await runCheck(env(adminPem))).code).toBe(0);
  });

  it("drops error records not seen for 90 days (the Privacy Policy's log retention)", async () => {
    const now = BigInt(Math.floor(await pic.getTime())) * 1_000_000n; // the canister's clock
    const old = now - 91n * 1440n * MIN;
    const rec = (fingerprint: string, lastSeen: bigint) => ({
      fingerprint,
      message: "m",
      errorType: "TypeError",
      count: 1n,
      firstSeen: lastSeen,
      lastSeen,
      tierCounts: [],
      release: [],
    });
    await mon.recordFrontendError(rec("ancient", old));
    await mon.recordFrontendError(rec("recent", now));
    const fps = ((await mon.getFrontendErrors(0n, 50n)) as any[]).map((e) => e.fingerprint);
    expect(fps).toContain("recent");
    expect(fps).not.toContain("ancient");
  });

  it("fails when a relay's /health is down", async () => {
    (relay as any).setHealthy(false);
    const r = await runCheck(env(adminPem));
    (relay as any).setHealthy(true);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Notification relay /health → 503");
  });

  it("fails, rather than reporting all clear, when the identity isn't a monitoring admin", async () => {
    const r = await runCheck(env(strangerPem));
    expect(r.code).toBe(1);
    expect(r.out).toContain("not a monitoring admin");
  });
});
