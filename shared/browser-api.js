// Firefox exposes the Promise-based WebExtension API as `browser`; Chrome MV3
// exposes the same Promise API as `chrome`. Keep application code portable.
if (!globalThis.browser && globalThis.chrome) {
  globalThis.browser = globalThis.chrome;
}
