/**
 * Best-effort in-memory rate limiter (per server instance).
 * On serverless each instance keeps its own window, so this is a brake on
 * casual abuse, not a guarantee. Disabled outside production.
 */
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = Math.max(1, Number(process.env.RATE_LIMIT_PER_10MIN) || 12);

const hits = new Map<string, number[]>();

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Returns seconds to wait if limited, or 0 if the request may proceed */
export function rateLimit(ip: string): number {
  if (process.env.NODE_ENV !== "production") return 0;

  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }

  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing forever
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return 0;
}
