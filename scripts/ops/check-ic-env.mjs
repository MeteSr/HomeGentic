#!/usr/bin/env node
// Post-deploy wiring probe (scripts/smoke-deployed.sh).
//
// The canisters learn their siblings' IDs from the PUBLIC_CANISTER_ID:<name>
// variables `icp deploy` stamps into every canister (Canisters.envId). A wrong
// or missing variable makes a canister fail closed, which looks like a
// permission error to users. The frontend canister carries the same variables
// in its ic_env cookie, so this reads that cookie from the deployed frontend
// and checks one variable per canister against canister_ids.json.
//
// Usage: node scripts/ops/check-ic-env.mjs <env> <headers-file> <canister...>
//   headers-file: the response headers of the frontend's index page
//   (curl -sS -D <file> -o /dev/null https://<frontend>.icp0.io/)
// Prints one line per problem and exits 1 when there is any.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The ic_env cookie's variables from raw response headers, or null when it isn't set. */
export function parseIcEnvCookie(headers) {
  for (const line of headers.split(/\r?\n/)) {
    const m = /^set-cookie:\s*ic_env=([^;]*)/i.exec(line);
    if (!m) continue;
    const out = {};
    for (const pair of decodeURIComponent(m[1]).split("&")) {
      const i = pair.indexOf("=");
      if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return out;
  }
  return null;
}

/** What is wrong with the variables, as sentences (empty when nothing is). */
export function wiringProblems(env, canisterIds, network, canisters) {
  if (!env)
    return ["the frontend sets no ic_env cookie, so the canisters' PUBLIC_CANISTER_ID variables can't be checked"];
  const out = [];
  for (const name of canisters) {
    const want = canisterIds[name]?.[network];
    if (!want) continue;
    const key = `PUBLIC_CANISTER_ID:${name}`;
    const got = env[key];
    if (got === undefined) out.push(`${key} is missing`);
    else if (got !== want) out.push(`${key} is ${got}, canister_ids.json has ${want}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [network, headersFile, ...canisters] = process.argv.slice(2);
  const ids = JSON.parse(readFileSync("canister_ids.json", "utf8"));
  const problems = wiringProblems(parseIcEnvCookie(readFileSync(headersFile, "utf8")), ids, network, canisters);
  for (const p of problems) console.log(p);
  process.exit(problems.length > 0 ? 1 : 0);
}
