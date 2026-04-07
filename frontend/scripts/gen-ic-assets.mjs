#!/usr/bin/env node
/**
 * Generates frontend/dist/.ic-assets.json5 at the end of every production build.
 *
 * Why here and not in frontend/public/?
 *   public/ is copied verbatim — Vite does not substitute %VITE_*% placeholders
 *   inside it.  The voice agent URL must be resolved before the file is written so
 *   the CSP connect-src contains the real origin, not a literal placeholder.
 *
 * The assets canister reads this file during `dfx deploy frontend` and sets the
 * listed headers on every HTTP response it serves.  An HTTP-header CSP is stronger
 * than a <meta> tag CSP because the assets canister includes it in the certified
 * BLS-signed response — a network attacker cannot strip it.
 *
 * Ordering requirement:
 *   dfx deploy --network ic    (writes CANISTER_ID_* + VITE_* to .env)
 *   npm run build              (Vite reads .env; this script runs as postbuild)
 *   dfx deploy frontend --network ic   (uploads dist/ including .ic-assets.json5)
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
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

// ── Build CSP ─────────────────────────────────────────────────────────────────
// Production-appropriate directives — no localhost entries.
// Matches the <meta> tag CSP in index.html but without the dev-only localhost
// endpoints (http://localhost:4943, ws://localhost:*).
// When both a header CSP and a meta CSP are present the browser enforces both;
// the header is the more restrictive (and certified) policy.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // icp-api.io is an alternative boundary-node endpoint used by some @dfinity/* versions
  `connect-src 'self' https://ic0.app https://*.ic0.app https://icp-api.io ${voiceOrigin}`,
  "img-src 'self' data: blob:",
  "frame-ancestors 'none'",
].join("; ");

// ── Write .ic-assets.json5 ────────────────────────────────────────────────────
const icAssets = [
  {
    match: "**/*",
    headers: {
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
    },
  },
];

const outPath = resolve(DIST, ".ic-assets.json5");
writeFileSync(outPath, JSON.stringify(icAssets, null, 2) + "\n");

console.log(`[gen-ic-assets] wrote ${outPath}`);
console.log(`[gen-ic-assets] voice agent origin in CSP: ${voiceOrigin}`);
