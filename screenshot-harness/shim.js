// Minimal WebExtension shim, so sidebar/sidebar.html can be opened as an
// ordinary web page for screenshots and screen recordings.
//
// The sidebar only reaches for a handful of APIs: storage.local (settings and
// the selected theme), runtime.getURL (to fetch themes/<id>.json), runtime
// messaging (to talk to the background script), and commands (the hotkey
// editor). None of them exist outside an extension, so this provides just
// enough for the UI to render.
//
// It deliberately does NOT stub the Gemini call. There is no path here that
// reaches Google, and this harness should never be given an API key.
//
// Query parameters:
//   ?theme=<id>     preselect a palette
//   ?scene=<name>   load scenes/<name>.json: the page the sidebar is reading,
//                   the highlighted text, and a reply captured from a real
//                   session. Rendered as an already-finished conversation.
//   ?replay=1       instead of seeding the finished conversation, drive the
//                   UI: broadcast the selection, click Explain, and stream the
//                   captured reply back chunk by chunk. Every pixel comes from
//                   the extension's own code; only the timing is synthesized,
//                   and the reply is a recording rather than a live call.
//   ?delay=<ms>     how long to wait before the replay starts (default 1500),
//                   so a screen recorder has time to settle.
(function () {
	'use strict';

	const params = new URLSearchParams(location.search);
	const store = new Map();

	// ThemeManager.init reads this exact key, so nothing else needs faking.
	const requested = params.get('theme');
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

	// Loaded synchronously so storage is already seeded by the time sidebar.js
	// reads it.
	let scene = null;
	const sceneName = params.get('scene');
	const replay = params.get('replay') === '1';
	if (sceneName) {
		const req = new XMLHttpRequest();
		req.open('GET', `/screenshot-harness/scenes/${sceneName}.json`, false);
		req.send();
		scene = JSON.parse(req.responseText);
		if (!replay) {
			const id = 'harness';
			store.set('activeConvoId', id);
			store.set(`convo_${id}`, { id, messages: scene.messages, conversationHistory: [] });
		}
	}

	// The sidebar listens for background broadcasts; keep the real listener
	// list so a replay can push through the same path a background script uses.
	const listeners = [];
	const broadcast = (msg) => {
		for (const fn of listeners.slice()) fn(msg);
	};

	// Hand the captured reply back the way background.js streams a live one:
	// a run of CHAT_RESPONSE chunks, then done. The sidebar registers its
	// listener immediately after calling sendMessage, so the first chunk has to
	// be deferred -- which also stands in for time-to-first-token.
	function streamCapturedReply(requestId) {
		const reply = (scene.messages.find((m) => m.role === 'ai') || {}).text || '';
		const words = reply.split(/(\s+)/);
		const perChunk = scene.wordsPerChunk || 9;
		const every = scene.msPerChunk || 90;
		let i = 0;
		const step = () => {
			if (i >= words.length) {
				broadcast({ type: 'CHAT_RESPONSE', requestId, done: true });
				return;
			}
			broadcast({ type: 'CHAT_RESPONSE', requestId, chunk: words.slice(i, i + perChunk).join('') });
			i += perChunk;
			setTimeout(step, every);
		};
		setTimeout(step, scene.firstChunkMs || 900);
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
				if (!msg || !scene) return { ok: false, error: 'harness: no background script' };
				if (msg.type === 'GET_CONTEXT') return { pageContext: { meta: scene.page } };
				if (msg.type === 'CHAT_REQUEST' && replay) {
					streamCapturedReply(msg.requestId);
					return;
				}
				return { ok: false, error: 'harness: no background script' };
			},
			onMessage: {
				addListener(fn) {
					listeners.push(fn);
				},
				removeListener(fn) {
					const i = listeners.indexOf(fn);
					if (i >= 0) listeners.splice(i, 1);
				}
			},
			lastError: null
		},
		commands: {
			getAll: async () => [{ name: 'toggle-sidebar', shortcut: 'Ctrl+Shift+Z' }],
			update: async () => {}
		}
	};

	if (!scene) return;

	// sidebar.js registers its listeners partway through an async init(), which
	// can finish after window.load. Waiting for the first listener is the only
	// reliable signal that the UI is ready to be driven.
	const whenReady = (fn) => {
		const tick = () => (listeners.length ? fn() : setTimeout(tick, 25));
		tick();
	};

	window.addEventListener('load', () => {
		whenReady(() => {
			// SELECTION_UPDATE is what a content script sends when you highlight
			// text, so the banner and the Explain label come from the real
			// handler rather than from poking the DOM.
			if (scene.selection) {
				broadcast({ type: 'SELECTION_UPDATE', selection: scene.selection });
			}

			if (replay) {
				const delay = Number(params.get('delay') || 1500);
				setTimeout(() => {
					document.querySelector('#quickActions [data-action="explain"]').click();
				}, delay);
			}
		});

		if (replay) return;

		// Seeded conversations render all at once; the app's scroll-to-bottom
		// runs before layout settles, which cuts off the last line in a capture.
		const area = document.getElementById('messagesArea');
		setTimeout(() => (area.scrollTop = area.scrollHeight), 300);
	});
})();
