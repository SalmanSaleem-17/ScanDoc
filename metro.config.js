const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;
// Local Android build caches are large and must not be watched or resolved by
// Metro. Gradle output under android/ changes constantly during native builds;
// on Windows without Watchman, letting Metro crawl and watch it can freeze the
// dev server entirely.
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\]\.local-build[/\].*/,
  /[/\]android[/\]build[/\].*/,
  /[/\]android[/\]app[/\]build[/\].*/,
  /[/\]android[/\]\.gradle[/\].*/,
];
module.exports = config;
