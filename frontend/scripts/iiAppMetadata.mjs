/**
 * /.well-known/ii-app-metadata (internet-identity skill,
 * references/app-metadata.md).
 *
 * Internet Identity fetches this from the derivation origin (the frontend
 * canister's own icp0.io address, which gen-ic-assets.mjs serves) and shows
 * the name, tagline and logo on its sign-in screen and on every notification
 * HomeGentic sends through II. homegentic.app signs in with that derivation
 * origin, so one copy covers both.
 *
 * II applies none of it if a single field breaks a rule, and says so only in
 * the browser console, so the build checks the rules below and fails instead.
 * Keep the copy true to what the app does (2026-10-19 rule).
 */

export const LOGO_PATH = "/ii-logo.png";

export const APP_METADATA = {
  name: "HomeGentic",
  description: "Your home's maintenance history, verified and kept in one place.",
  // Relative: II may fetch from the ic0.app, icp0.io or icp.net twin of the
  // canister, and checks the logo is on whichever origin answered.
  logo: LOGO_PATH,
};

const LIMITS = { name: 40, description: 120 };
const MAX_DOCUMENT_BYTES = 8 * 1024;
const ASCII_WHITESPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d]);
const INVISIBLE = /^[\s​-‍‎‏؜⁦-⁩]*$/u;

/** Why II would reject this text, or null. */
function textProblem(field, value) {
  if (typeof value !== "string") return `${field} must be a string`;
  const points = [...value];
  if (field in LIMITS && points.length > LIMITS[field]) {
    return `${field} is ${points.length} code points, over II's ${LIMITS[field]}`;
  }
  if (INVISIBLE.test(value)) return `${field} has no visible character`;
  let open = 0;
  for (const ch of points) {
    const cp = ch.codePointAt(0);
    if ((cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) && !ASCII_WHITESPACE.has(cp)) {
      return `${field} has control character U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (cp === 0xfeff || (cp >= 0x202a && cp <= 0x202e)) {
      return `${field} has U+${cp.toString(16).toUpperCase()}, which II rejects`;
    }
    if (cp >= 0x2066 && cp <= 0x2068) open++;
    if (cp === 0x2069 && --open < 0) return `${field} closes an isolate it never opened`;
  }
  if (open > 0) return `${field} leaves an isolate open`;
  return null;
}

/** Every reason II would ignore this document; empty when it is valid. */
export function appMetadataProblems(doc) {
  const problems = [];
  const known = ["name", "description", "logo"].filter((k) => k in doc);
  if (!known.length) problems.push("no field II recognises (name, description, logo)");
  for (const field of ["name", "description"]) {
    if (field in doc) {
      const p = textProblem(field, doc[field]);
      if (p) problems.push(p);
    }
  }
  if ("logo" in doc) {
    const logo = doc.logo;
    if (typeof logo !== "string" || !/^\/[^/\s]\S*$/.test(logo)) {
      problems.push("logo must be a non-empty relative path such as /logo.png (same origin as the document)");
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(doc) + "\n");
  if (bytes > MAX_DOCUMENT_BYTES) problems.push(`document is ${bytes} bytes, over II's 8 KiB`);
  return problems;
}

/** Width and height of a PNG, or null when the bytes aren't one. */
export function pngInfo(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
