// packages/shared (declarations, service types, session helpers) lives outside
// the app folder, so Metro has to watch it and resolve its import name.
const path = require("path");
// Sentry's wrapper around Expo's config adds debug IDs, so crash reports map
// back to source once source maps are uploaded (SENTRY_AUTH_TOKEN on EAS).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);
const shared = path.resolve(__dirname, "../packages/shared");

config.watchFolders = [...(config.watchFolders ?? []), shared];
// Files under packages/shared resolve their imports (incl. Babel's runtime
// helpers) from this app's node_modules; there is none above them.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, "node_modules"),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@homegentic/shared": path.join(shared, "src"),
};

module.exports = config;
