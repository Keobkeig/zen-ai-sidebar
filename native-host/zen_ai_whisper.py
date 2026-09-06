#!/usr/bin/env python3
"""Native messaging host for private, local YouTube transcription.

The browser sends one public YouTube URL. This host downloads audio into a
temporary directory, transcribes it with faster-whisper, returns timestamped
segments, and removes the temporary directory before exiting.
"""

from __future__ import annotations

import json
import struct
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse


HOST_NAME = "com.zen_ai_sidebar.whisper"
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
MAX_MESSAGE_BYTES = 1_000_000


def read_message() -> dict:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) != 4:
        raise ValueError("Native host did not receive a complete message length.")
    length = struct.unpack("<I", raw_length)[0]
    if length > MAX_MESSAGE_BYTES:
        raise ValueError("Native host message is too large.")
    raw_message = sys.stdin.buffer.read(length)
    if len(raw_message) != length:
        raise ValueError("Native host did not receive a complete message.")
    return json.loads(raw_message.decode("utf-8"))


def send_message(message: dict) -> None:
    encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_MESSAGE_BYTES:
        raise ValueError("Transcript is too large for one browser response.")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def validate_youtube_url(video_url: str) -> None:
    parsed = urlparse(video_url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in ALLOWED_HOSTS:
        raise ValueError("Only public YouTube URLs can be transcribed locally.")


def download_audio(video_url: str, output_dir: Path) -> Path:
    from yt_dlp import YoutubeDL

    options = {
        "format": "bestaudio/best",
        "outtmpl": str(output_dir / "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
    }
    with YoutubeDL(options) as downloader:
        downloader.download([video_url])

    audio_files = [path for path in output_dir.iterdir() if path.is_file() and not path.name.endswith(".part")]
    if not audio_files:
        raise RuntimeError("yt-dlp did not produce an audio file.")
    return max(audio_files, key=lambda path: path.stat().st_size)


def transcribe(audio_path: Path, model_name: str) -> list[dict]:
    from faster_whisper import WhisperModel

    # int8 keeps the default small model usable on ordinary CPU-only laptops.
    model = WhisperModel(model_name, device="auto", compute_type="int8")
    segments, _ = model.transcribe(
        str(audio_path),
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
    )

    transcript = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            transcript.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": text})
    return transcript


def handle_request(request: dict) -> dict:
    if request.get("type") != "TRANSCRIBE_YOUTUBE":
        raise ValueError("Unsupported native-host request.")

    video_url = request.get("videoUrl")
    if not isinstance(video_url, str):
        raise ValueError("A YouTube video URL is required.")
    validate_youtube_url(video_url)

    model_name = request.get("model", "small")
    if model_name not in {"base", "small", "medium"}:
        model_name = "small"

    with tempfile.TemporaryDirectory(prefix="zen-ai-whisper-") as temporary_directory:
        audio_path = download_audio(video_url, Path(temporary_directory))
        segments = transcribe(audio_path, model_name)

    if not segments:
        raise RuntimeError("Whisper did not detect speech in this video.")
    return {"segments": segments, "model": model_name}


def main() -> None:
    try:
        send_message(handle_request(read_message()))
    except Exception as error:  # Native messaging requires a JSON response.
        print(f"{HOST_NAME}: {error}", file=sys.stderr)
        send_message({"error": f"Local Whisper failed: {error}"})


if __name__ == "__main__":
    main()
