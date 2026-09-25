"use client";

import ReactMarkdown from "react-markdown";
import type { Source } from "@/app/api/chat/route";
import Avatar from "./Avatar";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  error?: string;
};

const typeLabel: Record<string, string> = {
  telegram_post: "Telegram",
  youtube_transcript: "YouTube",
  linkedin_post: "LinkedIn",
  interview: "Interview",
  article: "Article",
  book: "Book",
  bio: "Bio",
};

export default function Message({ message, sourcesLabel }: { message: ChatMessage; sourcesLabel: string }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap break-words"
          style={{ background: "var(--user-bubble)", color: "var(--user-text)" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar size={32} />
      <div className="min-w-0 flex-1">
        {message.error ? (
          <p style={{ color: "var(--accent)" }}>{message.error}</p>
        ) : (
          <div className={`prose-chat break-words ${message.streaming ? "cursor" : ""}`}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {!message.streaming && message.sources && message.sources.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "var(--muted)" }}>
              {sourcesLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((s, i) => {
                const body = (
                  <>
                    <span className="font-medium">{typeLabel[s.type] ?? s.type}</span>
                    <span className="truncate" style={{ color: "var(--muted)" }}>
                      {s.title}
                      {s.publishedAt ? ` · ${s.publishedAt.slice(0, 10)}` : ""}
                    </span>
                  </>
                );
                const cls = "flex gap-1.5 max-w-full sm:max-w-[48%] text-xs rounded-lg border px-2.5 py-1.5";
                const style = { borderColor: "var(--border)", background: "var(--surface)" };
                return s.url ? (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.snippet} className={cls} style={style}>
                    {body}
                  </a>
                ) : (
                  <div key={i} title={s.snippet} className={cls} style={style}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
