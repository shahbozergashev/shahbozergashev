/**
 * Scrapes a public Telegram channel's web preview (t.me/s/<channel>) into data/telegram/<channel>.json.
 * Re-running merges new posts into the existing snapshot.
 *
 *   npx tsx scripts/fetch-telegram.ts --channel=shahadolimov_oilasi [--max-pages=200]
 */
import * as cheerio from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Post = { id: number; url: string; date: string | null; text: string };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const channel = args.channel ?? "shahadolimov_oilasi";
const maxPages = Number(args["max-pages"] ?? 200);
const outFile = path.join("data", "telegram", `${channel}.json`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(before?: number): Promise<Post[]> {
  const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (ask-shaha archiver)" } });
    if (res.status === 429) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const $ = cheerio.load(await res.text());
    const posts: Post[] = [];
    $(".tgme_widget_message[data-post]").each((_, el) => {
      const node = $(el);
      const id = Number(node.attr("data-post")?.split("/")[1]);
      const textNode = node.find(".tgme_widget_message_text").first();
      textNode.find("br").replaceWith("\n");
      const text = textNode.text().trim();
      if (!id || !text) return;
      posts.push({
        id,
        url: `https://t.me/${channel}/${id}`,
        date: node.find("time[datetime]").first().attr("datetime") ?? null,
        text,
      });
    });
    return posts;
  }
  throw new Error(`${url}: still rate limited after retries`);
}

async function main() {
  const existing: Post[] = await readFile(outFile, "utf8").then(JSON.parse).catch(() => []);
  const byId = new Map(existing.map((p) => [p.id, p]));

  let before: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const posts = await fetchPage(before);
    if (posts.length === 0) break;
    const fresh = posts.filter((p) => !byId.has(p.id));
    for (const p of posts) byId.set(p.id, p);
    const oldest = Math.min(...posts.map((p) => p.id));
    console.log(`page ${page + 1}: ${posts.length} posts (${fresh.length} new), oldest #${oldest}`);
    if (oldest <= 1 || oldest === before) break;
    before = oldest;
    await sleep(1500);
  }

  const all = [...byId.values()].sort((a, b) => a.id - b.id);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(all, null, 2) + "\n");
  console.log(`saved ${all.length} posts to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
