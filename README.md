# Ask Shaha

An unofficial AI clone of **Shaha Dolimov** (Shahbozbek Dolimov): founder of Meraki Marketing Agency, founder of the Dolimov LinkedIn Ads agency, and author of *Maqsad*.
Ask it about marketing agencies, real-estate marketing, finding clients, LinkedIn Ads, studying abroad or personal growth, and it answers in his voice using his own public words, with source cards linking back to the Telegram post or video it drew from.

Inspired by Akbar's [Ask Akmal](https://github.com/AkbarDevop/ask-paiziev24) (an AI clone of Akmal Paiziev), rebuilt from scratch for Shaha.

> Not affiliated with or endorsed by Shaha Dolimov. Answers are AI-generated and can be wrong.

## How it works

```
question → Gemini embedding (768-d) → Supabase pgvector search + keyword fallback
         → top chunks as context → Gemini 2.5 Flash answers as Shaha → streamed reply + sources
```

This is RAG (retrieval-augmented generation): the model always reads Shaha's real content before answering instead of making things up. Vector search matches by *meaning* and works across Uzbek, Russian and English.

| Layer | Tech |
|---|---|
| App | Next.js 16 (App Router), React 19, Tailwind v4 |
| LLM + embeddings | Gemini 2.5 Flash, `gemini-embedding-001` via REST (free tier works) |
| Vector DB | Supabase Postgres + pgvector (HNSW) + full-text fallback |
| Hosting | Netlify (or Vercel) |

Features: Uzbek/English UI toggle, streaming answers, source cards, suggested questions, dark mode, mobile layout, input limits and per-IP rate limiting, and a server-only service key (nothing sensitive reaches the browser).

## Setup

**1. Install**

```bash
npm install
cp .env.example .env.local   # fill in GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

If Gemini answers `503 UNAVAILABLE` (overloaded) or `429`, chat retries with backoff and then tries `GEMINI_FALLBACK_MODEL`. Pick either model in `.env.local` with no code change.

**2. Database.** Create a Supabase project, then either run `supabase/migrations/20260925000000_init.sql` in the SQL editor, or `npx supabase link && npx supabase db push`.

**3. Collect data.** Run this on your own machine; it needs normal internet access to Telegram and YouTube.

```bash
# Telegram channel archive -> data/telegram/shahadolimov_oilasi.json
npm run fetch:telegram -- --channel=shahadolimov_oilasi

# YouTube transcripts -> data/youtube/<id>.md (channel + extra URLs in data/youtube/videos.txt)
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/download-youtube.py
# Many Uzbek videos have no captions. Transcribe those with Gemini (needs ffmpeg):
GEMINI_API_KEY=... python scripts/download-youtube.py --gemini-fallback
```

YouTube will start answering `429 Too Many Requests` after a few dozen videos. The script skips what's already downloaded, so wait ~20 minutes or switch networks (a phone hotspot works) and run it again.

Also add anything else he has said or written publicly (the Najot Ta'lim master class, LinkedIn posts, articles, the *Maqsad* book if you own it) as `.md` files. See [data/README.md](data/README.md) for the format.

**4. Embed + load**

```bash
npx tsx --env-file=.env.local scripts/ingest.ts --dry-run   # see chunk counts
npx tsx --env-file=.env.local scripts/ingest.ts
```

Only new or changed chunks get embedded, so if you hit the Gemini free-tier quota just run it again later and it resumes.

**5. Run and deploy**

```bash
npm run dev          # http://localhost:3000
npx netlify deploy --prod   # set the same env vars in Netlify first
```

## Project layout

```
src/app/api/chat/route.ts   retrieval + streaming chat endpoint (NDJSON: sources, text, done)
src/components/             Chat UI, message bubbles, source cards
src/lib/persona.ts          system prompt, suggested questions, UI strings (uz/en)
src/lib/gemini.ts           Gemini embeddings + streaming via REST
scripts/fetch-telegram.ts   public Telegram channel scraper
scripts/download-youtube.py YouTube transcript downloader (+ Gemini audio fallback)
scripts/ingest.ts           chunk → embed → upsert into Supabase
supabase/migrations/        schema, HNSW index, match_documents / keyword_documents
data/                       the knowledge base
```

## Customizing

To clone someone else, edit `src/lib/persona.ts` (facts, tone, questions), replace `data/`, and re-run ingest.
