/**
 * POST /api/license/check — look up the caller's contractor licence number in
 * Florida DBPR's public licensee file and record what it says on the
 * contractor canister (contractor.relayRecordLicenseCheck).
 *
 * DBPR publishes each board's licensees as a free CSV download, refreshed
 * weekly (Chapter 119 public records). There is no lookup API, so we stream
 * the Construction Industry Licensing Board file and stop at the first row
 * whose licence-number column matches. Nothing is stored here but a 24-hour
 * KV cache of the lookup and a 1-hour per-caller throttle.
 *
 * Layout: DBPR's ReadMe describes a quote/comma-delimited file, one licensee
 * per row, columns (1-based) 1 board, 2 occupation, 3 licensee name, 4 DBA,
 * 5 class, 6–8 address, 9 city, 10 state, 11 zip, 12 county, 13 licence
 * number, 14 primary status, 15 secondary status, 16 original licensure,
 * 17 effective, 18 expiration. If no row has that many columns the file has
 * changed shape, and we report an error rather than "not found".
 *
 * Note DBPR leaves null-and-void, delinquent and involuntarily inactive
 * licences out of these files, so "not found" means "not a current or
 * voluntarily inactive licence in this file", never "fake".
 *
 * Session required (the route is in OFFCHAIN_OUTCALL_ROUTES); the licence
 * number and name come from the caller's own profile, never the body.
 */

import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../packages/shared/src/declarations/contractor";
import { getAgent } from "../paymentCanister";
import { hitCounter } from "./rateLimiter";

export const DBPR_CONSTRUCTION_URL =
  "https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv";
export const LOOKUP_CACHE_TTL_S = 86_400;
export const THROTTLE_TTL_S     = 3_600;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MIN_COLUMNS    = 18;

const COL = { occupation: 1, name: 2, dba: 3, cls: 4, license: 12, primary: 13, secondary: 14, expires: 17 } as const;

export interface DbprLicense {
  licenseNumber: string;
  found:         boolean;
  licenseeName:  string;
  dbaName:       string;
  licenseType:   string;
  status:        string;
  active:        boolean;
  expiresOn:     string;
  sourceDate:    string;
}

/** Uppercase, no spaces or dashes: "cgc 1234567" → "CGC1234567". */
export const normLicense = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/** Florida contractor licence numbers are 2–4 letters then digits (CGC1234567, EC13001234, CFC057890). */
export const looksLikeFlLicense = (s: string) => /^[A-Z]{2,4}\d{3,9}$/.test(normLicense(s));

/** One quote/comma-delimited line → fields. Handles "" escapes and commas in quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/** MM/DD/YYYY → YYYY-MM-DD; anything else is passed through trimmed. */
export function isoDate(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s.trim();
}

/** Current and active (DBPR's primary status "Current", secondary "Active"). */
export const isActive = (primary: string, secondary: string) =>
  /^current/i.test(primary) && /^active/i.test(secondary);

const NAME_NOISE = new Set(["LLC", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "THE", "OF", "AND", "LTD", "LLP", "PA", "DBA"]);
const nameTokens = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !NAME_NOISE.has(t));

/** Every word of the shorter name appears in the longer one ("SMITH, JOHN A" ~ "John Smith"). */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return short.every((t) => long.has(t));
}

/** Stream the file and return the row for `license`, or a not-found result. Throws when the file can't be read or has changed shape. */
export async function findInDbprFile(license: string, url: string, fetchImpl: typeof fetch = fetch): Promise<DbprLicense> {
  const lic = normLicense(license);
  const resp = await fetchImpl(url, { headers: { Accept: "text/csv,text/plain,*/*" } });
  if (!resp.ok || !resp.body) throw new Error(`DBPR ${resp.status}`);
  const lastMod = resp.headers.get("last-modified");
  const sourceDate = lastMod && !isNaN(Date.parse(lastMod)) ? new Date(lastMod).toISOString().slice(0, 10) : "";
  const notFound: DbprLicense = { licenseNumber: lic, found: false, licenseeName: "", dbaName: "", licenseType: "", status: "", active: false, expiresOn: "", sourceDate };

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let bytes = 0;
  let wellFormed = 0;
  const check = (line: string): DbprLicense | null => {
    if (!line.includes(lic) && !line.toUpperCase().includes(lic)) {
      // Cheap shape probe on a sample of lines so a moved column is caught.
      if (wellFormed < 5 && line.length > 0 && parseCsvLine(line).length >= MIN_COLUMNS) wellFormed++;
      return null;
    }
    const f = parseCsvLine(line);
    if (f.length < MIN_COLUMNS) return null;
    wellFormed++;
    if (normLicense(f[COL.license]) !== lic) return null;
    return {
      licenseNumber: lic, found: true,
      licenseeName: f[COL.name], dbaName: f[COL.dba],
      licenseType: [f[COL.occupation], f[COL.cls]].filter(Boolean).join(" · "),
      status: [f[COL.primary], f[COL.secondary]].filter(Boolean).join(", "),
      active: isActive(f[COL.primary], f[COL.secondary]),
      expiresOn: isoDate(f[COL.expires]),
      sourceDate,
    };
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_FILE_BYTES) throw new Error("DBPR file larger than expected");
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const hit = check(buf.slice(0, nl).replace(/\r$/, ""));
        buf = buf.slice(nl + 1);
        if (hit) return hit;
      }
    }
    if (buf) { const hit = check(buf); if (hit) return hit; }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (wellFormed === 0) throw new Error("DBPR file has an unexpected layout");
  return notFound;
}

export interface ContractorDeps {
  getProfile: (principal: string) => Promise<{ name: string; licenseNumber: string | null } | null>;
  record:     (principal: string, check: DbprLicense & { nameMatches: boolean }) => Promise<void>;
}

/** The contractor canister through the Worker's identity (must be registered with contractor.addLicenseRelay). */
export function canisterDeps(): ContractorDeps {
  const actor = async () => {
    const canisterId = process.env.CANISTER_ID_CONTRACTOR;
    if (!canisterId) throw new Error("CANISTER_ID_CONTRACTOR is not set");
    return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as any;
  };
  return {
    async getProfile(principal) {
      const res = await (await actor()).getContractor(Principal.fromText(principal));
      if (!("ok" in res)) return null;
      return { name: res.ok.name, licenseNumber: res.ok.licenseNumber[0] ?? null };
    },
    async record(principal, c) {
      const res = await (await actor()).relayRecordLicenseCheck(Principal.fromText(principal), {
        licenseNumber: c.licenseNumber, found: c.found, licenseeName: c.licenseeName, dbaName: c.dbaName,
        licenseType: c.licenseType, status: c.status, active: c.active, expiresOn: c.expiresOn,
        nameMatches: c.nameMatches, sourceDate: c.sourceDate,
      });
      if ("err" in res) throw new Error(`License record failed: ${Object.keys(res.err)[0]}`);
    },
  };
}

interface DbprEnv {
  RATE_LIMIT: KVNamespace;
  RATE_LIMITER?: DurableObjectNamespace;
  DBPR_LICENSE_FILE_URL?: string;
  DBPR_DAILY_DOWNLOADS?: string;
}

/**
 * CD-12 (cycle-drain audit 2026-10-31): each cache miss downloads and scans
 * DBPR's whole licensee file, and contractor accounts are free, so misses
 * across all users are capped per day (DBPR_DAILY_DOWNLOADS overrides).
 */
export const DEFAULT_DBPR_DAILY_DOWNLOADS = 200;

export async function checkLicense(
  principal: string,
  env: DbprEnv,
  deps: ContractorDeps = canisterDeps(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const throttleKey = `dbpr:rl:${principal}`;
  if (await env.RATE_LIMIT.get(throttleKey)) return { status: 429, body: { error: "You can check your licence once an hour." } };

  const profile = await deps.getProfile(principal);
  if (!profile) return { status: 404, body: { error: "Create your contractor profile first." } };
  if (!profile.licenseNumber || !looksLikeFlLicense(profile.licenseNumber)) {
    return { status: 400, body: { error: "Add a Florida licence number (for example CGC1234567) to your profile first." } };
  }
  const lic = normLicense(profile.licenseNumber);

  const cacheKey = `dbpr:lic:${lic}`;
  let found: DbprLicense;
  const cached = await env.RATE_LIMIT.get(cacheKey);
  if (cached) found = JSON.parse(cached);
  else {
    const n = parseInt(env.DBPR_DAILY_DOWNLOADS ?? "", 10);
    const limit = Number.isFinite(n) && n >= 0 ? n : DEFAULT_DBPR_DAILY_DOWNLOADS;
    const day = new Date().toISOString().slice(0, 10);
    if (!(await hitCounter(env, `dbpr:downloads:${day}`, limit, 2 * 86_400)).allowed) {
      return { status: 429, body: { error: "Licence checks are busy today. Try again tomorrow." } };
    }
    try {
      found = await findInDbprFile(lic, env.DBPR_LICENSE_FILE_URL || DBPR_CONSTRUCTION_URL, fetchImpl);
    } catch {
      return { status: 502, body: { error: "Couldn't read DBPR's licence file just now. Try again later." } };
    }
    await env.RATE_LIMIT.put(cacheKey, JSON.stringify(found), { expirationTtl: LOOKUP_CACHE_TTL_S });
  }

  const check = { ...found, nameMatches: found.found && (namesMatch(found.licenseeName, profile.name) || namesMatch(found.dbaName, profile.name)) };
  await deps.record(principal, check);
  await env.RATE_LIMIT.put(throttleKey, "1", { expirationTtl: THROTTLE_TTL_S });
  return { status: 200, body: { ...check, checkedAt: Date.now() } };
}
