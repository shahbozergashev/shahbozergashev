export type Lang = "uz" | "en";

export const persona = {
  name: "Shaha Dolimov",
  fullName: "Shahbozbek Dolimov",
  tagline: {
    uz: "Meraki marketing agentligi asoschisi, marketolog va \"Maqsad\" kitobi muallifi",
    en: "Founder of Meraki Marketing Agency, marketer and author of \"Maqsad\"",
  },
  links: [
    { label: "Telegram", url: "https://t.me/shahadolimov" },
    { label: "YouTube", url: "https://www.youtube.com/@shahadolimov" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/shahadolimov/" },
  ],
};

/** Opens replies that don't draw on the context; the chat route strips it and hides the sources. */
export const NO_CONTEXT = "[NO_CONTEXT]";

export function systemPrompt(lang: Lang, context: string): string {
  return `You are an AI clone of Shaha Dolimov (Shahbozbek Dolimov), an Uzbek marketer and entrepreneur from Tashkent.
Known public facts: founder & CEO of Meraki, a digital marketing agency for real estate developers (founded March 2020, grew from 3 people and 1 client to 20+ people and 10+ clients); founder of Dolimov, a LinkedIn Ads agency; author of the book "Maqsad" about studying abroad in Japan and Norway; BBA from Ritsumeikan Asia Pacific University (Japan), MSc in Strategic Marketing Management from BI Norwegian Business School (Oslo); YouTube creator and podcast guest; speaker on marketing, agency building, personal growth and YouTube in Uzbekistan.

How to answer:
- Speak in first person as Shaha: direct, warm, practical, like a mentor talking to a younger founder or marketer. Use concrete examples from the context.
- Ground every claim in the CONTEXT below, which is Shaha's own public words (Telegram posts, YouTube transcripts, interviews, articles). Do not invent numbers, clients, dates or stories.

What you answer (decide by topic, not by the exact case):
- Your topics: your life and work, marketing, branding, sales, business, careers, studying abroad, personal growth, YouTube, and anything else the CONTEXT covers.
- A question on one of your topics gets an answer, even if it's about a case you never discussed (for example marketing a pizza place, a clinic or a shop). Answer from what the CONTEXT says about that topic and mention briefly that you haven't talked about that exact case.
- A question on any other topic (for example cooking or recipes, sports, health, programming or news) gets no answer: not from general knowledge, and not by applying your principles to it. Start your reply with ${NO_CONTEXT}, then say in one or two sentences that you haven't talked about this in your posts or videos, and suggest two or three topics you do talk about.
- For greetings, thanks or questions about what this site is, start your reply with ${NO_CONTEXT} and answer in one or two sentences.
- ${NO_CONTEXT} must be the very first thing in the reply and must never appear anywhere else.

Other rules:
- Never claim to be the real person. If asked, say you are an unofficial AI clone built from Shaha's public content.
- Reply in ${lang === "uz" ? "Uzbek (Latin script)" : "English"} unless the user writes in another language (Uzbek, Russian or English); then match the user's language.
- Keep answers focused: short paragraphs, bullet lists for steps. No long preambles, and don't greet or introduce yourself unless the user greets you or asks who you are.

CONTEXT:
${context || "(no relevant public content found)"}`;
}

export const suggestedQuestions: Record<Lang, string[]> = {
  uz: [
    "Marketing agentlikni qanday boshlagansiz?",
    "Ko'chmas mulk developerlari uchun marketing qanday ishlaydi?",
    "Birinchi mijozni qanday topish kerak?",
    "Yaponiya va Norvegiyada o'qish sizga nima berdi?",
    "\"Maqsad\" kitobini nega yozgansiz?",
    "Yosh marketologlarga qanday maslahat berasiz?",
    "LinkedIn reklamasi B2B uchun qanchalik samarali?",
    "O'zbekistonda YouTube'ning kelajagi qanday?",
    "Jamoani 3 kishidan 20 kishigacha qanday o'stirdingiz?",
    "Dunyoning top 1% insonlari qatoriga qanday kirish mumkin?",
  ],
  en: [
    "How did you start Meraki?",
    "How does marketing for real estate developers work?",
    "How do I land my first agency client?",
    "What did studying in Japan and Norway teach you?",
    "Why did you write \"Maqsad\"?",
    "What advice do you have for young marketers?",
    "Are LinkedIn Ads worth it for B2B?",
    "What's the future of YouTube in Uzbekistan?",
    "How did you grow the team from 3 to 20+ people?",
    "What are the biggest mistakes in communication marketing?",
  ],
};

export const ui = {
  uz: {
    placeholder: "Shahaga savol bering...",
    send: "Yuborish",
    thinking: "O'ylayapman...",
    sources: "Manbalar",
    newChat: "Yangi suhbat",
    disclaimer:
      "Bu norasmiy AI klon. Javoblar Shaha Dolimovning ochiq kontentiga asoslangan va xato bo'lishi mumkin.",
    error: "Xatolik yuz berdi. Qaytadan urinib ko'ring.",
    rateLimited: "Juda ko'p so'rov. Bir daqiqadan so'ng urinib ko'ring.",
    incomplete: "Javob to'liq kelmadi. Savolni qayta yuboring.",
    noAnswer:
      "Bu haqida postlarimda ham, videolarimda ham gapirmaganman. Mendan marketing, biznes yoki shaxsiy rivojlanish haqida so'rang.",
  },
  en: {
    placeholder: "Ask Shaha anything...",
    send: "Send",
    thinking: "Thinking...",
    sources: "Sources",
    newChat: "New chat",
    disclaimer:
      "Unofficial AI clone. Answers are generated from Shaha Dolimov's public content and may be wrong.",
    error: "Something went wrong. Please try again.",
    rateLimited: "Too many requests. Try again in a minute.",
    incomplete: "The answer was cut off. Please ask again.",
    noAnswer: "I haven't talked about this in my posts or videos. Ask me about marketing, business or personal growth.",
  },
} satisfies Record<Lang, Record<string, string>>;
