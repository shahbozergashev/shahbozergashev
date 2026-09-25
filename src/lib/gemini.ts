const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

type TaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

export async function embed(texts: string[], taskType: TaskType): Promise<number[][]> {
  const res = await fetch(`${API}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    }),
  });
  if (!res.ok) {
    const err = new Error(`Gemini embed failed: ${res.status} ${await res.text()}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { embeddings: { values: number[] }[] };
  // Truncated gemini-embedding-001 vectors are not unit length; normalize for cosine search.
  return json.embeddings.map(({ values }) => {
    const norm = Math.hypot(...values) || 1;
    return values.map((v) => v / norm);
  });
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Streams generated text chunks from Gemini via server-sent events. */
export async function* streamChat(system: string, turns: ChatTurn[]): AsyncGenerator<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`${API}/${model}:streamGenerateContent?alt=sse&key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Gemini chat failed: ${res.status} ${await res.text()}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // Gemini may delimit events with \r\n\r\n; normalize before splitting.
    buffer = (buffer + value).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = JSON.parse(line.slice(5)) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (text) yield text;
      }
    }
  }
}
