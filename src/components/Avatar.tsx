import { persona } from "@/lib/persona";

export default function Avatar({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38, background: "var(--accent)", color: "var(--accent-text)" }}
      className="rounded-full grid place-items-center font-semibold shrink-0"
      aria-hidden
    >
      {persona.initials}
    </div>
  );
}
