# Zen AI Sidebar

Extension adding AI sidebar for [Zen Browser](https://zen-browser.app) and Firefox. Ask questions about the page you're viewing, summarize content, and get explanations for highlighted text, using your own Gemini API key.

![Zen AI Demo](assets/demo.gif)

## Features

- **Page-aware AI chat**: optionally includes the current page as context, with quoted supporting evidence in responses
- **Text selection detection**: highlight text and ask about it
- **Quick actions**: one-click Summarize, Explain, Key Points, Research Paper summary, and YouTube Transcript export
- **Catppuccin themes**: Latte, Frappe, Macchiato, and Mocha, plus Zen Browser auto-matching and custom theme import
- **Layout flip**: mirror the sidebar layout for left-side use
- **Customizable hotkey**: change the sidebar toggle shortcut from settings
- **Bring your own key**: uses your Gemini API key, with no intermediary server
- **Private no-caption transcripts**: optional Local Whisper fallback transcribes public YouTube audio on your machine
- **Rich answers**: safe GitHub-flavored Markdown, KaTeX math, tables, task lists, images, and syntax-highlighted code blocks with copy buttons

## Install

1. Open `about:debugging#/runtime/this-firefox` in Zen or Firefox
2. Click **"Load Temporary Add-on..."**
3. Select the `manifest.json` file from this repo
4. Toggle the sidebar with **Cmd+Shift+U** (Mac) or **Ctrl+Shift+U** (Windows/Linux)

## What leaves your browser

The extension has no backend. Requests go from your browser straight to the
Gemini endpoint using your own key, so there is no server of mine that sees
your pages or your key.

What *is* transmitted, and to whom:

| Data | Goes to | Can you turn it off? |
|---|---|---|
| Your typed question | Google (Gemini) | No — it is the request |
| Page title, URL and extracted text | Google (Gemini) | Yes — **Include page context** in Settings |
| Highlighted text | Google (Gemini) | Only sent for the **Explain** action |
| Video audio | Nothing leaves the machine when Local Whisper is the transcript provider | n/a |

That maps onto the manifest as `data_collection_permissions: { required:
["none"], optional: ["websiteContent", "websiteActivity"] }` — page data is
optional because the setting genuinely turns it off, not because it is
incidental.

## Distribution

This is **self-distributed, not listed on addons.mozilla.org**, and that is a
deliberate choice rather than an oversight.

The optional Local Whisper helper (`native-host/`) uses `yt-dlp` to pull audio
for videos that have no captions. That is squarely against YouTube's terms of
service, and AMO has removed listed extensions for less. Rather than cripple
the feature to get a listing, the helper lives outside the extension: it is a
separate program you install yourself, the extension only talks to it over
native messaging, and nothing downloads anything unless you have chosen to
install it.

If you do install it, you are the one making that call — which is the honest
place for the decision to sit.

The extension half is kept AMO-clean regardless (`npm run lint` reports zero
errors), so listing it later would only mean dropping the native-messaging
fallback.

## Setup

1. Get a Gemini API key from [aistudio.google.com](https://aistudio.google.com/apikey)
2. Open the sidebar → click the **gear icon**
3. Paste your API key → choose a model → **Save**

By default, the sidebar sends page content to Gemini only when you ask a question or use a quick action. Turn off **Include page content with requests** in Settings to send only your question (and highlighted text when you choose Explain).

For captionless YouTube videos, choose **Local Whisper** in Settings and follow the one-time setup in [native-host/README.md](native-host/README.md). It downloads temporary public-video audio, transcribes it locally, and removes the audio afterward. Gemini remains an opt-in cloud fallback.

## Chrome

The default `manifest.json` targets Zen/Firefox. Chrome uses Manifest V3 and
the Side Panel API; see [native-host/README.md](native-host/README.md) for the
Chrome manifest and Local Whisper host setup.

### Available Models

| Model | Best for |
|-------|----------|
| Gemini 3 Flash | General use (default) |
| Gemini 3.1 Flash Lite | Speed, lower cost |
| Gemini 3.1 Pro | Complex reasoning |

## Themes

Choose from the settings dropdown:

- **System / Light / Dark** — basic themes
- **Zen Browser** — auto-matches your browser theme
- **Catppuccin** — Latte, Frappe, Macchiato, Mocha
- **Custom** — import any theme JSON file

### Custom Theme Format

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "type": "dark",
  "colors": {
    "bg-primary": "#1e1e2e",
    "bg-secondary": "#181825",
    "bg-tertiary": "#313244",
    "bg-input": "#313244",
    "bg-user-msg": "#45475a",
    "text-primary": "#cdd6f4",
    "text-secondary": "#a6adc8",
    "text-muted": "#6c7086",
    "accent": "#89b4fa",
    "accent-light": "rgba(137, 180, 250, 0.1)",
    "border-color": "#45475a",
    "border-light": "#313244",
    "shadow-modal": "0 8px 30px rgba(0,0,0,0.4)"
  }
}
```

## Quick Actions

| Action | Description |
|--------|-------------|
| **Summarize** | Summarize the current page |
| **Explain** | Explain highlighted text or page content |
| **Key Points** | Extract bullet-point key points |
| **Research Paper** | Structured analysis (title, authors, abstract, methodology, findings, limitations, conclusion) — works on arxiv, PubMed, IEEE, and other academic sites |
| **Transcript** | Extract the viewer's preferred YouTube caption track with timestamps; when none is available, use Local Whisper (private) or opt in to Gemini transcription. The label identifies the source. |

## License

MIT
