/**
 * Chunks everything under data/, embeds it with Gemini and upserts it into Supabase.
 * Only new or changed chunks are embedded, so re-running after a quota error resumes cheaply.
 *
 *   npx tsx --env-file=.env.local scripts/ingest.ts [--dry-run]
 *
 * Inputs:
 *   data/**\/*.md|.txt       optional front matter: title, url, type, language, date
 *   data/telegram/*.json     output of scripts/fetch-telegram.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { embed } from "../src/lib/gemini";
import { supabase } from "../src/lib/supabase";
import { chunkText, detectLanguage, parseFrontMatter } from "./lib/chunk";

type Doc = {
  key: string;
  content: string;
  source_type: string;
  source_url: string | null;
  source_title: string | null;
  language: string;
  published_at: string | null;
};

const DATA = "data";
const BATCH = 50;
const dryRun = process.argv.includes("--dry-run");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const folderType: Record<string, string> = {
  bio: "bio",
  articles: "article",
  interviews: "interview",
  linkedin: "linkedin_post",
  youtube: "youtube_transcript",
  book: "book",
  telegram: "telegram_post",
};

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return files.flat();
}

function toIso(date?: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadDocs(file: string): Promise<Doc[]> {
  const rel = path.relative(DATA, file).split(path.sep).join("/");
  const folder = rel.split("/")[0];
  const raw = await readFile(file, "utf8");

  if (file.endsWith(".json") && folder === "telegram") {
    const posts = JSON.parse(raw) as { id: number; url: string; date: string | null; text: string }[];
    return posts
      .filter((p) => p.text.trim().length >= 40)
      .flatMap((p) =>
        chunkText(p.text).map((content, i) => ({
          key: `${rel}#${p.id}.${i}`,
          content,
          source_type: "telegram_post",
          source_url: p.url,
          source_title: `Telegram @${path.basename(file, ".json")} #${p.id}`,
          language: detectLanguage(p.text),
          published_at: toIso(p.date),
        })),
      );
  }

  if (!/\.(md|txt)$/.test(file) || /(README\.md|videos\.txt)$/i.test(file)) return [];
  const { meta, body } = parseFrontMatter(raw);
  const type = meta.type ?? folderType[folder] ?? "article";
  const language = meta.language ?? detectLanguage(body);
  return chunkText(body).map((content, i) => ({
    key: `${rel}#${i}`,
    // Prefix each chunk with its title so retrieval knows what the fragment is about.
    content: meta.title ? `${meta.title}\n\n${content}` : content,
    source_type: type,
    source_url: meta.url ?? null,
    source_title: meta.title ?? path.basename(file).replace(/\.\w+$/, ""),
    language,
    published_at: toIso(meta.date),
  }));
}

async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embed(texts, "RETRIEVAL_DOCUMENT");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 429 && status !== 503) throw err;
      if (attempt >= 30) throw new Error("Gemini quota still exhausted; run again later to resume.");
      console.log(`  Gemini rate limit (${status}); waiting 60s (attempt ${attempt})`);
      await sleep(60_000);
    }
  }
}

async function existingRows(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase()
      .from("documents")
      .select("chunk_key, content")
      .not("embedding", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) map.set(r.chunk_key, r.content);
    if (data.length < 1000) return map;
  }
}

async function main() {
  const files = await walk(DATA);
  const docs = (await Promise.all(files.map(loadDocs))).flat();
  const counts = docs.reduce<Record<string, number>>((acc, d) => ((acc[d.source_type] = (acc[d.source_type] ?? 0) + 1), acc), {});
  console.log(`${docs.length} chunks from ${files.length} files`, counts);
  if (dryRun) return;

  const db = supabase();
  const existing = await existingRows();
  const todo = docs.filter((d) => existing.get(d.key) !== d.content);
  console.log(`${docs.length - todo.length} unchanged, ${todo.length} to embed`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await embedWithRetry(batch.map((d) => d.content));
    const { error } = await db.from("documents").upsert(
      batch.map(({ key, ...d }, j) => ({ ...d, chunk_key: key, embedding: vectors[j] })),
      { onConflict: "chunk_key" },
    );
    if (error) throw error;
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }

  // Remove chunks whose source file or text was deleted/shortened.
  const keep = new Set(docs.map((d) => d.key));
  const stale = [...existing.keys()].filter((k) => !keep.has(k));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await db.from("documents").delete().in("chunk_key", stale.slice(i, i + 200));
    if (error) throw error;
  }
  console.log(`done. removed ${stale.length} stale chunks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
