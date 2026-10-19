// packages/shared (declarations, service types, session helpers) lives outside
// the app folder, so Metro has to watch it and resolve its import name.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../packages/shared");

config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@homegentic/shared": path.join(shared, "src"),
};

module.exports = config;
