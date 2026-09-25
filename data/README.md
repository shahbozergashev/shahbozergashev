# Knowledge base

Everything here is chunked, embedded and loaded into Supabase by `npm run ingest`.

| Folder | What goes in it | How to fill it |
|---|---|---|
| `bio/` | Bio / profile facts | Written by hand from public sources |
| `telegram/` | `<channel>.json` post archives | `npm run fetch:telegram -- --channel=shahadolimov` |
| `youtube/` | One `.md` transcript per video | `python scripts/download-youtube.py` |
| `articles/`, `interviews/`, `linkedin/`, `book/` | Anything else he has written or said publicly | Paste text into `.md` files |

Markdown files can start with front matter (all fields optional):

```
---
title: "Najot Ta'lim master class: opening a marketing agency"
url: https://najottalim.uz/blog/...
type: interview        # bio | article | interview | linkedin_post | telegram_post | youtube_transcript | book
language: uz           # uz | ru | en (auto-detected if omitted)
date: 2023-06-28
---
```
