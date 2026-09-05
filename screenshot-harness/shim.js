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
//
// ?scene=<name> additionally loads scenes/<name>.json and replays it: the page
// the sidebar is reading, the highlighted selection, and a transcript captured
// from a real session. The UI renders it through its own code paths, so the
// result is a faithful screenshot rather than a mock-up.
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

	// A scene is a captured session: which page is open, what is highlighted,
	// and what the model replied. Loaded synchronously so storage is already
	// seeded by the time sidebar.js reads it.
	let scene = null;
	const sceneName = new URLSearchParams(location.search).get('scene');
	if (sceneName) {
		const req = new XMLHttpRequest();
		req.open('GET', `/screenshot-harness/scenes/${sceneName}.json`, false);
		req.send();
		scene = JSON.parse(req.responseText);
		const id = 'harness';
		store.set('activeConvoId', id);
		store.set(`convo_${id}`, { id, messages: scene.messages, conversationHistory: [] });
	}

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
			sendMessage: async (msg) => {
				// Only the page-context probe is answered; a chat request still
				// fails, because answering it would mean holding an API key.
				if (msg && msg.type === 'GET_CONTEXT' && scene) {
					return { pageContext: { meta: scene.page } };
				}
				return { ok: false, error: 'harness: no background script' };
			},
			onMessage: { addListener() {}, removeListener() {} },
			lastError: null
		},
		commands: {
			getAll: async () => [{ name: 'toggle-sidebar', shortcut: 'Ctrl+Shift+Z' }],
			update: async () => {}
		}
	};

	if (scene && scene.selection) {
		window.addEventListener('load', () => {
			const text = scene.selection;
			const preview = text.length > 60 ? text.slice(0, 60) + '\u2026' : text;
			document.getElementById('selectionText').textContent = `"${preview}"`;
			document.getElementById('selectionBanner').classList.remove('hidden');
			// The app scrolls to the newest message on render; do it again once
			// layout has settled, or the last line is cut off in a capture.
			const area = document.getElementById('messagesArea');
			setTimeout(() => (area.scrollTop = area.scrollHeight), 300);
		});
	}
})();
