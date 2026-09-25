# Ask Shaha — workspace instructions

Unofficial AI clone of Shaha Dolimov (founder of Meraki Marketing Agency). Next.js 16 app that answers in his voice using RAG over his public content: Gemini embeddings → Supabase pgvector → Gemini 2.5 Flash, streamed with source cards.

## Commands

- Node 22+, Python 3.10+ (YouTube script only; `uv venv --python 3.12` works where Homebrew doesn't). ffmpeg comes from the `imageio-ffmpeg` pip package when none is installed, so don't require a system install.
- `npm install` · `npm run dev` · `npm run build` · `npm run typecheck`
- Data: `npm run fetch:telegram -- --channel=shahadolimov` and `python scripts/download-youtube.py [--gemini-fallback]` (Python deps: `pip install -r scripts/requirements.txt` inside a `.venv`).
- Load: `npx tsx --env-file=.env.local scripts/ingest.ts` (add `--dry-run` to only count chunks; it needs no keys).
- Before calling a change done, run `npm run typecheck` and `npm run build`.

## Setup order

1. `npm install`, copy `.env.example` to `.env.local`.
2. Supabase project → run `supabase/migrations/20260925000000_init.sql` in the SQL editor.
3. Fetch Telegram, then YouTube transcripts.
4. `--dry-run` ingest, then real ingest.
5. `npm run dev`, then deploy to Netlify with the same env vars.

Don't skip or reorder these steps. Ingest fails without the migration, and the app answers from nothing without ingested data.

## Secrets

- The only env vars are `GEMINI_API_KEY`, `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` (both optional), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. They live in `.env.local` (gitignored) locally and in Netlify's environment settings in production.
- Never ask for key values in chat, echo them or commit them. Tell the user where to get a key and which file to put it in, then continue once they confirm.
- Where to get them: Gemini from https://aistudio.google.com/apikey; Supabase from Project Settings → API (Project URL and the `service_role` key).
- The service role key is server-only. Never import `src/lib/supabase.ts` or `src/lib/gemini.ts` from a `"use client"` file, and never add a `NEXT_PUBLIC_` prefix to these variables.

## Architecture conventions

- **Chat model choice belongs in `.env.local`** (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`), not in code. A Gemini 429/503 is transient: `streamChat` already retries and falls back, so don't change the default model because of one.
- **Gemini is called over REST** in `src/lib/gemini.ts` (`batchEmbedContents`, `streamGenerateContent?alt=sse`). Don't add the Vercel AI SDK or `@google/genai` to the app.
- **Embeddings are 768-d** `gemini-embedding-001`, L2-normalized, with task type `RETRIEVAL_DOCUMENT` for ingest and `RETRIEVAL_QUERY` for search. Changing the model or dimension means a new migration (`vector(768)` column + `match_documents`) and a full re-ingest.
- **Chat protocol:** `POST /api/chat` with `{ lang: "uz" | "en", messages: [{ role, content }] }` returns NDJSON lines `{type:"sources"}`, `{type:"text"}`, then `{type:"done"}` or `{type:"error"}`. `src/components/Chat.tsx` parses it, so change both sides together.
- **Retrieval** lives in `src/app/api/chat/route.ts`: `match_documents` (vector) plus `keyword_documents` (full-text, best-effort), deduped. Schema changes go in a **new** file under `supabase/migrations/`; never edit the applied init migration.
- **Ingest is idempotent** by `chunk_key` (`<path under data/>#<index>`, or `#<postId>.<index>` for Telegram). It only embeds new or changed chunks and deletes stale ones, so re-running it after a Gemini 429 is the intended way to resume.

## Persona and content

- Persona facts, the system prompt, suggested questions and every UI string live in `src/lib/persona.ts`, with `uz` and `en` keys that must stay in sync. Uzbek is the default language and uses Latin script.
- Only state facts about Shaha that come from `data/` or a cited public source. Don't invent clients, numbers, dates or quotes, in the prompt or in data files.
- Keep the "unofficial AI clone" disclaimer in the UI and the system prompt's rule that it never claims to be the real person.
- Data files go in `data/<folder>/` (`bio`, `articles`, `interviews`, `linkedin`, `youtube`, `book`, `telegram`), as `.md`/`.txt` with optional front matter (`title`, `url`, `type`, `language`, `date`). See `data/README.md`.

## Style

- TypeScript strict; path alias `@/*` → `src/*`. Tailwind v4, with colors only through the CSS variables in `src/app/globals.css` (light + dark). Don't hard-code hex values in components.
- Comments are sparse and explain *why*. Match the surrounding code.

## Known environment limits

- Telegram and YouTube fetching must run on a normal network (a personal machine). Cloud sandboxes and CI runners commonly block these hosts or get rate-limited.
- YouTube returns 429 after a few dozen transcripts. The script skips finished videos, so wait ~20 min or switch networks and re-run. Don't add proxy or CAPTCHA workarounds.
