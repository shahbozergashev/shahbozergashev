"use client";

import { useEffect, useRef, useState } from "react";
import { persona, suggestedQuestions, ui, type Lang } from "@/lib/persona";
import Avatar from "./Avatar";
import Message, { type ChatMessage } from "./Message";

const LANG_KEY = "ask-shaha-lang";

export default function Chat() {
  const [lang, setLang] = useState<Lang>("uz");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = ui[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "uz" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function switchLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  }

  function updateLast(patch: (m: ChatMessage) => ChatMessage) {
    setMessages((prev) => [...prev.slice(0, -1), patch(prev[prev.length - 1])]);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages.filter((m) => !m.error && m.content), { role: "user" as const, content }];
    setMessages([...messages, { role: "user", content }, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? t.rateLimited : t.error);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let failed = false;
      let finished = false;
      let received = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "sources") updateLast((m) => ({ ...m, sources: event.sources }));
          else if (event.type === "text") {
            received = true;
            updateLast((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "error") failed = true;
          else if (event.type === "done") finished = true;
        }
      }
      if (!received && (failed || !finished)) throw new Error(t.error);
      // A cut-off stream (model stopped early, timeout, dropped connection) keeps the partial text.
      updateLast((m) => ({ ...m, streaming: false, incomplete: failed || !finished }));
    } catch (err) {
      updateLast((m) => ({ ...m, streaming: false, error: err instanceof Error ? err.message : t.error }));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-dvh">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={() => setMessages([])} className="flex items-center gap-2 min-w-0" title={t.newChat}>
          <Avatar size={30} />
          <span className="font-semibold truncate">Ask Shaha</span>
        </button>
        <div className="flex rounded-full border text-sm overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["uz", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
              className="px-3 py-1 uppercase"
              style={lang === l ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--muted)" }}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
          {empty ? (
            <div className="flex flex-col items-center text-center gap-3 pt-6 sm:pt-12">
              <Avatar size={72} />
              <h1 className="text-2xl font-semibold">{persona.name}</h1>
              <p className="max-w-md" style={{ color: "var(--muted)" }}>
                {persona.tagline[lang]}
              </p>
              <div className="flex gap-3 text-sm">
                {persona.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    {l.label}
                  </a>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 w-full mt-6">
                {suggestedQuestions[lang].slice(0, 6).map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-left text-sm rounded-xl border px-3.5 py-2.5 hover:opacity-80"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <Message
                key={i}
                message={m.streaming && !m.content ? { ...m, content: t.thinking } : m}
                sourcesLabel={t.sources}
                incompleteLabel={t.incomplete}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="max-w-2xl mx-auto flex items-end gap-2 rounded-2xl border px-3 py-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            maxLength={2000}
            rows={1}
            placeholder={t.placeholder}
            className="flex-1 resize-none bg-transparent outline-none py-1.5 max-h-40"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {t.send}
          </button>
        </form>
        <p className="max-w-2xl mx-auto text-center text-xs mt-2" style={{ color: "var(--muted)" }}>
          {t.disclaimer}
        </p>
      </footer>
    </div>
  );
}
