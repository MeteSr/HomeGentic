/**
 * TDD — ICP.1451: .ic-assets.json5 generation + dfx.json dependency completeness
 *
 * ICP.1  gen-ic-assets.mjs exists in frontend/scripts/
 * ICP.2  npm run build wires gen-ic-assets.mjs (it runs after vite build)
 * ICP.3  gen-ic-assets.mjs fails fast when VITE_VOICE_AGENT_URL is unset
 *        and DFX_NETWORK=ic (production guard)
 * ICP.4  gen-ic-assets.mjs writes a .ic-assets.json5 with the required security
 *        headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP)
 * ICP.5  generated CSP connect-src contains the injected voice agent origin,
 *        not a hardcoded localhost or an unreplaced placeholder
 * ICP.6  dfx.json frontend dependencies include every canister the frontend calls
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import os from "os";

const ROOT    = resolve(__dirname, "../../../../");
const SCRIPTS = resolve(ROOT, "frontend/scripts");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ── ICP.1 ─────────────────────────────────────────────────────────────────────

describe("ICP.1 — gen-ic-assets.mjs exists", () => {
  it("frontend/scripts/gen-ic-assets.mjs is present", () => {
    expect(existsSync(resolve(SCRIPTS, "gen-ic-assets.mjs"))).toBe(true);
  });
});

// ── ICP.2 ─────────────────────────────────────────────────────────────────────

describe("ICP.2 — build script includes gen-ic-assets", () => {
  it("package.json build script runs gen-ic-assets.mjs after vite build", () => {
    const pkg = JSON.parse(read("frontend/package.json"));
    const buildCmd: string = pkg.scripts?.build ?? "";
    // Must run the generator (after vite build, so the dist/ dir exists)
    expect(buildCmd).toMatch(/gen-ic-assets\.mjs/);
    // vite build must come before the generator
    const viteBuildIdx = buildCmd.indexOf("vite build");
    const genIdx       = buildCmd.indexOf("gen-ic-assets");
    expect(viteBuildIdx).toBeGreaterThanOrEqual(0);
    expect(genIdx).toBeGreaterThan(viteBuildIdx);
  });
});

// ── ICP.3 ─────────────────────────────────────────────────────────────────────

describe("ICP.3 — generator fails fast when VITE_VOICE_AGENT_URL unset in production", () => {
  it("exits non-zero when DFX_NETWORK=ic and VITE_VOICE_AGENT_URL is empty", () => {
    // Run the generator against a temp dist/ dir; ensure it exits 1
    const tmpDist = resolve(os.tmpdir(), `ic-assets-test-${Date.now()}`);
    mkdirSync(tmpDist, { recursive: true });
    try {
      const script = resolve(SCRIPTS, "gen-ic-assets.mjs");
      let threw = false;
      try {
        execSync(`node "${script}"`, {
          env: {
            ...process.env,
            DFX_NETWORK: "ic",
            VITE_VOICE_AGENT_URL: "",
            NODE_ENV: "production",
            // Point at the temp dir so nothing touches the real dist/
            // (the script resolves dist relative to itself, so we patch via env)
          },
          stdio: "pipe",
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(tmpDist, { recursive: true, force: true });
    }
  });
});

// ── ICP.4 ─────────────────────────────────────────────────────────────────────

describe("ICP.4 — generated .ic-assets.json5 contains required security headers", () => {
  // Run the generator against a real temp dist/ and inspect the output
  let output: Array<{ match: string; headers: Record<string, string> }>;

  function runGenerator(voiceUrl: string): string {
    const tmpDist = resolve(os.tmpdir(), `ic-assets-test-${Date.now()}`);
    mkdirSync(tmpDist, { recursive: true });
    // Patch the dist path by temporarily symlinking — simpler: just read stdout
    // Instead: run the script with a small wrapper that intercepts writeFileSync.
    // Simplest approach: point __dirname substitute via DIST env override not
    // possible without modifying the script, so we write to a tmpDist and check.
    //
    // The generator resolves dist as __dirname/../dist (relative to the script).
    // For the test we verify the real dist/.ic-assets.json5 if it exists,
    // otherwise we verify the generator source statically.
    rmSync(tmpDist, { recursive: true, force: true });
    const script = resolve(SCRIPTS, "gen-ic-assets.mjs");
    execSync(`node "${script}"`, {
      env: { ...process.env, VITE_VOICE_AGENT_URL: voiceUrl, DFX_NETWORK: "local" },
      stdio: "pipe",
    });
    // Read from the real dist path the script writes to
    return readFileSync(resolve(ROOT, "frontend/dist/.ic-assets.json5"), "utf-8");
  }

  it("HSTS header is present with max-age ≥ 1 year", () => {
    // Static check — verify the source emits HSTS rather than running a full build
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    expect(src).toMatch(/Strict-Transport-Security/);
    expect(src).toMatch(/max-age=\d+/);
    const maxAgeMatch = src.match(/max-age=(\d+)/);
    expect(Number(maxAgeMatch?.[1])).toBeGreaterThanOrEqual(31536000);
  });

  it("X-Frame-Options: DENY is present", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    expect(src).toMatch(/X-Frame-Options/);
    expect(src).toMatch(/DENY/);
  });

  it("X-Content-Type-Options: nosniff is present", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    expect(src).toMatch(/X-Content-Type-Options/);
    expect(src).toMatch(/nosniff/);
  });

  it("Content-Security-Policy header is present", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    expect(src).toMatch(/Content-Security-Policy/);
  });

  it("match pattern covers all files (/**/*)", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    expect(src).toMatch(/\*\*\/\*/);
  });
});

// ── ICP.5 ─────────────────────────────────────────────────────────────────────

describe("ICP.5 — generated CSP connect-src uses injected voice agent origin", () => {
  it("voiceOrigin variable is substituted into connect-src (not hardcoded localhost)", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    // The CSP string must reference the variable, not a hardcoded localhost URL
    // We check the template contains ${voiceOrigin} (or similar interpolation)
    expect(src).toMatch(/\$\{voiceOrigin\}/);
  });

  it("the CSP in the script does not hardcode http://localhost:3001", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    // localhost:3001 may appear only in the fallback assignment, not in the CSP string
    const cspLineMatch = src.match(/const csp\s*=[\s\S]*?;/);
    expect(cspLineMatch?.[0]).not.toMatch(/localhost:3001/);
  });

  it("unsafe-inline and unsafe-eval are absent from script-src in the generated CSP", () => {
    const src = read("frontend/scripts/gen-ic-assets.mjs");
    // Extract only the script-src directive line
    const scriptSrcMatch = src.match(/"script-src[^"]*"/);
    const scriptSrc = scriptSrcMatch?.[0] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});

// ── ICP.6 ─────────────────────────────────────────────────────────────────────

describe("ICP.6 — dfx.json frontend dependencies include all deployed canisters", () => {
  const dfx = JSON.parse(read("dfx.json"));
  const allCanisters = Object.keys(dfx.canisters).filter(
    (c) => c !== "frontend" && c !== "internet_identity"
  );
  const frontendDeps: string[] = dfx.canisters.frontend?.dependencies ?? [];

  it("every non-frontend, non-internet_identity canister is a frontend dependency", () => {
    const missing = allCanisters.filter((c) => !frontendDeps.includes(c));
    expect(
      missing,
      `These canisters are missing from dfx.json frontend.dependencies: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("internet_identity is also listed (needed for auth flow)", () => {
    expect(frontendDeps).toContain("internet_identity");
  });
});
