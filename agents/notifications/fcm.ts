import crypto from "crypto";
import type { PushPayload } from "./types";

const FCM_PROJECT_ID      = process.env.FCM_PROJECT_ID;
const SERVICE_ACCOUNT_RAW = process.env.FCM_SERVICE_ACCOUNT_JSON;

interface ServiceAccount {
  client_email: string;
  private_key:  string;
}

function getServiceAccount(): ServiceAccount | null {
  if (!SERVICE_ACCOUNT_RAW) return null;
  try {
    return JSON.parse(SERVICE_ACCOUNT_RAW) as ServiceAccount;
  } catch {
    return null;
  }
}

function base64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Exchange a service-account JWT for a short-lived OAuth 2.0 access token
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now    = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  })));

  const signing = `${header}.${claims}`;
  const sig     = base64url(
    crypto.createSign("RSA-SHA256").update(signing).sign(sa.private_key)
  );
  const jwtToken = `${signing}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwtToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FCM token exchange failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function sendFcm(deviceToken: string, payload: PushPayload): Promise<void> {
  const sa = getServiceAccount();

  if (!FCM_PROJECT_ID || !sa) {
    console.log(`[fcm] credentials not configured — skipping ${deviceToken.slice(0, 8)}…`);
    return;
  }

  const accessToken = await getAccessToken(sa);

  const message = {
    message: {
      token:        deviceToken,
      notification: { title: payload.title, body: payload.body },
      data:         { route: payload.route ?? "", ...(payload.data ?? {}) },
      android:      { notification: { sound: "default" } },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method:  "POST",
      headers: {
        authorization:  `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FCM send failed ${res.status}: ${err}`);
  }
}
