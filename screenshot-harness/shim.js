// Minimal WebExtension shim, so sidebar/sidebar.html can be opened as an
// ordinary web page for screenshots.
//
// The sidebar only reaches for a handful of APIs: storage.local (settings and
// the selected theme), runtime.getURL (to fetch themes/<id>.json), runtime
// messaging (to talk to the background script), and commands (the hotkey
// editor). None of them exist outside an extension, so this provides just
// enough for the UI to render.
//
// It deliberately does NOT stub the Gemini call. Chat will fail if you try to
// send a message, which is correct: capturing the interface needs no API key,
// and this harness should never be given one.
(function () {
	'use strict';

	const store = new Map();

	// Preselect a theme via ?theme=catppuccin-mocha. ThemeManager.init reads
	// this exact key, so nothing else needs faking to capture a theme.
	const requested = new URLSearchParams(location.search).get('theme');
	if (requested) store.set('sidebarTheme', requested);

	const asObject = (keys) => {
		if (keys === null || keys === undefined) return Object.fromEntries(store);
		const names = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
		const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
		const out = {};
		for (const name of names) {
			out[name] = store.has(name) ? store.get(name) : defaults[name];
		}
		return out;
	};

	globalThis.browser = globalThis.chrome = {
		storage: {
			local: {
				get: async (keys) => asObject(keys),
				set: async (items) => {
					for (const [k, v] of Object.entries(items)) store.set(k, v);
				},
				remove: async (keys) => {
					for (const k of [].concat(keys)) store.delete(k);
				}
			}
		},
		runtime: {
			// Served from the extension root; theme-manager asks for
			// "themes/<id>.json", which is root-relative there.
			getURL: (path) => '/' + String(path).replace(/^\//, ''),
			sendMessage: async () => ({ ok: false, error: 'harness: no background script' }),
			onMessage: { addListener() {}, removeListener() {} },
			lastError: null
		},
		commands: {
			getAll: async () => [{ name: 'toggle-sidebar', shortcut: 'Ctrl+Shift+Z' }],
			update: async () => {}
		}
	};
})();
