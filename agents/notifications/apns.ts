import http2  from "http2";
import crypto from "crypto";
import type { PushPayload } from "./types";

const KEY_ID      = process.env.APNS_KEY_ID;
const TEAM_ID     = process.env.APNS_TEAM_ID;
const PRIVATE_KEY = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const BUNDLE_ID   = process.env.APNS_BUNDLE_ID ?? "app.homefax.mobile";
const APNS_ORIGIN = process.env.NODE_ENV === "production"
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

// APNs JWT provider token — valid up to 60 min; we refresh at 50 min
let cachedToken: { value: string; exp: number } | null = null;

function base64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function makeProviderToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 600) return cachedToken.value;

  if (!KEY_ID || !TEAM_ID || !PRIVATE_KEY) {
    throw new Error("APNs credentials not configured (APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY)");
  }

  const header  = base64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: KEY_ID })));
  const claims  = base64url(Buffer.from(JSON.stringify({ iss: TEAM_ID, iat: now })));
  const signing = `${header}.${claims}`;

  // APNs requires ECDSA P-256 (ES256) with IEEE P1363 encoding
  const sig = crypto
    .createSign("sha256")
    .update(signing)
    .sign({ key: PRIVATE_KEY, dsaEncoding: "ieee-p1363" });

  const token = `${signing}.${base64url(sig)}`;
  cachedToken = { value: token, exp: now + 50 * 60 };
  return token;
}

export async function sendApns(deviceToken: string, payload: PushPayload): Promise<void> {
  if (!KEY_ID || !TEAM_ID || !PRIVATE_KEY) {
    console.log(`[apns] credentials not configured — skipping ${deviceToken.slice(0, 8)}…`);
    return;
  }

  const apsBody = JSON.stringify({
    aps:   { alert: { title: payload.title, body: payload.body }, sound: "default", badge: 1 },
    route: payload.route ?? null,
    ...(payload.data ?? {}),
  });

  return new Promise((resolve, reject) => {
    const client = http2.connect(APNS_ORIGIN);
    client.on("error", reject);

    const req = client.request({
      ":method":        "POST",
      ":path":          `/3/device/${deviceToken}`,
      "authorization":  `bearer ${makeProviderToken()}`,
      "apns-topic":     BUNDLE_ID,
      "apns-push-type": "alert",
      "content-type":   "application/json",
      "content-length": String(Buffer.byteLength(apsBody)),
    });

    req.write(apsBody);
    req.end();

    req.on("response", (headers) => {
      const status = Number(headers[":status"]);
      if (status === 200) {
        client.close();
        resolve();
      } else {
        let errData = "";
        req.on("data",  (c: Buffer) => (errData += c.toString()));
        req.on("end",   () => { client.close(); reject(new Error(`APNs ${status}: ${errData}`)); });
      }
    });

    req.on("error", (err) => { client.close(); reject(err); });
  });
}
