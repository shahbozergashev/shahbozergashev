import { embed, streamChat, type ChatTurn } from "@/lib/gemini";
import { NO_CONTEXT, systemPrompt, ui, type Lang } from "@/lib/persona";
import { rateLimited } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 2000;
const MAX_TURNS = 40;

export type Source = {
  title: string;
  url: string | null;
  type: string;
  snippet: string;
  publishedAt: string | null;
};

type Row = {
  id: number;
  content: string;
  source_type: string;
  source_url: string | null;
  source_title: string | null;
  published_at: string | null;
  similarity: number;
};

async function retrieve(query: string): Promise<Row[]> {
  const db = supabase();
  const [embedding] = await embed([query], "RETRIEVAL_QUERY");
  const [vector, keyword] = await Promise.all([
    db.rpc("match_documents", { query_embedding: embedding, match_threshold: 0.45, match_count: 8 }),
    db.rpc("keyword_documents", { query, match_count: 4 }),
  ]);
  if (vector.error) throw vector.error;
  // Keyword search is a best-effort supplement; a malformed tsquery shouldn't fail the request.
  const rows = [...(vector.data as Row[]), ...((keyword.data as Row[] | null) ?? [])];
  const seen = new Set<number>();
  return rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, 10);
}

function toSources(rows: Row[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const r of rows) {
    const key = r.source_url ?? r.source_title ?? String(r.id);
    if (byUrl.has(key)) continue;
    byUrl.set(key, {
      title: r.source_title ?? r.source_type,
      url: r.source_url,
      type: r.source_type,
      snippet: r.content.slice(0, 180),
      publishedAt: r.published_at,
    });
  }
  return [...byUrl.values()].slice(0, 5);
}

function parseBody(body: unknown): { turns: ChatTurn[]; lang: Lang } | null {
  if (!body || typeof body !== "object") return null;
  const { messages, lang } = body as { messages?: unknown; lang?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    if (!content.trim() || content.length > MAX_MESSAGE_CHARS * 4) return null;
    turns.push({ role, content });
  }
  const last = turns[turns.length - 1];
  if (last.role !== "user" || last.content.length > MAX_MESSAGE_CHARS) return null;
  return { turns, lang: lang === "en" ? "en" : "uz" };
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  const parsed = parseBody(await req.json().catch(() => null));
  if (!parsed) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { turns, lang } = parsed;

  // Include the previous user turn so short follow-ups ("why?") still retrieve the right context.
  const userTurns = turns.filter((t) => t.role === "user").slice(-2);
  const query = userTurns.map((t) => t.content).join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const rows = await retrieve(query);
        const context = rows
          .map((r, i) => {
            const date = r.published_at ? `, ${r.published_at.slice(0, 10)}` : "";
            return `[${i + 1}] (${r.source_type}${date}: ${r.source_title ?? ""})\n${r.content}`;
          })
          .join("\n\n");

        // Hold back the first characters until we know whether the reply opens with NO_CONTEXT
        // (off-topic refusal or small talk), in which case the retrieved sources aren't shown.
        let head = "";
        let decided = false;
        let offTopic = false;
        let sentText = false;
        const emit = (text: string) => {
          const clean = text.replaceAll(NO_CONTEXT, "");
          if (!clean) return;
          sentText = true;
          send({ type: "text", text: clean });
        };
        const decide = () => {
          decided = true;
          const at = head.indexOf(NO_CONTEXT);
          offTopic = at !== -1 && !/[^\s*_`]/.test(head.slice(0, at));
          send({ type: "sources", sources: offTopic ? [] : toSources(rows) });
          emit(offTopic ? head.slice(at + NO_CONTEXT.length).replace(/^[\s*_`]+/, "") : head);
        };
        for await (const text of streamChat(systemPrompt(lang, context), turns)) {
          if (decided) emit(text);
          else if ((head += text).trimStart().length >= NO_CONTEXT.length + 4) decide();
        }
        if (!decided) decide();
        if (offTopic && !sentText) emit(ui[lang].noAnswer);
        send({ type: "done" });
      } catch (err) {
        console.error("chat error", err);
        send({ type: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
