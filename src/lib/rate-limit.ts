/**
 * Tiny in-memory per-IP rate limiter for the public API routes.
 *
 * Vercel serverless functions are stateless across instances, so this is
 * approximate (per warm instance, per region) — enough to blunt casual
 * abuse and protect the free Hobby function budget. It is not a substitute
 * for a durable store (e.g. Upstash) if abuse ever becomes serious.
 */
const buckets = new Map<string, number[]>();

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  // Keep memory bounded on long-lived instances.
  if (buckets.size > 5000) {
    const firstKey = buckets.keys().next().value;
    if (firstKey) buckets.delete(firstKey);
  }
  return { ok: true, retryAfterSeconds: 0 };
}
