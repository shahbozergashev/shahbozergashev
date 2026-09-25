"""
Downloads YouTube transcripts for Shaha Dolimov's channel plus the extra interview/podcast
URLs listed in data/youtube/videos.txt, saving each as data/youtube/<video_id>.md.

    pip install -r scripts/requirements.txt
    python scripts/download-youtube.py [--channel https://www.youtube.com/@shahadolimov]

Many Uzbek videos have no captions at all. Pass --gemini-fallback (needs the
GEMINI_* variables from .env.local exported: `set -a; source .env.local; set +a`) to download
the audio and have Gemini transcribe it instead.

Already-downloaded videos are skipped, so when YouTube starts returning 429 (it will),
wait ~20 minutes or switch networks (e.g. phone hotspot) and run it again.
"""
import argparse
import os
import pathlib
import re
import shutil
import sys
import time

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

OUT = pathlib.Path("data/youtube")
LANGS = ["uz", "ru", "en"]


def list_channel(url: str) -> list[str]:
    opts = {"extract_flat": True, "quiet": True, "skip_download": True}
    ids: list[str] = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        for tab in ("videos", "streams", "shorts"):
            try:
                info = ydl.extract_info(f"{url.rstrip('/')}/{tab}", download=False)
            except Exception as e:  # a channel may not have every tab
                print(f"skip {tab}: {e}", file=sys.stderr)
                continue
            ids += [e["id"] for e in info.get("entries", []) if e and e.get("id")]
    return ids


def extra_ids() -> list[str]:
    path = OUT / "videos.txt"
    if not path.exists():
        return []
    pattern = re.compile(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})")
    return [m.group(1) for line in path.read_text().splitlines() if (m := pattern.search(line))]


def video_meta(video_id: str) -> dict:
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    date = info.get("upload_date") or ""
    return {
        "title": info.get("title", video_id),
        "date": f"{date[:4]}-{date[4:6]}-{date[6:]}" if len(date) == 8 else "",
        "channel": info.get("channel", ""),
    }


def fetch_transcript(api: YouTubeTranscriptApi, video_id: str) -> tuple[str, str]:
    listing = api.list(video_id)
    try:
        t = listing.find_manually_created_transcript(LANGS)
    except NoTranscriptFound:
        t = listing.find_generated_transcript(LANGS)
    text = " ".join(s.text.replace("\n", " ") for s in t.fetch().snippets)
    return t.language_code, re.sub(r"\s+", " ", text).strip()


def gemini_models() -> list[str]:
    """Same model settings as the app: GEMINI_MODEL, then GEMINI_FALLBACK_MODEL (comma-separated)."""
    primary = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"
    fallbacks = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-flash-latest").split(",")
    return list(dict.fromkeys(m.strip() for m in [primary, *fallbacks] if m.strip()))


def gemini_generate(client, contents) -> str:
    """Tries each model, retrying overload (503) and rate-limit (429) errors with backoff."""
    last = None
    for model in gemini_models():
        for attempt in range(3):
            try:
                return client.models.generate_content(model=model, contents=contents).text or ""
            except Exception as e:
                last = e
                if not any(code in str(e) for code in ("429", "500", "503")):
                    break
                time.sleep(10 * 2**attempt)
        print(f"  Gemini model {model} unavailable, trying next: {str(last)[:120]}")
    raise RuntimeError(f"Gemini transcription failed: {last}")


def ffmpeg_location() -> str | None:
    """System ffmpeg if installed, else the binary bundled with the imageio-ffmpeg package."""
    if shutil.which("ffmpeg"):
        return None
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def gemini_transcribe(video_id: str) -> tuple[str, str]:
    from google import genai

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    tmp = OUT / ".audio"
    tmp.mkdir(exist_ok=True)
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(tmp / f"{video_id}.%(ext)s"),
        "quiet": True,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "64"}],
    }
    if location := ffmpeg_location():
        opts["ffmpeg_location"] = location
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    audio = tmp / f"{video_id}.mp3"
    try:
        uploaded = client.files.upload(file=str(audio))
        while uploaded.state and uploaded.state.name == "PROCESSING":
            time.sleep(5)
            uploaded = client.files.get(name=uploaded.name)
        text = gemini_generate(
            client,
            [
                uploaded,
                "Transcribe this audio verbatim in its original language (usually Uzbek, sometimes Russian "
                "or English). Output only the transcript text, no timestamps or commentary. On the very "
                "first line output only the ISO language code of the main language (uz, ru or en).",
            ],
        )
        client.files.delete(name=uploaded.name)
    finally:
        audio.unlink(missing_ok=True)
    first, _, rest = text.strip().partition("\n")
    lang = first.strip().lower()
    return (lang, rest.strip()) if lang in LANGS else ("uz", text.strip())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel", default="https://www.youtube.com/@shahadolimov")
    parser.add_argument("--gemini-fallback", action="store_true", help="transcribe caption-less videos with Gemini")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    ids = list(dict.fromkeys(list_channel(args.channel) + extra_ids()))
    print(f"{len(ids)} videos to check")
    api = YouTubeTranscriptApi()

    for i, vid in enumerate(ids, 1):
        dest = OUT / f"{vid}.md"
        if dest.exists():
            continue
        try:
            try:
                lang, text = fetch_transcript(api, vid)
            except (TranscriptsDisabled, NoTranscriptFound):
                if not args.gemini_fallback:
                    print(f"[{i}/{len(ids)}] {vid}: no captions, skipped (try --gemini-fallback)")
                    continue
                print(f"[{i}/{len(ids)}] {vid}: no captions, transcribing audio with Gemini...")
                lang, text = gemini_transcribe(vid)
            meta = video_meta(vid)
        except VideoUnavailable:
            print(f"[{i}/{len(ids)}] {vid}: unavailable, skipped")
            continue
        except Exception as e:
            if isinstance(e, RuntimeError) and str(e).startswith("Gemini"):
                print(f"[{i}/{len(ids)}] {vid}: {str(e)[:160]} (re-run later to retry)")
                continue
            if "429" in str(e) or "Too Many Requests" in str(e):
                sys.exit(f"Rate limited by YouTube at {vid}. Wait or change IP, then re-run.")
            print(f"[{i}/{len(ids)}] {vid}: {e}")
            continue
        title = meta["title"].replace('"', "'")
        dest.write_text(
            "---\n"
            f'title: "{title}"\n'
            f"url: https://www.youtube.com/watch?v={vid}\n"
            "type: youtube_transcript\n"
            f"language: {lang if lang in LANGS else 'uz'}\n"
            f"date: {meta['date']}\n"
            "---\n\n" + text + "\n"
        )
        print(f"[{i}/{len(ids)}] {vid}: saved ({lang}, {len(text)} chars) {meta['title']}")
        time.sleep(2)


if __name__ == "__main__":
    main()
