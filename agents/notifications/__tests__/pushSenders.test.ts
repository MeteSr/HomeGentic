/**
 * The real push senders, apns.ts and fcm.ts (mocked everywhere else; test-gap
 * audit 2026-11-03, M7). The network is faked, the signing is real.
 *
 * APNS.1 without credentials nothing is sent
 * APNS.2 the request: path, topic, push type, body; an ES256 provider token
 *        signed with the configured key, cached between sends
 * APNS.3 a non-200 mockAnswer rejects with "APNs <status>: <reason>", which the
 *        dispatcher's stale-token check reads (410 / BadDeviceToken)
 * APNS.4 a connection error rejects
 * FCM.1  without credentials nothing is sent
 * FCM.2  an RS256 service-account JWT is exchanged for an access token, then
 *        the message goes to the project's send endpoint with it
 * FCM.3  a failed token exchange or send rejects with the status and body
 *        (UNREGISTERED reaches the dispatcher's stale-token check)
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { EventEmitter } from "events";
import crypto from "crypto";

const payload = {
  title: "Roof check",
  body: "Time for the yearly look.",
  route: "/maintenance",
  data: { jobId: "j1" },
};

const b64urlJson = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
const verifyJwt = (jwt: string, key: crypto.KeyObject, alg: "ES256" | "RS256") => {
  const [h, c, sig] = jwt.split(".");
  const raw = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const ok =
    alg === "ES256"
      ? crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, raw)
      : crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), key, raw);
  return { ok, header: b64urlJson(h), claims: b64urlJson(c) };
};

// ── APNs: a fake http2 ───────────────────────────────────────────────────────
type FakeReq = EventEmitter & {
  headers: Record<string, string>;
  body: string;
  write: (s: string) => void;
  end: () => void;
};
let mockConnects: string[] = [];
let mockRequests: FakeReq[] = [];
let mockAnswer: { status: number; reason?: string } | { connectError: string } = { status: 200 };

jest.mock("http2", () => ({
  __esModule: true,
  default: {
    connect: (origin: string) => {
      mockConnects.push(origin);
      const { EventEmitter: EE } = require("events");
      const client: any = new EE();
      client.close = () => {};
      client.request = (headers: Record<string, string>) => {
        const req: any = new EE();
        req.headers = headers;
        req.body = "";
        req.write = (s: string) => (req.body += s);
        req.end = () =>
          setImmediate(() => {
            if ("connectError" in mockAnswer) return client.emit("error", new Error(mockAnswer.connectError));
            req.emit("response", { ":status": mockAnswer.status });
            if (mockAnswer.status !== 200) {
              req.emit("data", Buffer.from(JSON.stringify({ reason: mockAnswer.reason })));
              req.emit("end");
            }
          });
        mockRequests.push(req);
        return req;
      };
      return client;
    },
  },
}));

const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const savedEnv = { ...process.env };

function loadApns(env: Record<string, string | undefined>) {
  Object.assign(process.env, env);
  let mod!: typeof import("../apns");
  jest.isolateModules(() => {
    mod = require("../apns");
  });
  return mod;
}
function loadFcm(env: Record<string, string | undefined>) {
  Object.assign(process.env, env);
  let mod!: typeof import("../fcm");
  jest.isolateModules(() => {
    mod = require("../fcm");
  });
  return mod;
}

beforeEach(() => {
  mockConnects = [];
  mockRequests = [];
  mockAnswer = { status: 200 };
  for (const k of [
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_PRIVATE_KEY",
    "APNS_BUNDLE_ID",
    "FCM_PROJECT_ID",
    "FCM_SERVICE_ACCOUNT_JSON",
  ])
    delete process.env[k];
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

const apnsEnv = () => ({
  APNS_KEY_ID: "KEY123",
  APNS_TEAM_ID: "TEAM456",
  // Stored with literal \n in the environment, as Fly secrets are.
  APNS_PRIVATE_KEY: (ec.privateKey.export({ type: "pkcs8", format: "pem" }) as string).replace(/\n/g, "\\n"),
});

describe("sendApns", () => {
  it("APNS.1 sends nothing without credentials", async () => {
    const { sendApns } = loadApns({});
    await sendApns("abcdef0123456789", payload);
    expect(mockConnects).toEqual([]);
  });

  it("APNS.2 posts the alert with a valid ES256 provider token, reused across sends", async () => {
    const { sendApns } = loadApns(apnsEnv());
    await sendApns("devtoken1", payload);
    await sendApns("devtoken2", payload);
    expect(mockConnects).toEqual(["https://api.sandbox.push.apple.com", "https://api.sandbox.push.apple.com"]);
    const [r1, r2] = mockRequests;
    expect(r1.headers).toMatchObject({
      ":method": "POST",
      ":path": "/3/device/devtoken1",
      "apns-topic": "app.homegentic.mobile",
      "apns-push-type": "alert",
      "content-type": "application/json",
    });
    expect(JSON.parse(r1.body)).toEqual({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default", badge: 1 },
      route: "/maintenance",
      jobId: "j1",
    });
    expect(Number(r1.headers["content-length"])).toBe(Buffer.byteLength(r1.body));

    const jwt = r1.headers.authorization.replace(/^bearer /, "");
    const { ok, header, claims } = verifyJwt(jwt, ec.publicKey, "ES256");
    expect(ok).toBe(true);
    expect(header).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(claims.iss).toBe("TEAM456");
    expect(r2.headers.authorization).toBe(r1.headers.authorization);
  });

  it("APNS.2 uses the production host in production", async () => {
    const { sendApns } = loadApns({ ...apnsEnv(), NODE_ENV: "production", APNS_BUNDLE_ID: "app.x" });
    await sendApns("devtoken", payload);
    expect(mockConnects).toEqual(["https://api.push.apple.com"]);
    expect(mockRequests[0].headers["apns-topic"]).toBe("app.x");
  });

  it("APNS.3 a rejected push carries the status and reason the dispatcher checks", async () => {
    const { sendApns } = loadApns(apnsEnv());
    mockAnswer = { status: 410, reason: "Unregistered" };
    await expect(sendApns("stale", payload)).rejects.toThrow(/^APNs 410: .*Unregistered/);
    mockAnswer = { status: 400, reason: "BadDeviceToken" };
    await expect(sendApns("bad", payload)).rejects.toThrow(/BadDeviceToken/);
  });

  it("APNS.4 a connection error rejects", async () => {
    const { sendApns } = loadApns(apnsEnv());
    mockAnswer = { connectError: "ECONNRESET" };
    await expect(sendApns("devtoken", payload)).rejects.toThrow("ECONNRESET");
  });
});

// ── FCM: a fake fetch ────────────────────────────────────────────────────────
describe("sendFcm", () => {
  const sa = () => ({
    client_email: "relay@hg.iam.gserviceaccount.com",
    private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  });
  let calls: { url: string; init: RequestInit }[] = [];
  let replies: Response[] = [];
  const realFetch = global.fetch;
  beforeEach(() => {
    calls = [];
    replies = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return replies.shift() ?? new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("FCM.1 sends nothing without credentials, or with an unreadable service account", async () => {
    await loadFcm({}).sendFcm("tok", payload);
    await loadFcm({ FCM_PROJECT_ID: "hg", FCM_SERVICE_ACCOUNT_JSON: "{not json" }).sendFcm("tok", payload);
    expect(calls).toEqual([]);
  });

  it("FCM.2 exchanges a signed service-account JWT, then sends with the access token", async () => {
    replies = [
      new Response(JSON.stringify({ access_token: "ya29.token" }), { status: 200 }),
      new Response("{}", { status: 200 }),
    ];
    await loadFcm({ FCM_PROJECT_ID: "hg-prod", FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(sa()) }).sendFcm(
      "device-1",
      payload,
    );

    expect(calls.map((c) => c.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://fcm.googleapis.com/v1/projects/hg-prod/messages:send",
    ]);
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const { ok, header, claims } = verifyJwt(form.get("assertion")!, rsa.publicKey, "RS256");
    expect(ok).toBe(true);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims).toMatchObject({
      iss: "relay@hg.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(claims.exp - claims.iat).toBe(3600);

    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      message: {
        token: "device-1",
        notification: { title: payload.title, body: payload.body },
        data: { route: "/maintenance", jobId: "j1" },
        android: { notification: { sound: "default" } },
      },
    });
  });

  it("FCM.3 a failed token exchange or send rejects with the status and body", async () => {
    const env = { FCM_PROJECT_ID: "hg", FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(sa()) };
    replies = [new Response("invalid_grant", { status: 400 })];
    await expect(loadFcm(env).sendFcm("tok", payload)).rejects.toThrow("FCM token exchange failed 400: invalid_grant");
    replies = [
      new Response(JSON.stringify({ access_token: "t" }), { status: 200 }),
      new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 }),
    ];
    await expect(loadFcm(env).sendFcm("stale", payload)).rejects.toThrow(/^FCM send failed 404: .*UNREGISTERED/);
  });
});
