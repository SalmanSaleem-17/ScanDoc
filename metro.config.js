const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;
// Local Android build caches are large and must not be watched or resolved by Metro.
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\\]\.local-build[/\\].*/,
];

module.exports = config;
