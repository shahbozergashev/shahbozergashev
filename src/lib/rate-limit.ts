const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

/** Best-effort per-instance limiter; serverless instances each keep their own window. */
export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}
