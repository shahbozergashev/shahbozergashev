export default function Avatar({ size = 36 }: { size?: number }) {
  return (
    // Decorative: the name is always shown next to it.
    <img
      src="/shaha.jpg"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-full object-cover shrink-0"
    />
  );
}
