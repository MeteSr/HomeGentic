#!/usr/bin/env node
/**
 * Checks that the public permit feeds the voice Worker reads
 * (agents/voice/src/offchainOutcalls.ts, importPermits) still have the fields
 * it queries and the frontend parses (frontend/src/services/permitImport.ts).
 * These feeds change without notice; the weekly run catches it.
 *
 *   node scripts/ci/check-permit-feeds.mjs
 */

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what); };

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ── City of Orlando (Socrata ryhf-m453) ──────────────────────────────────────
const ORLANDO_FIELDS = [
  "permit_number", "application_type", "worktype", "permit_address", "application_status",
  "issue_permit_date", "final_date", "estimated_cost", "contractor", "project_name",
];
const ORLANDO_TYPES = ["Building Permit", "Electrical", "Plumbing", "Mechanical Permit", "GAS", "Demolition Permit"];
try {
  const view = await getJson("https://data.cityoforlando.net/api/views/ryhf-m453.json");
  const cols = new Set((view.columns ?? []).map((c) => c.fieldName));
  for (const f of ORLANDO_FIELDS) check(cols.has(f), `Orlando column ${f}`);
  const types = await getJson("https://data.cityoforlando.net/resource/ryhf-m453.json?$select=application_type&$group=application_type&$limit=200");
  const seen = new Set(types.map((t) => t.application_type));
  for (const t of ORLANDO_TYPES) check(seen.has(t), `Orlando application_type '${t}'`);
  // The same query the Worker sends, for an address with a known permit history.
  const where = `upper(permit_address) like '1 E YALE%' AND application_type in(${ORLANDO_TYPES.map((t) => `'${t}'`).join(",")}) AND issue_permit_date IS NOT NULL`;
  const rows = await getJson(`https://data.cityoforlando.net/resource/ryhf-m453.json?$where=${encodeURIComponent(where)}&$limit=5`);
  check(rows.length > 0 && rows.every((r) => r.permit_number && r.issue_permit_date), "Orlando address query returns issued permits");
} catch (e) {
  check(false, `Orlando feed reachable (${e.message})`);
}

// ── Volusia County (ArcGIS CurrentProjects layer 1) ──────────────────────────
const VOLUSIA_FIELDS = ["FOLDERNAME", "FOLDERTYPE", "STATUSDESC", "INDATE", "FOLDERDESCRIPTION"];
try {
  const layer = await getJson("https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1?f=json");
  const fields = new Set((layer.fields ?? []).map((f) => f.name));
  for (const f of VOLUSIA_FIELDS) check(fields.has(f), `Volusia field ${f}`);
} catch (e) {
  check(false, `Volusia feed reachable (${e.message})`);
}

if (failures.length) {
  console.error(`\n${failures.length} permit feed check(s) failed.`);
  process.exit(1);
}
