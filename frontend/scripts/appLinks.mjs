/**
 * Universal links (iOS) and verified App Links (Android) for the mobile app.
 *
 * The web build serves /.well-known/apple-app-site-association and
 * /.well-known/assetlinks.json so https://homegentic.app links to these paths
 * open the app when it's installed. Keep PATHS in step with
 * mobile/src/services/deepLinks.ts (UNIVERSAL_LINK_PATHS) and mobile/app.json;
 * appLinks.test.ts checks both.
 *
 * Each file is written only when its ids are set (they come from the Apple and
 * Play developer accounts):
 *   APPLE_TEAM_ID            e.g. ABCDE12345
 *   ANDROID_CERT_SHA256      the Play app-signing certificate's SHA-256
 *                            fingerprint(s), comma-separated, AA:BB:… form
 */
export const BUNDLE_ID = "app.homegentic.mobile";
export const PATHS = ["/dashboard", "/people", "/report/*", "/my-listing/*"];

export function appleAppSiteAssociation(teamId) {
  return {
    applinks: {
      details: [{ appIDs: [`${teamId}.${BUNDLE_ID}`], components: PATHS.map((p) => ({ "/": p })) }],
    },
  };
}

export function assetLinks(fingerprints) {
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: BUNDLE_ID, sha256_cert_fingerprints: fingerprints },
  }];
}

/** The files to write under dist/.well-known, by name; empty when no ids are set. */
export function wellKnownFiles(env) {
  const files = {};
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (teamId) files["apple-app-site-association"] = appleAppSiteAssociation(teamId);
  const prints = (env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (prints.length) files["assetlinks.json"] = assetLinks(prints);
  return files;
}
