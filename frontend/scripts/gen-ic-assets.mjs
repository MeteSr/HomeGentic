#!/usr/bin/env node
/**
 * Generates frontend/dist/_headers at the end of every production build.
 *
 * Why here and not in frontend/public/?
 *   public/ is copied verbatim — Vite does not substitute %VITE_*% placeholders
 *   inside it.  The voice agent URL must be resolved before the file is written so
 *   the CSP connect-src contains the real origin, not a literal placeholder.
 *
 * The frontend canister (@dfinity/static-site recipe) reads dist/_headers when
 * `icp deploy frontend` syncs dist/ and sets the listed headers on every
 * response it serves.  An HTTP-header CSP is stronger than a <meta> tag CSP
 * because the canister includes it in the certified response — a network
 * attacker cannot strip it.
 *
 * Ordering requirement (scripts/deploy.sh):
 *   canister IDs + VITE_* written to .env
 *   npm run build              (Vite reads .env; this script runs as postbuild)
 *   icp deploy frontend        (syncs dist/ including _headers and _redirects)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { wellKnownFiles } from "./appLinks.mjs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = resolve(__dirname, "../..");
const DIST    = resolve(__dirname, "../dist");

// ── Load .env from project root ───────────────────────────────────────────────
// dfx writes CANISTER_ID_* here; VITE_VOICE_AGENT_URL must be pre-populated.
function loadDotEnv() {
  const envFile = resolve(ROOT, ".env");
  if (!existsSync(envFile)) return {};
  return Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

// process.env takes precedence (CI injects vars directly)
const env = { ...loadDotEnv(), ...process.env };

const voiceAgentUrl = env.VITE_VOICE_AGENT_URL?.trim();

if (!voiceAgentUrl) {
  // Fail hard in production — a missing URL means the voice-agent origin is
  // absent from connect-src and the browser will block all voice features.
  if (env.NODE_ENV === "production" || env.DFX_NETWORK === "ic") {
    console.error(
      "[gen-ic-assets] FATAL: VITE_VOICE_AGENT_URL is not set.\n" +
      "  Set it in .env (or CI environment) before running npm run build.\n" +
      "  Example: VITE_VOICE_AGENT_URL=https://voice.homegentic.app"
    );
    process.exit(1);
  }
  console.warn("[gen-ic-assets] WARN: VITE_VOICE_AGENT_URL not set — using http://localhost:3001 (dev only)");
}

const voiceOrigin = voiceAgentUrl || "http://localhost:3001";

// The notification relay is optional; when configured, browsers must be able
// to reach it to register for push.
let notificationsOrigin = "";
if (env.VITE_NOTIFICATIONS_URL?.trim()) {
  try {
    notificationsOrigin = new URL(env.VITE_NOTIFICATIONS_URL.trim()).origin;
  } catch {
    console.error(`[gen-ic-assets] FATAL: VITE_NOTIFICATIONS_URL is not a valid URL: ${env.VITE_NOTIFICATIONS_URL}`);
    process.exit(1);
  }
}

// The IoT gateway is optional too; the sensor "Connect account" popup calls
// it (POST /oauth/device/link) from the page.
let iotGatewayOrigin = "";
if (env.VITE_IOT_GATEWAY_URL?.trim()) {
  try {
    iotGatewayOrigin = new URL(env.VITE_IOT_GATEWAY_URL.trim()).origin;
  } catch {
    console.error(`[gen-ic-assets] FATAL: VITE_IOT_GATEWAY_URL is not a valid URL: ${env.VITE_IOT_GATEWAY_URL}`);
    process.exit(1);
  }
}

// ── Build CSP ─────────────────────────────────────────────────────────────────
// Production-appropriate directives — no localhost entries.
// Matches the <meta> tag CSP in index.html but without the dev-only localhost
// endpoints (http://localhost:4943, ws://localhost:*).
// When both a header CSP and a meta CSP are present the browser enforces both;
// the header is the more restrictive (and certified) policy.
// Stripe.js + Elements (CheckoutPage) need js.stripe.com scripts/frames,
// api.stripe.com / m.stripe.* XHR, and *.stripe.com frames (hooks.stripe.com
// 3-D Secure challenges) and images. Kept in sync with the <meta> CSP in
// index.html — browsers enforce both, so a source missing here blocks it.
const STRIPE_CONNECT = "https://api.stripe.com https://m.stripe.network https://m.stripe.com https://errors.stripe.com";
const STRIPE_FRAME   = "https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://m.stripe.network";
const STRIPE_IMG     = "https://*.stripe.com";
// Cloudflare Turnstile (the one-time human check before free AI calls) loads
// its script and an iframe from challenges.cloudflare.com.
const TURNSTILE      = "https://challenges.cloudflare.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' https://js.stripe.com https://m.stripe.network ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // icp-api.io is an alternative boundary-node endpoint used by some @dfinity/* versions
  `connect-src 'self' https://ic0.app https://*.ic0.app https://icp-api.io ${STRIPE_CONNECT} ${voiceOrigin}${notificationsOrigin ? ` ${notificationsOrigin}` : ""}${iotGatewayOrigin ? ` ${iotGatewayOrigin}` : ""}`,
  // The voice Worker serves off-chain photos (listing photos load straight from it).
  `img-src 'self' data: blob: ${STRIPE_IMG} ${voiceOrigin}`,
  `frame-src ${STRIPE_FRAME} ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// ── Write _headers ────────────────────────────────────────────────────────────
// The frontend canister is the certified-assets canister (@dfinity/static-site
// recipe, static-site skill). It reads dist/_headers (Netlify syntax: a path
// pattern, then indented "Name: value" lines) and adds no headers of its own,
// so every security header is listed here. Patterns match the file (asset
// key), with one "*" wildcard that also matches "/"; every matching block
// contributes. SPA routing lives in public/_redirects, copied into dist/.
// It serves no uncertified "raw" mode setting: link only to the certified
// domain (static-site pitfall 14).
const blocks = [];
const block = (pattern, headers) => blocks.push([pattern, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join("\n"));

// Every file.
block("/*", {
  // HSTS: tell browsers to always use HTTPS for this origin for 1 year
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  // Prevent this app from being embedded in a frame (clickjacking)
  "X-Frame-Options": "DENY",
  // Prevent browsers from MIME-sniffing response content types
  "X-Content-Type-Options": "nosniff",
  // Don't leak the full URL in Referer headers to third-party origins
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Allow mic for voice agent (top-level only); block camera + geolocation
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": csp,
});

// Vite names everything under /assets/ by content hash, so a changed file
// gets a new URL and these can be cached for good. HTML is served no-cache so
// a deploy is picked up at once (the canister answers a revalidation with 304
// when nothing changed); every /*-rewritten client route serves index.html.
block("/assets/*", { "Cache-Control": "public, max-age=31536000, immutable" });
block("/*.html", { "Cache-Control": "no-cache" });

// .well-known/ is uploaded automatically (the only dot-folder that is).
// Internet Identity fetches ii-alternative-origins from the derivation origin
// (this canister's own address) while a page on homegentic.app signs in, so it
// needs CORS and a JSON content type (internet-identity skill). The bare
// Content-Type form sets the stored media type of an extension-less file.
block("/.well-known/ii-alternative-origins", {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

// Universal links: iOS wants the association file served as JSON despite
// having no extension.
const wellKnown = wellKnownFiles(env);
if (Object.keys(wellKnown).length) {
  mkdirSync(resolve(DIST, ".well-known"), { recursive: true });
  for (const [name, body] of Object.entries(wellKnown)) {
    writeFileSync(resolve(DIST, ".well-known", name), JSON.stringify(body) + "\n");
    block(`/.well-known/${name}`, { "Content-Type": "application/json" });
  }
  console.log(`[gen-ic-assets] wrote .well-known/${Object.keys(wellKnown).join(", .well-known/")}`);
}

const outPath = resolve(DIST, "_headers");
writeFileSync(outPath, "# Generated by frontend/scripts/gen-ic-assets.mjs. Do not edit.\n\n" + blocks.join("\n\n") + "\n");

console.log(`[gen-ic-assets] wrote ${outPath}`);
console.log(`[gen-ic-assets] voice agent origin in CSP: ${voiceOrigin}`);
