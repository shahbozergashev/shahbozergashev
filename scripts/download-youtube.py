"""
Downloads YouTube transcripts for Shaha Dolimov's channel plus the extra interview/podcast
URLs listed in data/youtube/videos.txt, saving each as data/youtube/<video_id>.md.

    pip install -r scripts/requirements.txt
    python scripts/download-youtube.py [--channel https://www.youtube.com/@shahadolimov]

Many Uzbek videos have no captions at all. Pass --gemini-fallback (needs GEMINI_API_KEY and
ffmpeg) to download the audio and have Gemini transcribe it instead.

Already-downloaded videos are skipped, so when YouTube starts returning 429 (it will),
wait ~20 minutes or switch networks (e.g. phone hotspot) and run it again.
"""
import argparse
import os
import pathlib
import re
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
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    audio = tmp / f"{video_id}.mp3"
    try:
        uploaded = client.files.upload(file=str(audio))
        while uploaded.state and uploaded.state.name == "PROCESSING":
            time.sleep(5)
            uploaded = client.files.get(name=uploaded.name)
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded,
                "Transcribe this audio verbatim in its original language (usually Uzbek, sometimes Russian "
                "or English). Output only the transcript text, no timestamps or commentary. On the very "
                "first line output only the ISO language code of the main language (uz, ru or en).",
            ],
        )
        client.files.delete(name=uploaded.name)
    finally:
        audio.unlink(missing_ok=True)
    first, _, rest = (resp.text or "").strip().partition("\n")
    lang = first.strip().lower()
    return (lang, rest.strip()) if lang in LANGS else ("uz", (resp.text or "").strip())


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
