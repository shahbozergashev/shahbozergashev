export type Meta = {
  title?: string;
  url?: string;
  type?: string;
  language?: string;
  date?: string;
};

/** Parses a minimal `key: value` front matter block. */
export function parseFrontMatter(raw: string): { meta: Meta; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    if (value) meta[line.slice(0, idx).trim()] = value;
  }
  return { meta, body: raw.slice(match[0].length) };
}

export function detectLanguage(text: string): "uz" | "ru" | "en" {
  const letters = text.match(/\p{L}/gu) ?? [];
  const cyrillic = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c)).length;
  if (letters.length && cyrillic / letters.length > 0.3) {
    // Uzbek Cyrillic uses ў қ ғ ҳ, which Russian does not.
    return /[ўқғҳ]/i.test(text) ? "uz" : "ru";
  }
  const uzMarkers = text.match(/\b(va|bilan|uchun|bu|men|siz|qanday|emas|bo'l|o'z|g'|o'|sh|ch)\w*/gi) ?? [];
  return uzMarkers.length / Math.max(1, text.split(/\s+/).length) > 0.08 ? "uz" : "en";
}

/** Splits text into ~target-sized chunks on paragraph/sentence boundaries with overlap. */
export function chunkText(text: string, target = 1200, overlap = 200): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= target) return clean ? [clean] : [];

  const units = clean
    .split(/\n\n/)
    .flatMap((p) => (p.length > target ? p.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [p] : [p]))
    .flatMap((s) => (s.length > target ? s.match(new RegExp(`.{1,${target}}(\\s|$)`, "gs")) ?? [s] : [s]))
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 1 > target) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = tail.slice(tail.indexOf(" ") + 1) + " " + unit;
    } else {
      current = current ? `${current}\n${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
