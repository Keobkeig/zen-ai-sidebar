// Zen AI Sidebar — YouTube Transcript Extraction
// Content script for YouTube watch pages
// Runs on the page itself so fetch() includes YouTube session cookies

(function () {
  "use strict";

  function decodeXmlEntities(text) {
    return text
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\n/g, " ");
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // Extract a JSON object or array without assuming what follows it. YouTube's
  // inline player data regularly changes its surrounding JavaScript, so a
  // balanced scan is substantially less brittle than a regular expression.
  function extractBalancedJson(text, startAt) {
    const start = text.slice(startAt).search(/[\[{]/);
    if (start < 0) return null;

    const first = startAt + start;
    const closing = text[first] === "{" ? "}" : "]";
    const stack = [closing];
    let inString = false;
    let escaped = false;

    for (let i = first + 1; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === stack[stack.length - 1]) {
        stack.pop();
        if (stack.length === 0) return text.slice(first, i + 1);
      }
    }
    return null;
  }

  function captionDataFromPlayerResponse(data) {
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;
    return { tracks, title: data?.videoDetails?.title || "" };
  }

  function captionDataFromText(text) {
    const playerMarker = text.indexOf("ytInitialPlayerResponse");
    if (playerMarker >= 0) {
      const raw = extractBalancedJson(text, playerMarker);
      if (raw) {
        try {
          const captionData = captionDataFromPlayerResponse(JSON.parse(raw));
          if (captionData) return captionData;
        } catch (e) {}
      }
    }

    const tracksMarker = text.indexOf('"captionTracks"');
    if (tracksMarker >= 0) {
      const raw = extractBalancedJson(text, tracksMarker);
      if (raw) {
        try {
          const tracks = JSON.parse(raw);
          if (Array.isArray(tracks) && tracks.length) {
            return { tracks, title: document.title.replace(/ - YouTube$/, "") };
          }
        } catch (e) {}
      }
    }
    return null;
  }

  // The player response can disappear from the live DOM after YouTube's SPA
  // hydration. Refetching the watch document is a same-origin, cookie-aware
  // fallback and avoids manipulating the visible YouTube transcript panel.
  async function getCaptionTracks() {
    for (const script of document.querySelectorAll("script")) {
      const captionData = captionDataFromText(script.textContent || "");
      if (captionData) return captionData;
    }

    try {
      const response = await fetch(window.location.href, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.ok) return captionDataFromText(await response.text());
    } catch (e) {}

    return null;
  }

  function selectCaptionTrack(tracks) {
    const languages = Array.from(new Set(
      (Array.isArray(navigator.languages) ? navigator.languages : [])
        .concat(navigator.language || "en")
        .filter(Boolean)
        .map(language => language.toLowerCase())
    ));

    return tracks.slice().sort((a, b) => scoreTrack(a) - scoreTrack(b))[0];

    function scoreTrack(track) {
      const language = (track.languageCode || "").toLowerCase();
      const exact = languages.indexOf(language);
      const partial = languages.findIndex(preferred =>
        language.startsWith(`${preferred.split("-")[0]}-`) ||
        preferred.startsWith(`${language}-`)
      );
      const languageScore = exact >= 0 ? exact : partial >= 0 ? 20 + partial : 100;
      // Creator-provided tracks tend to need less cleanup than ASR tracks.
      return languageScore + (track.kind === "asr" ? 0.5 : 0);
    }
  }

  function parseJson3Transcript(data) {
    const entries = [];
    for (const event of data?.events || []) {
      const text = decodeXmlEntities((event.segs || []).map(segment => segment.utf8 || "").join(""))
        .replace(/\s+/g, " ")
        .trim();
      const start = Number(event.tStartMs) / 1000;
      if (text && Number.isFinite(start)) {
        entries.push({ start, dur: Number(event.dDurationMs || 0) / 1000, text });
      }
    }
    return entries;
  }

  function parseXmlTranscript(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const entries = [];
    for (const el of doc.querySelectorAll("text")) {
      const text = decodeXmlEntities(el.textContent || "").trim();
      const start = parseFloat(el.getAttribute("start"));
      if (text && Number.isFinite(start)) {
        entries.push({ start, dur: parseFloat(el.getAttribute("dur") || "0"), text });
      }
    }
    return entries;
  }

  // JSON3 is the structured caption format that YouTube's player uses. Keep
  // XML as a compatibility fallback for tracks that decline JSON3.
  async function fetchTranscript(baseUrl) {
    const jsonUrl = new URL(baseUrl);
    jsonUrl.searchParams.set("fmt", "json3");
    try {
      const jsonResponse = await fetch(jsonUrl.href, { credentials: "include" });
      if (jsonResponse.ok) {
        const entries = parseJson3Transcript(await jsonResponse.json());
        if (entries.length) return entries;
      }
    } catch (e) {}

    const xmlResponse = await fetch(baseUrl, { credentials: "include" });
    if (!xmlResponse.ok) throw new Error("Caption track request failed");
    const entries = parseXmlTranscript(await xmlResponse.text());
    if (!entries.length) throw new Error("Caption track was empty");
    return entries;
  }

  // Fallback: scrape transcript from DOM (when transcript panel is open)
  function extractFromDOM() {
    const segments = document.querySelectorAll("ytd-transcript-segment-renderer");
    if (segments.length === 0) return null;

    const entries = [];
    for (const seg of segments) {
      const timeEl = seg.querySelector(".segment-timestamp");
      const textEl = seg.querySelector(".segment-text");
      if (timeEl && textEl) {
        const timeStr = timeEl.textContent.trim();
        const text = textEl.textContent.trim();
        const parts = timeStr.split(":").map(Number);
        let start = 0;
        if (parts.length === 3) start = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) start = parts[0] * 60 + parts[1];
        entries.push({ start, dur: 0, text });
      }
    }
    return entries.length > 0 ? entries : null;
  }

  // Main transcript extraction
  async function getTranscript() {
    const captionData = await getCaptionTracks();

    if (captionData) {
      const { tracks, title } = captionData;
      const track = selectCaptionTrack(tracks);

      if (track?.baseUrl) {
        try {
          const entries = await fetchTranscript(track.baseUrl);
          if (entries.length > 0) {
            const formatted = entries.map(e => `[${formatTime(e.start)}] ${e.text}`).join("\n");
            return {
              transcript: formatted,
              entries: entries.length,
              videoTitle: title || document.title.replace(/ - YouTube$/, ""),
              source: "youtube-captions",
              language: track.languageCode || "",
              autoGenerated: track.kind === "asr",
            };
          }
        } catch (e) {
          console.warn("Caption-track fetch failed:", e);
          // Fall through to DOM fallback
        }
      }
    }

    // Fallback: try DOM scraping
    const domEntries = extractFromDOM();
    if (domEntries && domEntries.length > 0) {
      const formatted = domEntries.map(e => `[${formatTime(e.start)}] ${e.text}`).join("\n");
      return {
      transcript: formatted,
      entries: domEntries.length,
      videoTitle: document.title.replace(/ - YouTube$/, ""),
      source: "youtube-transcript-panel",
      };
    }

    // No captions found — signal to use AI transcription fallback
    return {
      noCaptions: true,
      videoTitle: document.title.replace(/ - YouTube$/, ""),
      videoUrl: window.location.href,
    };
  }

  // Handle messages from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_YOUTUBE_TRANSCRIPT") {
      getTranscript().then(sendResponse);
      return true;
    }
    return false;
  });

  // Handle SPA navigation on YouTube
  window.addEventListener("yt-navigate-finish", () => {
    browser.runtime.sendMessage({
      type: "YOUTUBE_NAVIGATION",
      url: window.location.href,
    }).catch(() => {});
  });
})();
