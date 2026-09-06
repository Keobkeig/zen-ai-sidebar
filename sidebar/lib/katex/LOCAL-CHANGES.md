# Local changes to the vendored KaTeX

Only `katex.min.js` and `katex.min.css` are loaded (see `sidebar/sidebar.html`).
Everything else in the upstream distribution was removed to keep the packaged
extension small:

- `katex.js`, `katex.mjs`, `katex.css` — unminified duplicates, never referenced
- `contrib/` — auto-render, copy-tex, mhchem; none are used
- `fonts/*.woff`, `fonts/*.ttf` — superseded by woff2, which is listed first in
  every `@font-face` and is supported by every browser this extension targets
  (Firefox >= 109 per `manifest.json`, Chrome MV3). The now-dangling `woff`/
  `truetype` `url()` entries were stripped from `katex.min.css` to match.

On upgrade: drop in the full upstream release, then re-apply the above.
