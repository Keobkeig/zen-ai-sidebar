# Local Whisper helper

When a YouTube video has no caption track, the extension can transcribe it on
your machine with `faster-whisper`. Audio is downloaded to a temporary
directory, transcribed locally, and deleted before the helper exits.

## macOS setup

1. Ensure Python 3.10+ is installed.
2. From this directory, run `./install-macos.sh` for Zen/Firefox.
3. In the sidebar Settings, choose **Local Whisper** under **No-caption video fallback** and save.

The first transcription downloads Whisper's `small` model. That model remains
cached locally; each video's audio does not.

## Chrome setup

Chrome needs its extension ID in the native-host manifest. Load the Chrome
build once, copy its ID from `chrome://extensions`, then run:

```sh
./install-macos.sh YOUR_CHROME_EXTENSION_ID
```

## Chrome build

Chrome requires Manifest V3. Use `manifest.chrome.json` as the build manifest
(copy or rename it to `manifest.json` in a Chrome-specific packaging directory)
and load it as an unpacked extension. The normal `manifest.json` remains the
Firefox/Zen Manifest V2 build.

## Notes

- This helper accepts only public `youtube.com` and `youtu.be` HTTPS URLs.
- It relies on `yt-dlp` to retrieve audio and cannot transcribe private,
  members-only, DRM-protected, or region-blocked videos.
- The helper is local, but `yt-dlp` still contacts YouTube to retrieve the
  public audio stream.
